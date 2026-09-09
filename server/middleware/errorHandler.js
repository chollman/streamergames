// Central error middleware — must be mounted after all routes.
// Every error response body is { message, code? } (Constitution §5).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || "Internal server error";

  if (status >= 500 && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  const body = { message };
  if (err.code) body.code = err.code;
  res.status(status).json(body);
}

module.exports = errorHandler;
