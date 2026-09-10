const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const httpError = require("../utils/httpError");
const emitSessionEvent = require("../utils/emitSessionEvent");
const { getGame } = require("./games/registry");
const { JWT_SECRET } = require("../config/env");

// Guest tokens are JWTs bound to a specific (sessionId, playerId). They
// expire in 24h — long enough for the session but not indefinite. If the
// session ends, the token is orthogonally useless because the seat's
// gameState is finished.
const GUEST_TOKEN_TTL = "24h";

function signGuestToken({ playerId, sessionId }) {
  return jwt.sign({ playerId, sessionId, guest: true }, JWT_SECRET, {
    expiresIn: GUEST_TOKEN_TTL,
  });
}

// Deterministic streamer playerId — recreatable if the streamer disconnects
// and reconnects. All streamer-owned session actions come through this id.
function streamerPlayerId(userId) {
  return `streamer:${userId.toString()}`;
}


// Statuses that count as "active" — a channel can only have one at a time.
// This matters both for the streamer UX (one session at a time) and to keep
// resources scoped: we don't want abandoned lobbies from days ago to still
// be joinable.
const ACTIVE_STATUSES = ["lobby", "in_progress"];

async function getActiveSessionForChannel(channelId) {
  return Session.findOne({
    channel: channelId,
    status: { $in: ACTIVE_STATUSES },
  }).sort({ createdAt: -1 });
}

// Abandons every lobby / in_progress session on a channel in one shot.
// Used by the dashboard's "cancel and create new" flow — a channel may
// have accumulated more than one active session in the wild (created
// before we added the per-channel guard, or by an admin), so abandoning
// only the newest still leaves the create call blocked. Returns the
// number of sessions that were updated.
async function abandonAllActiveSessionsForChannel({ channel, streamerUser }) {
  // Belt-and-braces: only the channel owner may bulk-abandon on their
  // own channel. The route already checks this, but the service is
  // callable from tests / seeds so we keep the invariant here too.
  if (channel.ownerUserId.toString() !== streamerUser._id.toString()) {
    throw httpError(403, "not the channel owner", { code: "not_owner" });
  }
  const result = await Session.updateMany(
    { channel: channel._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: "abandoned", finishedAt: new Date() } }
  );
  return { count: result.modifiedCount || 0 };
}

function guestPlayerId() {
  return `guest:${crypto.randomBytes(6).toString("hex")}`;
}

async function createSessionForStreamer({ channel, streamerUser, gameId = "the-crew" }) {
  const existing = await getActiveSessionForChannel(channel._id);
  if (existing) {
    throw httpError(409, "channel already has an active session", {
      code: "active_session_exists",
      sessionId: existing._id.toString(),
    });
  }
  const streamerSeat = {
    seatIndex: 0,
    playerId: streamerPlayerId(streamerUser._id),
    userId: streamerUser._id,
    nickname: streamerUser.displayName,
    role: "streamer",
    playerType: "physical",
    status: "seated",
    joinedAt: new Date(),
  };
  return Session.create({
    channel: channel._id,
    gameId,
    status: "lobby",
    seats: [streamerSeat],
    gameState: null,
    version: 0,
  });
}

async function joinAsGuest({ sessionId, nickname }) {
  const session = await Session.findById(sessionId);
  if (!session) throw httpError(404, "session not found", { code: "session_not_found" });
  if (session.status !== "lobby") {
    throw httpError(400, "session is not accepting new seats", {
      code: "session_not_in_lobby",
    });
  }
  const game = getGame(session.gameId);
  const digitalSeats = session.seats.filter((s) => s.playerType === "digital");
  // maxPlayers includes ALL players (streamer + digitals); reserve one slot
  // for the streamer.
  if (digitalSeats.length + 1 >= game.maxPlayers) {
    throw httpError(400, "session is full", { code: "session_full" });
  }
  const trimmed = String(nickname || "").trim();
  if (!trimmed) throw httpError(400, "nickname is required", { code: "missing_fields" });

  const seat = {
    seatIndex: session.seats.length,
    playerId: guestPlayerId(),
    userId: null,
    nickname: trimmed,
    role: "digital",
    playerType: "digital",
    status: "seated",
    joinedAt: new Date(),
  };
  session.seats.push(seat);
  await session.save();

  const guestToken = signGuestToken({ playerId: seat.playerId, sessionId: session._id.toString() });
  return { session, seat, guestToken };
}

