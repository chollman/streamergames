const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const Channel = require("../models/Channel");
const SeatQueueEntry = require("../models/SeatQueue");
const {
  enqueue,
  listActive,
  positionFor,
  offerSeat,
  kickEntry,
  leaveQueue,
  verifyQueueToken,
} = require("../services/seatQueue");
const Session = require("../models/Session");
const { seatFromQueueEntry } = require("../services/sessions");

const router = express.Router();

// Public: enqueue by nickname. A signed-in user's Authorization header is
// honored (their entry is tied to their user id) — otherwise it's a guest
// entry identified solely by the returned queueToken.
router.post(
  "/:slug/queue",
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) {
      throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    }
    // If a Bearer arrived and the protect middleware already set req.user,
    // use it. Otherwise pass user: null and the service treats it as a
    // guest. `protect` isn't in the chain here on purpose — this route is
    // primarily for guests.
    const user = req.user || null;
    const { entry, queueToken } = await enqueue({
      channel,
      nickname: (req.body && req.body.nickname) || "",
      user,
    });
    const position = await positionFor(channel._id, entry._id);
    res.status(201).json({
      entry: {
        _id: entry._id,
        nickname: entry.nickname,
        status: entry.status,
        karma: entry.karma,
        position,
      },
      queueToken,
    });
  })
);

// Owner-only: list the active queue on this channel. Used by the streamer's
// panel.
router.get(
  "/:slug/queue",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const entries = await listActive(channel._id);
    res.json({
      queue: entries.map((e) => ({
        _id: e._id,
        nickname: e.nickname,
        status: e.status,
        karma: e.karma,
        offerExpiresAt: e.offerExpiresAt,
        userId: e.userId,
        createdAt: e.createdAt,
      })),
    });
  })
);

// The entrant's own view: position + status. Authenticated by the
// queueToken they got at enqueue time (Bearer). Signed-in users could
// also use their user JWT here, but they still need the entry id, so
// the queueToken flow is what the client uses.
router.get(
  "/:slug/queue/me",
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    const auth = req.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const decoded = match ? verifyQueueToken(match[1]) : null;
    if (!decoded || decoded.channelSlug !== channel.slug) {
      throw httpError(401, req.t("errors:unauthorized"), { code: "no_token" });
    }
    const entry = await SeatQueueEntry.findById(decoded.entryId);
    if (!entry) throw httpError(404, req.t("errors:not_found"), { code: "entry_not_found" });
    if (entry.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    const position = entry.status === "waiting" ? await positionFor(channel._id, entry._id) : null;
    res.json({
      entry: {
        _id: entry._id,
        nickname: entry.nickname,
        status: entry.status,
        karma: entry.karma,
        offerExpiresAt: entry.offerExpiresAt,
        offeredSessionId: entry.offeredSessionId,
        position,
      },
    });
  })
);

// Streamer kicks an entry from the queue.
router.delete(
  "/:slug/queue/:entryId",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    // Guard: entry must belong to this channel — the streamer cannot kick
    // someone from a different channel by ID.
    const entry = await SeatQueueEntry.findById(req.params.entryId);
    if (!entry) throw httpError(404, req.t("errors:not_found"), { code: "entry_not_found" });
    if (entry.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    const updated = await kickEntry({ entryId: entry._id });
    res.json({ entry: { _id: updated._id, status: updated.status } });
  })
);

// The entrant leaves the queue voluntarily. Authenticated by the
// queueToken (same pattern as /me).
router.post(
  "/:slug/queue/leave",
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    const auth = req.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const decoded = match ? verifyQueueToken(match[1]) : null;
    if (!decoded || decoded.channelSlug !== channel.slug) {
      throw httpError(401, req.t("errors:unauthorized"), { code: "no_token" });
    }
    const entry = await SeatQueueEntry.findById(decoded.entryId);
    if (!entry) throw httpError(404, req.t("errors:not_found"), { code: "entry_not_found" });
    if (entry.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    const updated = await leaveQueue({ entryId: entry._id });
    res.json({ entry: { _id: updated._id, status: updated.status } });
  })
);

// Streamer offers a seat in a specific session to a queue entry. Verifies
// the caller owns the channel and the session, then transitions the entry
// to 'offered' with a TTL. The entrant's client picks this up via /me
// polling (F2c) or via socket seat:offered (F2c later).
router.post(
  "/:slug/sessions/:sessionId/offer/:entryId",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await Session.findById(req.params.sessionId);
    if (!session) throw httpError(404, req.t("errors:not_found"), { code: "session_not_found" });
    if (session.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    if (session.status !== "lobby") {
      throw httpError(400, "session is not accepting new seats", { code: "session_not_in_lobby" });
    }
    // Guard: the entry must belong to this channel.
    const SeatQueueEntry = require("../models/SeatQueue");
    const entry = await SeatQueueEntry.findById(req.params.entryId);
    if (!entry) throw httpError(404, req.t("errors:not_found"), { code: "entry_not_found" });
    if (entry.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    const ttlSeconds = Number.isFinite(req.body && req.body.ttlSeconds)
      ? req.body.ttlSeconds
      : 30;
    const updated = await offerSeat({
      entryId: entry._id,
      sessionId: session._id,
      ttlSeconds,
    });
    res.json({
      entry: {
        _id: updated._id,
        status: updated.status,
        offerExpiresAt: updated.offerExpiresAt,
        offeredSessionId: updated.offeredSessionId,
      },
    });
  })
);

// The entrant accepts an active offer. Auth is by queueToken. Server
// consumes the offer, creates a digital seat in the offer's session, and
// returns { session, seat, guestToken } — the client then hits /sesion/:id
// with the guestToken.
router.post(
  "/:slug/queue/accept",
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    const auth = req.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const decoded = match ? verifyQueueToken(match[1]) : null;
    if (!decoded || decoded.channelSlug !== channel.slug) {
      throw httpError(401, req.t("errors:unauthorized"), { code: "no_token" });
    }
    const SeatQueueEntry = require("../models/SeatQueue");
    const entry = await SeatQueueEntry.findById(decoded.entryId);
    if (!entry) throw httpError(404, req.t("errors:not_found"), { code: "entry_not_found" });
    if (entry.channel.toString() !== channel._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "wrong_channel" });
    }
    const result = await seatFromQueueEntry({ entry });
    res.status(201).json({
      session: result.session,
      seat: result.seat,
      guestToken: result.guestToken,
    });
  })
);

module.exports = router;
