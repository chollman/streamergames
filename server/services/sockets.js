const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Session = require("../models/Session");
const { JWT_SECRET } = require("../config/env");
const { getGame } = require("./games/registry");
const { viewForRequest } = require("./sessions");

// Handshake auth. Socket.IO calls this once per connection, BEFORE the
// `connection` event fires — so its awaits are fine (Constitution §6 talks
// about awaits AFTER io.on('connection'), not before).
//
// Contract:
//   - No token → socket.data.caller = { kind: 'anon' }, allow.
//   - Valid user JWT → { kind: 'user', userId, user }.
//   - Valid guest JWT (session-scoped) → { kind: 'guest', playerId, sessionId }.
//   - Valid queue JWT (channel-scoped) → { kind: 'queue-entry', channelSlug, entryId }.
//   - Malformed / expired token → treated as anon.
//
// Actions can't be submitted through sockets in F1 — they go via HTTP —
// so an anon socket is a spectator. Rejecting invalid tokens outright would
// break a page whose stored token expires mid-visit.
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    socket.data.caller = { kind: "anon" };
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.guest) {
      socket.data.caller = {
        kind: "guest",
        playerId: decoded.playerId,
        sessionId: decoded.sessionId,
      };
      return next();
    }
    if (decoded.kind === "queue") {
      // Queue-entry socket: bound to a channel + a specific queue entry.
      // Used to receive seat:offered notifications in the digital's own tab.
      socket.data.caller = {
        kind: "queue-entry",
        channelSlug: decoded.channelSlug,
        entryId: decoded.entryId,
      };
      return next();
    }
    if (decoded.userId) {
      const user = await User.findById(decoded.userId);
      if (user) {
        socket.data.caller = {
          kind: "user",
          userId: user._id.toString(),
          user,
        };
        return next();
      }
    }
    socket.data.caller = { kind: "anon" };
    return next();
  } catch (_e) {
    socket.data.caller = { kind: "anon" };
    return next();
  }
}

// Which seat (if any) does this caller occupy in this session?
function resolveSeat(session, caller) {
  if (!caller) return null;
  if (caller.kind === "user") {
    return session.seats.find(
      (s) => s.userId && s.userId.toString() === caller.userId.toString()
    );
  }
  if (caller.kind === "guest") {
    if (caller.sessionId !== session._id.toString()) return null;
    return session.seats.find((s) => s.playerId === caller.playerId);
  }
  return null;
}

function roleForRoomJoin(seat) {
  if (!seat) return "spectator";
  if (seat.role === "streamer") return "streamer";
  if (seat.role === "digital") return "digital";
  return "spectator";
}

// Build the appropriate view for the given caller. Delegates to the same
// viewForRequest the HTTP GET route uses so the socket's session:state
// and the initial HTTP bootstrap agree byte-for-byte — including the
// synthetic lobby view built from seats when gameState is still null.
function viewForCaller(session, caller) {
  return viewForRequest(session, caller);
}

// The rooms this caller may join for this session. Public always; private
// per-player only if the caller is seated as streamer or digital.
function roomsForCaller(session, caller) {
  const rooms = [`session:${session._id}`];
  const seat = resolveSeat(session, caller);
  if (seat && (seat.role === "streamer" || seat.role === "digital")) {
    rooms.push(`session:${session._id}:player:${seat.playerId}`);
  }
  return rooms;
}

async function handleSessionJoin(socket, payload) {
  const { sessionId } = payload || {};
  if (!sessionId) return;
  const session = await Session.findById(sessionId);
  if (!session) return;
  const caller = socket.data.caller || { kind: "anon" };
  const rooms = roomsForCaller(session, caller);
  for (const room of rooms) socket.join(room);

  socket.emit("session:state", {
    sessionId: session._id.toString(),
    version: session.version,
    view: viewForCaller(session, caller),
  });
}

