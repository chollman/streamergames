// Throw with `throw httpError(status, message, { code })` inside async route
// handlers wrapped by asyncHandler; the central errorHandler will surface
// it to the client as { message, code? } with the given status.
// Constitution §5.
function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  if (extra.code) err.code = extra.code;
  return err;
}

module.exports = httpError;
