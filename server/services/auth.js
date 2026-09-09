const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");

// 180-day JWT expiry — matches turnocero. Mobile/PWA sessions shouldn't
// re-login every week. Constitution §10: JWT is the ONLY thing sent to the
// client; provider access tokens (Twitch, F4) stay server-side.
const JWT_EXPIRES_IN = "180d";
// Verification code: 6-digit numeric, 15-minute TTL, 5-attempt cap.
const CODE_TTL_MS = 15 * 60 * 1000;

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function comparePassword(plain, hashed) {
  if (!hashed) return false;
  return bcrypt.compare(plain, hashed);
}

function signToken(userId) {
  return jwt.sign({ userId: userId.toString() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function generateVerificationCode() {
  // 100000-999999 inclusive → always 6 digits.
  return String(100000 + Math.floor(Math.random() * 900000));
}

function makeVerificationSnapshot() {
  return {
    code: generateVerificationCode(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  generateVerificationCode,
  makeVerificationSnapshot,
  JWT_EXPIRES_IN,
  CODE_TTL_MS,
};
