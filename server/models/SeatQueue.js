const mongoose = require("mongoose");
const { Schema } = mongoose;

// One entry per person waiting to be seated in a channel's next session.
// Bound to the channel (not the session): the queue exists between
// sessions so people can wait even when nothing is running yet.
// Constitution §9: the source of truth is the DB; sockets only carry
// snapshots. See docs/architecture.md §2.4.
const SeatQueueEntrySchema = new Schema(
  {
    channel: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    // If the entrant is a signed-in user we track them by userId so their
    // karma follows them across sessions and reconnects. Guests are tracked
    // by the queueToken (a JWT that resolves to this document's _id).
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    nickname: { type: String, required: true, trim: true, maxlength: 50 },
    // Waiting: in the queue, may be offered. Offered: the streamer sent
    // seat:offered; they have offerExpiresAt to accept. Seated: they
    // accepted and are now in a session's seats array. Kicked: streamer
    // removed them. Left: they took themselves out.
    status: {
      type: String,
      enum: ["waiting", "offered", "seated", "kicked", "left"],
      default: "waiting",
      index: true,
    },
    karma: { type: Number, default: 0 },
    // Set when the streamer offers a seat; clear on accept/expire/decline.
    offerExpiresAt: { type: Date, default: null },
    // Session the OFFER targets (set when status transitions to 'offered').
    // Kept once seated so /queue/me can point the client at its session.
    offeredSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    // Session they were seated into (only meaningful when status === 'seated').
    seatedSessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    // Playing an entry through to session: which seat's playerId ended up
    // holding them. Recorded so post-game karma can find the entry back.
    playerId: { type: String, default: null },
    // The user's own display of where they are. Persisted so late reconnects
    // can just show it without recomputing across every entry.
    lastPositionShown: { type: Number, default: null },
  },
  { timestamps: true }
);

// A channel has many entries; ordering the queue asks for karma DESC then
// requestedAt ASC (older waits get preference on ties). Compound index
// lets us answer that with a single sort.
SeatQueueEntrySchema.index({ channel: 1, status: 1, karma: -1, createdAt: 1 });

module.exports = mongoose.model("SeatQueueEntry", SeatQueueEntrySchema);
