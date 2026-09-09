const { CORS_ORIGIN } = require("./env");

const corsOptions = {
  origin: CORS_ORIGIN,
  credentials: true,
};

module.exports = { corsOptions };
