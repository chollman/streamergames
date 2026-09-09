const mongoose = require("mongoose");
const { Schema } = mongoose;

// A seat is a slot in the session. `playerId` is the id the game module uses
// (an internal uuid-like string); `userId` links to a User for the streamer
// or any authed digital player, and is null for guests. See
// docs/architecture.md §2.3.
const SeatSchema = new Schema(
  {
    seatIndex: { type: Number, required: true },
    playerId: { type: String, required: true }, // stable id passed to the game module
    userId: { type: Schema.Types.ObjectId, ref: "User" }, // null for guests
    nickname: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["streamer", "digital", "spectator"],
      required: true,
    },
    playerType: {
      type: String,
      enum: ["physical", "digital"],
      required: true,
    },
    status: {
      type: String,
      enum: ["seated", "disconnected", "kicked", "left"],
      default: "seated",
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SessionSchema = new Schema(
  {
    channel: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    gameId: { type: String, required: true, default: "the-crew" },
    status: {
      type: String,
      enum: ["lobby", "in_progress", "finished", "abandoned"],
      default: "lobby",
      index: true,
    },
    seats: { type: [SeatSchema], default: [] },
    // gameState is OPAQUE to the server core. Only the game module reads and
    // writes it (Constitution §9). Persisting it as Mixed lets us swap game
    // modules without a schema migration.
    gameState: { type: Schema.Types.Mixed, default: null },
    // Monotonic per-session counter incremented by emitSessionEvent on every
    // socket emit. Clients set (never increment) their local version from
    // the envelope; a gap triggers session:resync.
    version: { type: Number, default: 0 },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true, minimize: false }
);

// Prevent Mongoose from casting gameState — it's game-module data.
SessionSchema.path("gameState").set((v) => v);

module.exports = mongoose.model("Session", SessionSchema);
