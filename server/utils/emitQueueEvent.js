// Emit a queue-related Socket.IO event. Unlike emitSessionEvent, no
// monotonic version — the queue is a soft-realtime feed, and a missed
// update just means a slightly stale panel until the next event or the
// fallback poll fires. Constitution §6 covers session state; queue events
// are the lighter cousin.
//
// Envelope keys (timestamp) win over payload so a caller can't forge them.
// `io` may be null (unit tests, REST-only mode) — the envelope is still
// returned so callers can persist / return it.
function emitQueueEvent(io, eventName, payload, { rooms }) {
  if (!Array.isArray(rooms)) {
    const err = new Error("emitQueueEvent: rooms must be an array");
    err.status = 500;
    throw err;
  }
  const envelope = {
    ...payload,
    timestamp: new Date().toISOString(),
  };
  if (io) {
    for (const room of rooms) {
      io.to(room).emit(eventName, envelope);
    }
  }
  return envelope;
}

module.exports = emitQueueEvent;
