// Wraps an async route handler and forwards any thrown error to Express's
// error middleware. Prefer `throw httpError(status, message)` over `next(err)`.
// Constitution §5.
function asyncHandler(fn) {
  return function asyncHandlerWrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
