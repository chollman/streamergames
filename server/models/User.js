const mongoose = require("mongoose");
const { Schema } = mongoose;

// Password is conditionally required so future OAuth flows (Twitch, F4) can
// create password-less users. For MVP everyone registers with a password.
const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: function () {
        return !this.twitchId;
      },
    },
    displayName: { type: String, required: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    // No default on `attempts` — Mongoose re-materializes a subdocument
    // shell on read whenever any nested field has a default, which prevents
    // $unset from actually clearing the subdoc after a successful verify.
    // Callers use `(user.verification?.attempts || 0)` to read.
    verification: {
      code: { type: String },
      expiresAt: { type: Date },
      attempts: { type: Number }, // 5-attempt cap (see routes/auth.js)
    },
    language: { type: String, enum: ["es", "en"], default: "es" },
    // Reserved for F4 (Twitch OAuth linking):
    twitchId: { type: String, sparse: true, index: true },
    twitchDisplayName: { type: String },
  },
  { timestamps: true }
);

// Never leak secrets or verification internals to the client.
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verification;
  delete obj.twitchId;
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
