// Throw with `throw httpError(status, message, { code, ...extra })` inside
// async route handlers wrapped by asyncHandler; the central errorHandler
// will surface it to the client as { message, code?, ...extra } with the
// given status. Constitution §5.
function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  if (extra.code) err.code = extra.code;
  // Every other key becomes part of the response body via the error
  // middleware (see middleware/errorHandler.js). Useful for surfacing
  // context — email on email_not_verified, sessionId on
  // active_session_exists, etc.
  const { code: _code, ...rest } = extra;
  if (Object.keys(rest).length > 0) err.data = rest;
  return err;
}

module.exports = httpError;
