const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const User = require("../models/User");
const Channel = require("../models/Channel");
const {
  hashPassword,
  comparePassword,
  signToken,
  makeVerificationSnapshot,
} = require("../services/auth");
const { createChannelForUser } = require("../services/channels");
const { sendVerificationEmail } = require("../services/email");

const router = express.Router();

// Rate limits — per-IP for the unauthed endpoints (register/login/verify),
// following turnocero's authLimiter model. Skipped in test env so a rapid
// sequence of assertions doesn't collide with the limit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, displayName } = req.body || {};
    if (!email || !password || !displayName) {
      throw httpError(400, req.t("errors:missing_fields"), { code: "missing_fields" });
    }
    if (String(password).length < 8) {
      throw httpError(400, req.t("errors:password_too_short"), {
        code: "password_too_short",
      });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw httpError(409, req.t("errors:email_in_use"), { code: "email_in_use" });
    }

    const hashed = await hashPassword(password);
    const verification = makeVerificationSnapshot();
    const user = await User.create({
      email: normalizedEmail,
      password: hashed,
      displayName,
      emailVerified: false,
      verification,
      language: (req.language && req.language.startsWith("en")) ? "en" : "es",
    });

    // Auto-create the streamer's channel (F5 will let admins create more).
    await createChannelForUser(user);

    await sendVerificationEmail({ email: user.email, code: verification.code });

    // No JWT until email is verified.
    res.status(201).json({
      email: user.email,
      message: req.t("errors:verification_sent"),
      // In dev/test, echo the code so the client can auto-complete. In prod
      // this branch is silently skipped so the code only reaches the mailbox.
      ...(process.env.NODE_ENV !== "production" && { devCode: verification.code }),
    });
  })
);

router.post(
  "/verify-email",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, code } = req.body || {};
    if (!email || !code) {
      throw httpError(400, req.t("errors:missing_fields"), { code: "missing_fields" });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      throw httpError(404, req.t("errors:user_not_found"), { code: "user_not_found" });
    }
    if (user.emailVerified) {
      // Idempotent success path.
      const channel = await Channel.findOne({ ownerUserId: user._id });
      return res.json({ user, token: signToken(user._id), channel });
    }
    if (!user.verification || !user.verification.code) {
      throw httpError(400, req.t("errors:no_verification"), { code: "no_verification" });
    }
    if (user.verification.expiresAt && user.verification.expiresAt.getTime() < Date.now()) {
      throw httpError(400, req.t("errors:code_expired"), { code: "code_expired" });
    }
    if ((user.verification.attempts || 0) >= 5) {
      throw httpError(429, req.t("errors:too_many_attempts"), { code: "too_many_attempts" });
    }
    if (String(code) !== user.verification.code) {
      user.verification.attempts = (user.verification.attempts || 0) + 1;
      await user.save();
      throw httpError(400, req.t("errors:invalid_code"), { code: "invalid_code" });
    }

    user.emailVerified = true;
    user.verification = undefined;
    await user.save();

    const channel = await Channel.findOne({ ownerUserId: user._id });
    res.json({ user, token: signToken(user._id), channel });
  })
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw httpError(400, req.t("errors:missing_fields"), { code: "missing_fields" });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      throw httpError(401, req.t("errors:invalid_credentials"), {
        code: "invalid_credentials",
      });
    }
    const ok = await comparePassword(password, user.password);
    if (!ok) {
      throw httpError(401, req.t("errors:invalid_credentials"), {
        code: "invalid_credentials",
      });
    }
    if (!user.emailVerified) {
      throw httpError(403, req.t("errors:email_not_verified"), {
        code: "email_not_verified",
        email: user.email,
      });
    }
    const channel = await Channel.findOne({ ownerUserId: user._id });
    res.json({ user, token: signToken(user._id), channel });
  })
);

router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ ownerUserId: req.user._id });
    res.json({ user: req.user, channel });
  })
);

module.exports = router;
