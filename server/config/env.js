require("dotenv").config();

const required = ["MONGODB_URI", "JWT_SECRET"];
if (process.env.NODE_ENV !== "test") {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Missing: ${missing.join(", ")}. Copy server/.env.example to server/.env.`
    );
  }
}

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: parseInt(process.env.PORT || "4000", 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3000",
  NODE_ENV: process.env.NODE_ENV || "development",
};
