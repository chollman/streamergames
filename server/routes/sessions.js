const express = require("express");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const Session = require("../models/Session");
const User = require("../models/User");
const {
  joinAsGuest,
  startSession,
  submitAction,
  viewForRequest,
  abandonSession,
} = require("../services/sessions");
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
    res.json({ session, view });
  })
);

router.post(
  "/:id/join",
  asyncHandler(async (req, res) => {
    const { nickname } = req.body || {};
    const { session, seat, guestToken } = await joinAsGuest({
      sessionId: req.params.id,
      nickname,
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
