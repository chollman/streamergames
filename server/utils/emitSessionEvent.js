const Session = require("../models/Session");

/**
 * Emit a Socket.IO event tied to a game session — the single entry point for
 * every session-related emit (Constitution §6).
 *
 * Atomically increments the session's `version` in Mongo and stamps the
 * payload with `sessionId`, `version`, and `timestamp`. The client SETS its
 * local version from the payload — never increments locally. A gap between
 * the payload's version and the client's last-known version triggers a
 * `session:resync` and a full state re-emit.
 *
 * Envelope keys (sessionId / version / timestamp) win over payload — a
 * caller can never accidentally forge them.
 *
 * `rooms` is the list of Socket.IO rooms the event should be emitted to:
 *   - Public state → `session:<id>`
 *   - Per-player private state → `session:<id>:player:<playerId>`
 * NEVER emit private state to a public room.
 *
 * Pass `io=null` to increment version and build the envelope without
 * actually emitting (useful for REST-only flows and unit tests where socket
 * infrastructure isn't wired). The envelope is still returned so callers
 * can persist / return it.
 *
 * @param {Object|null} io          Socket.IO server instance (nullable)
 * @param {string}      sessionId   The Session document _id
 * @param {string}      eventName   Socket event name (e.g. 'session:action-accepted')
 * @param {Object}      payload     Event-specific payload merged into the envelope
 * @param {Object}      opts
 * @param {string[]}    opts.rooms  Rooms the event goes to (ignored when io is null)
 * @returns {Promise<Object>}       The envelope
 */
async function emitSessionEvent(io, sessionId, eventName, payload, { rooms }) {
  if (!Array.isArray(rooms)) {
    const err = new Error("emitSessionEvent: rooms must be an array");
    err.status = 500;
    throw err;
  }

  const session = await Session.findByIdAndUpdate(
    sessionId,
    { $inc: { version: 1 } },
    { new: true }
  );
  if (!session) {
    const err = new Error(`Session ${sessionId} not found`);
    err.status = 404;
    throw err;
  }

  const envelope = {
    ...payload,
    sessionId: session._id.toString(),
    version: session.version,
    timestamp: new Date().toISOString(),
  };

  if (io) {
    for (const room of rooms) {
      io.to(room).emit(eventName, envelope);
    }
  }

  return envelope;
}

module.exports = emitSessionEvent;
