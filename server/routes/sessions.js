const express = require("express");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const emitSessionEvent = require("../utils/emitSessionEvent");
const emitQueueEvent = require("../utils/emitQueueEvent");
const Session = require("../models/Session");
const User = require("../models/User");
const Channel = require("../models/Channel");
const {
  joinAsGuest,
  startSession,
  submitAction,
  viewForRequest,
  abandonSession,
} = require("../services/sessions");
const { listActive } = require("../services/seatQueue");
const { JWT_SECRET } = require("../config/env");

const router = express.Router();

// Optional-auth: decodes a Bearer token if present (user OR guest). Never
// fails — anonymous requests continue as `caller.kind === 'anon'`.
async function resolveCaller(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { kind: "anon" };
  try {
    const decoded = jwt.verify(match[1], JWT_SECRET);
    if (decoded.guest) {
      return { kind: "guest", playerId: decoded.playerId, sessionId: decoded.sessionId };
    }
    if (decoded.userId) {
      const user = await User.findById(decoded.userId);
      if (user) return { kind: "user", userId: user._id, user };
    }
    return { kind: "anon" };
  } catch (_e) {
    return { kind: "anon" };
  }
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const session = await Session.findById(req.params.id);
    if (!session) throw httpError(404, req.t("errors:not_found"), { code: "session_not_found" });
    const caller = await resolveCaller(req);
    const view = viewForRequest(session, caller);
    // Look up the channel slug so a client reopening an abandoned
    // session can navigate back to /canal/<slug> without an extra fetch.
    const channel = await Channel.findById(session.channel, { slug: 1 });
    res.json({ session, view, channelSlug: channel && channel.slug });
  })
);

router.post(
  "/:id/join",
  asyncHandler(async (req, res) => {
    const { nickname } = req.body || {};
    const { session, seat, guestToken } = await joinAsGuest({
      sessionId: req.params.id,
      nickname,
      io: req.app.get("io") || null,
    });
    res.status(201).json({ session, seat, guestToken });
  })
);

router.post(
  "/:id/start",
  protect,
  asyncHandler(async (req, res) => {
    const session = await startSession({
      sessionId: req.params.id,
      streamerUser: req.user,
      io: req.app.get("io") || null,
    });
    res.json({ session });
  })
);

router.post(
  "/:id/abandon",
  protect,
  asyncHandler(async (req, res) => {
    const session = await abandonSession({
      sessionId: req.params.id,
      streamerUser: req.user,
    });
    // Notify everyone still connected to this session's room that the
    // streamer closed it, so their client can navigate out of the zombie
    // page. Fetch the channel to pass the slug — the client uses it to
    // send digitals back to /canal/<slug>.
    const io = req.app.get("io") || null;
    const channel = await Channel.findById(session.channel);
    await emitSessionEvent(
      io,
      session._id.toString(),
      "session:ended",
      { reason: "abandoned", channelSlug: channel && channel.slug },
      { rooms: [`session:${session._id}`] }
    );
    // seatQueueSvc.cleanupForSession ran inside abandonSession and flipped
    // seated entries to 'left' (offered → waiting). Tell the queue's
    // subscribers so /queue and /queue/me refresh — this is what pulls
    // the stale "Back to the session" button off a digital's /canal page.
    if (io && channel) {
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
    res.json({ session });
  })
);

router.post(
  "/:id/actions",
  asyncHandler(async (req, res) => {
    const caller = await resolveCaller(req);
    if (caller.kind === "anon") {
      throw httpError(401, req.t("errors:unauthorized"), { code: "no_token" });
    }
    const io = req.app.get("io") || null;
    const { session, view } = await submitAction({
      sessionId: req.params.id,
      caller,
      action: req.body || {},
      io,
    });
    res.json({ session, view });
  })
);

module.exports = router;
