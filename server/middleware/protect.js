const { verifyToken } = require("../services/auth");
const User = require("../models/User");
const httpError = require("../utils/httpError");

// Requires a valid Bearer token and attaches req.user. Refuses without a
// valid, non-expired JWT for an existing (non-deleted) user.
async function protect(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return next(httpError(401, req.t("errors:unauthorized"), { code: "no_token" }));
    }
    let decoded;
    try {
      decoded = verifyToken(match[1]);
    } catch (_e) {
      return next(httpError(401, req.t("errors:unauthorized"), { code: "invalid_token" }));
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return next(httpError(401, req.t("errors:unauthorized"), { code: "user_not_found" }));
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = protect;