async function handleSessionLeave(socket, payload) {
  const { sessionId } = payload || {};
  if (!sessionId) return;
  socket.leave(`session:${sessionId}`);
  const caller = socket.data.caller || {};
  if (caller.kind === "guest" && caller.playerId) {
    socket.leave(`session:${sessionId}:player:${caller.playerId}`);
  }
  if (caller.kind === "user" && caller.userId) {
    // Streamer's private room key uses playerId `streamer:<userId>` — look
    // up via session for correctness rather than reconstructing here.
    try {
      const session = await Session.findById(sessionId);
      if (session) {
        const seat = resolveSeat(session, caller);
        if (seat) socket.leave(`session:${sessionId}:player:${seat.playerId}`);
      }
    } catch (_e) {
      /* leave is best-effort */
    }
  }
}

// The client detected a version gap (missed one or more envelopes) and
// asked for a fresh state. Emit session:state to this socket only,
// carrying the current server version + the caller's own view. Same
// shape as the initial session:state on join, so applyEnvelope handles
// both paths through the same code (Constitution §6).
async function handleSessionResyncRequest(socket, payload) {
  const { sessionId } = payload || {};
  if (!sessionId) return;
  const session = await Session.findById(sessionId);
  if (!session) return;
  const caller = socket.data.caller || { kind: "anon" };
  socket.emit("session:state", {
    sessionId: session._id.toString(),
    version: session.version,
    view: viewForCaller(session, caller),
    resync: true,
  });
}

// Queue rooms:
//   channel:<slug>:queue                → public queue room. Streamers,
//     digitals sitting in the queue, and anon spectators all subscribe.
//     Payload is just "queue changed, refetch" — nothing private.
//   channel:<slug>:queue:entry:<id>     → per-entry room. The digital's
//     tab is the only member; receives seat:offered directly. Only a
//     queue-entry caller whose token matches this channel + entry may
//     join it.
function handleQueueJoin(socket, payload) {
  const { channelSlug } = payload || {};
  if (!channelSlug) return;
  socket.join(`channel:${channelSlug}:queue`);
  const caller = socket.data.caller || {};
  if (
    caller.kind === "queue-entry" &&
    caller.channelSlug === channelSlug &&
    caller.entryId
  ) {
    socket.join(`channel:${channelSlug}:queue:entry:${caller.entryId}`);
  }
}

function handleQueueLeave(socket, payload) {
  const { channelSlug } = payload || {};
  if (!channelSlug) return;
  socket.leave(`channel:${channelSlug}:queue`);
  const caller = socket.data.caller || {};
  if (
    caller.kind === "queue-entry" &&
    caller.channelSlug === channelSlug &&
    caller.entryId
  ) {
    socket.leave(`channel:${channelSlug}:queue:entry:${caller.entryId}`);
  }
}

function registerSocketHandlers(io) {
  io.use(authenticateSocket);
  io.on("connection", (socket) => {
    // Constitution §6: register every socket.on(...) synchronously BEFORE
    // any await. The .on registration is what matters; the handler body
    // can do async work internally.
    socket.on("session:join", (payload) => {
      handleSessionJoin(socket, payload).catch(() => {
        // Silent fail for MVP; a future observability commit can surface it.
      });
    });
    socket.on("session:leave", (payload) => {
      handleSessionLeave(socket, payload).catch(() => {});
    });
    socket.on("session:resync-request", (payload) => {
      handleSessionResyncRequest(socket, payload).catch(() => {});
    });
    socket.on("queue:join", (payload) => {
      try { handleQueueJoin(socket, payload); } catch { /* best effort */ }
    });
    socket.on("queue:leave", (payload) => {
      try { handleQueueLeave(socket, payload); } catch { /* best effort */ }
    });
  });
}

module.exports = {
  authenticateSocket,
  resolveSeat,
  viewForCaller,
  roomsForCaller,
  handleSessionJoin,
  handleSessionLeave,
  handleSessionResyncRequest,
  handleQueueJoin,
  handleQueueLeave,
  registerSocketHandlers,
};