async function startSession({ sessionId, streamerUser }) {
  const session = await Session.findById(sessionId);
  if (!session) throw httpError(404, "session not found", { code: "session_not_found" });
  if (session.status !== "lobby") {
    throw httpError(400, "session already started", { code: "not_in_lobby" });
  }
  // Ownership: only the streamer of this session can start.
  const streamerSeat = session.seats.find((s) => s.role === "streamer");
  if (!streamerSeat || !streamerSeat.userId || streamerSeat.userId.toString() !== streamerUser._id.toString()) {
    throw httpError(403, "not the streamer", { code: "not_streamer" });
  }

  const game = getGame(session.gameId);
  const playersInput = session.seats
    .filter((s) => s.role !== "spectator")
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => ({ id: s.playerId, nickname: s.nickname, playerType: s.playerType }));

  if (playersInput.length < game.minPlayers) {
    throw httpError(400, `need at least ${game.minPlayers} players`, { code: "not_enough_players" });
  }
  session.gameState = game.setup({}, playersInput);
  session.status = "in_progress";
  session.startedAt = new Date();
  await session.save();
  return session;
}

async function abandonSession({ sessionId, streamerUser }) {
  const session = await Session.findById(sessionId);
  if (!session) throw httpError(404, "session not found", { code: "session_not_found" });
  const streamerSeat = session.seats.find((s) => s.role === "streamer");
  if (
    !streamerSeat ||
    !streamerSeat.userId ||
    streamerSeat.userId.toString() !== streamerUser._id.toString()
  ) {
    throw httpError(403, "not the streamer", { code: "not_streamer" });
  }
  if (session.status === "finished" || session.status === "abandoned") {
    // Idempotent: already closed.
    return session;
  }
  session.status = "abandoned";
  session.finishedAt = new Date();
  await session.save();
  return session;
}

/**
 * The canonical pipeline: validate → apply → emit. Every action goes through
 * this function; routes are thin. Constitution §9.
 *
 * `caller` identifies WHO is submitting the action:
 *   - { kind: 'user', userId } → the streamer; playerId is derived
 *   - { kind: 'guest', playerId, sessionId } → a digital seat
 *
 * `io` may be null (REST-only mode / tests). Even when null, version still
 * increments and the returned envelope is complete.
 */
