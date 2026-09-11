const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const emitSessionEvent = require("../utils/emitSessionEvent");
const emitQueueEvent = require("../utils/emitQueueEvent");
const Channel = require("../models/Channel");
const {
  createSessionForStreamer,
  getActiveSessionForChannel,
  abandonAllActiveSessionsForChannel,
} = require("../services/sessions");
const { listActive } = require("../services/seatQueue");

// Fires the "queue changed" event to the channel's public queue room so
// every subscriber (streamer's panel, digitals on /canal, spectators)
// invalidates its local cache. Mirrors the same helper in routes/queue.js
// — kept inline here to avoid crossing module boundaries for one helper.
async function emitQueueUpdated(req, channel) {
  const io = req.app.get("io") || null;
  if (!io) return;
  const entries = await listActive(channel._id);
  emitQueueEvent(
    io,
    "seat-queue:updated",
    {
      channelSlug: channel.slug,
      queue: entries.map((e) => ({
        _id: e._id,
        nickname: e.nickname,
        status: e.status,
        karma: e.karma,
        offerExpiresAt: e.offerExpiresAt,
        userId: e.userId,
        createdAt: e.createdAt,
      })),
    },
    { rooms: [`channel:${channel.slug}:queue`] }
  );
}

const router = express.Router();

// Create a session on the caller's own channel. Only the channel's owner
// can do this — the frontend never asks the user to pick a channel; there's
// exactly one per streamer at MVP. The service refuses (409) if the channel
// already has an active session.
router.post(
  "/:slug/sessions",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await createSessionForStreamer({
      channel,
      streamerUser: req.user,
      gameId: req.body && req.body.gameId,
    });
    res.status(201).json({ session });
  })
);

// Return the channel's currently active session (lobby or in_progress),
// or 204 if there is none. Only the channel owner can call this — the
// dashboard uses it to decide whether to show "Continue" or "Create".
router.get(
  "/:slug/sessions/active",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await getActiveSessionForChannel(channel._id);
    if (!session) return res.status(204).end();
    res.json({ session });
  })
);

// Bulk-abandon: closes every lobby / in_progress session on the channel.
// The dashboard's "cancel and create new" button hits this before creating
// so a channel with residual lobbies (created before the per-channel guard
// existed, or from a bug) can still be recovered in one click.
router.post(
  "/:slug/sessions/abandon-active",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const result = await abandonAllActiveSessionsForChannel({
      channel,
      streamerUser: req.user,
    });
    // Tell each abandoned session's public room that the game is over so
    // any digital or spectator still viewing it navigates out of the zombie
    // page instead of staring at stale state. Payload carries channelSlug
    // so the client can send them back to /canal/<slug>.
    const io = req.app.get("io") || null;
    for (const sid of result.sessionIds) {
      await emitSessionEvent(
        io,
        sid,
        "session:ended",
        { reason: "abandoned", channelSlug: channel.slug },
        { rooms: [`session:${sid}`] }
      );
    }
    // seatQueueSvc.cleanupForSession ran inside the service and just
    // flipped seated entries to 'left' (offered → waiting). Everyone
    // watching the channel's queue room needs to know so their cached
    // /queue and /queue/me refresh.
    await emitQueueUpdated(req, channel);
    res.json({ count: result.count, sessionIds: result.sessionIds });
  })
);

module.exports = router;
