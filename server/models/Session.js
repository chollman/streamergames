const mongoose = require("mongoose");
const { Schema } = mongoose;

// Minimal placeholder — F0 only needs enough for emitSessionEvent to atomically
// increment `version`. The full schema (channel + seats subdocs + gameState +
// timestamps) lands in F1 alongside the sessions API and the The Crew module.
const SessionSchema = new Schema(
  {
    channel: { type: Schema.Types.ObjectId, ref: "Channel" },
    gameId: { type: String, default: "the-crew" },
    status: {
      type: String,
      enum: ["lobby", "in_progress", "finished", "abandoned"],
      default: "lobby",
      index: true,
    },
    version: { type: Number, default: 0 },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