async function submitAction({ sessionId, caller, action, io }) {
  const session = await Session.findById(sessionId);
  if (!session) throw httpError(404, "session not found", { code: "session_not_found" });

  // Resolve caller → seat.
  let seat;
  if (caller.kind === "user") {
    seat = session.seats.find(
      (s) => s.userId && s.userId.toString() === caller.userId.toString()
    );
  } else if (caller.kind === "guest") {
    if (caller.sessionId !== session._id.toString()) {
      throw httpError(403, "token does not match session", { code: "wrong_session" });
    }
    seat = session.seats.find((s) => s.playerId === caller.playerId);
  }
  if (!seat) throw httpError(403, "not seated in this session", { code: "not_seated" });

  // Sessions that aren't in_progress reject actions EXCEPT declare-end which
  // may fire during 'reserving' (part of setup). The game module has final
  // say via validateAction, but we short-circuit the obvious cases here.
  if (session.status !== "in_progress" && action.type !== "declare-end") {
    throw httpError(400, "session not in progress", { code: "not_in_progress" });
  }

  const game = getGame(session.gameId);
  const enrichedAction = { ...action, playerId: seat.playerId };

  const validation = game.validateAction(session.gameState, seat.playerId, enrichedAction);
  if (!validation.ok) {
    throw httpError(400, validation.error, { code: "invalid_action" });
  }

  const nextState = game.applyAction(session.gameState, enrichedAction);
  session.gameState = nextState;
  if (game.isFinished(nextState)) {
    session.status = "finished";
    session.finishedAt = new Date();
  }
  session.markModified("gameState");
  await session.save();

  // Public event to everyone in the session room.
  await emitSessionEvent(
    io,
    session._id.toString(),
    "session:action-accepted",
    {
      action: { type: enrichedAction.type, playerId: seat.playerId },
      view: game.viewFor(nextState, null, "spectator"),
    },
    { rooms: [`session:${session._id}`] }
  );

  // Private per-player events for everyone whose private view might have
  // changed. Digitals get their own hand; the streamer gets the full state
  // (their own hand + reservedByStreamer + all hands). Without this the
  // streamer would end up with the spectator-shaped view emitted above and
  // useSessionRole on the client would flip them into SpectatorView.
  for (const s of session.seats) {
    const role = s.role === "streamer" ? "streamer" : s.role === "digital" ? "digital" : null;
    if (!role) continue;
    await emitSessionEvent(
      io,
      session._id.toString(),
      "session:you-are",
      { view: game.viewFor(nextState, s.playerId, role) },
      { rooms: [`session:${session._id}:player:${s.playerId}`] }
    );
  }

  // Return the caller's own view (their private if digital, full if streamer).
  const role = seat.role === "streamer" ? "streamer" : "digital";
  return {
    session,
    view: game.viewFor(nextState, seat.playerId, role),
  };
}

// Builds a caller-scoped lobby view from the session's seats when the
// game hasn't started yet (gameState is still null). The returned shape
// matches game.viewFor exactly — players list, empty trick, empty tricks
// history — plus the role-tagged fields the client uses to dispatch to
// the right sub-page (reservedByStreamer for streamer, myHand + myPlayerId
// for digital, neither for spectator). Without this the streamer's GET
// during lobby has no view at all and falls through to SpectatorView.
function lobbyViewFor(session, callerSeat) {
  const players = session.seats.map((s) => ({
    id: s.playerId,
    nickname: s.nickname,
    playerType: s.playerType,
    role: s.role,
    order: s.seatIndex,
    handSize: 0,
    commTokenUsed: false,
    commCard: null,
  }));
  const publicView = {
    phase: "lobby",
    players,
    commanderId: null,
    trick: { leaderId: null, ledSuit: null, plays: [] },
    tricks: [],
    currentTurnId: null,
  };
  if (callerSeat && callerSeat.role === "streamer") {
    return { ...publicView, reservedByStreamer: [] };
  }
  if (callerSeat && callerSeat.role === "digital") {
    return { ...publicView, myHand: [], myPlayerId: callerSeat.playerId };
  }
  return publicView;
}

function viewForRequest(session, caller) {
  const game = getGame(session.gameId);

  // Resolve caller → seat (may be null for anon / non-seated user).
  let callerSeat = null;
  if (caller.kind === "user") {
    callerSeat = session.seats.find(
      (s) => s.userId && s.userId.toString() === caller.userId.toString()
    ) || null;
  } else if (caller.kind === "guest") {
    callerSeat = session.seats.find((s) => s.playerId === caller.playerId) || null;
  }

  // Lobby: no game state yet; build the view from seats so the client
  // can still dispatch correctly.
  if (!session.gameState) {
    return lobbyViewFor(session, callerSeat);
  }

  if (callerSeat && callerSeat.role === "streamer") {
    return game.viewFor(session.gameState, callerSeat.playerId, "streamer");
  }
  if (callerSeat && callerSeat.role === "digital") {
    return game.viewFor(session.gameState, callerSeat.playerId, "digital");
  }
  return game.viewFor(session.gameState, null, "spectator");
}

module.exports = {
  createSessionForStreamer,
  joinAsGuest,
  startSession,
  submitAction,
  viewForRequest,
  signGuestToken,
  streamerPlayerId,
  guestPlayerId,
  getActiveSessionForChannel,
  abandonSession,
  abandonAllActiveSessionsForChannel,
  ACTIVE_STATUSES,
};
