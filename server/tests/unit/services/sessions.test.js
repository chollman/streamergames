const {
  createSessionForStreamer,
  joinAsGuest,
  startSession,
  submitAction,
  viewForRequest,
} = require("../../../services/sessions");
const User = require("../../../models/User");
const Channel = require("../../../models/Channel");
const Session = require("../../../models/Session");

async function scaffold() {
  const streamerUser = await User.create({
    email: "streamer@x.com",
    password: "hash",
    displayName: "Claudio",
    emailVerified: true,
  });
  const channel = await Channel.create({
    slug: "claudio",
    displayName: "Claudio",
    ownerUserId: streamerUser._id,
  });
  return { streamerUser, channel };
}

describe("services/sessions — createSessionForStreamer", () => {
  it("creates a lobby session with seat 0 as the streamer", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    expect(session.status).toBe("lobby");
    expect(session.gameId).toBe("the-crew");
    expect(session.seats).toHaveLength(1);
    const seat = session.seats[0];
    expect(seat.role).toBe("streamer");
    expect(seat.playerType).toBe("physical");
    expect(seat.userId.toString()).toBe(streamerUser._id.toString());
    expect(seat.playerId).toBe(`streamer:${streamerUser._id}`);
  });
});

describe("services/sessions — joinAsGuest", () => {
  it("adds a digital seat and returns a signed guestToken", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const { session: after, seat, guestToken } = await joinAsGuest({
      sessionId: session._id.toString(),
      nickname: "Ana",
    });
    expect(after.seats).toHaveLength(2);
    expect(seat.role).toBe("digital");
    expect(seat.playerType).toBe("digital");
    expect(seat.nickname).toBe("Ana");
    expect(seat.playerId).toMatch(/^guest:/);
    expect(guestToken).toEqual(expect.any(String));
  });

  it("rejects joining an in-progress session", async () => {
    const { streamerUser, channel } = await scaffold();
    let session = await createSessionForStreamer({ channel, streamerUser });
    // Add 2 more digitals so we have 3 total, then start
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "A" });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "B" });
    await startSession({ sessionId: session._id.toString(), streamerUser });
    await expect(
      joinAsGuest({ sessionId: session._id.toString(), nickname: "Late" })
    ).rejects.toMatchObject({ status: 400, code: "session_not_in_lobby" });
  });

  it("rejects a blank nickname", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    await expect(
      joinAsGuest({ sessionId: session._id.toString(), nickname: "   " })
    ).rejects.toMatchObject({ status: 400, code: "missing_fields" });
  });

  it("rejects joining a full session (>= maxPlayers)", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    // The Crew maxPlayers = 5. Streamer already in seat 0. Adding 4 more fills it.
    for (const nick of ["A", "B", "C", "D"]) {
      await joinAsGuest({ sessionId: session._id.toString(), nickname: nick });
    }
    await expect(
      joinAsGuest({ sessionId: session._id.toString(), nickname: "E" })
    ).rejects.toMatchObject({ status: 400, code: "session_full" });
  });
});

describe("services/sessions — startSession", () => {
  it("only the channel owner (streamer) can start", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "A" });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "B" });

    const notStreamer = await User.create({
      email: "impostor@x.com",
      password: "h",
      displayName: "Imp",
    });
    await expect(
      startSession({ sessionId: session._id.toString(), streamerUser: notStreamer })
    ).rejects.toMatchObject({ status: 403, code: "not_streamer" });
  });

  it("rejects starting with fewer than minPlayers", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    // Only 1 seat (streamer). The Crew minPlayers = 3.
    await expect(
      startSession({ sessionId: session._id.toString(), streamerUser })
    ).rejects.toMatchObject({ status: 400, code: "not_enough_players" });
  });

  it("transitions to in_progress and builds gameState via game.setup", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "A" });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "B" });
    const started = await startSession({
      sessionId: session._id.toString(),
      streamerUser,
    });
    expect(started.status).toBe("in_progress");
    expect(started.gameState).toBeTruthy();
    expect(started.gameState.phase).toBe("reserving");
    expect(started.gameState.players).toHaveLength(3);
  });
});

describe("services/sessions — submitAction pipeline", () => {
  async function readyToPlay() {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const guest1 = await joinAsGuest({ sessionId: session._id.toString(), nickname: "A" });
    const guest2 = await joinAsGuest({ sessionId: session._id.toString(), nickname: "B" });
    await startSession({ sessionId: session._id.toString(), streamerUser });
    const fresh = await Session.findById(session._id);
    return { session: fresh, streamerUser, guest1, guest2 };
  }

  it("validates via the game module and rejects invalid actions", async () => {
    const { session, streamerUser } = await readyToPlay();
    // Reserving phase — streamer needs to reserve exactly 14 cards for 3 players.
    // Send an obviously wrong size to trigger validation failure.
    await expect(
      submitAction({
        sessionId: session._id.toString(),
        caller: { kind: "user", userId: streamerUser._id },
        action: { type: "reserve-hand", cardIds: ["pink-1"] },
        io: null,
      })
    ).rejects.toMatchObject({ status: 400, code: "invalid_action" });
  });

  it("applies a valid reserve-hand and returns the streamer view with full hand", async () => {
    const { session, streamerUser } = await readyToPlay();
    const cards = Array.from({ length: 14 }, (_, i) => {
      const suits = ["pink", "yellow", "green", "blue"];
      const suit = suits[i % 4];
      const rank = Math.floor(i / 4) + 1;
      return `${suit}-${rank}`;
    }).slice(0, 14);
    const { view } = await submitAction({
      sessionId: session._id.toString(),
      caller: { kind: "user", userId: streamerUser._id },
      action: { type: "reserve-hand", cardIds: cards },
      io: null,
    });
    // Streamer view includes reservedByStreamer
    expect(view.reservedByStreamer).toEqual(cards);
  });

  it("rejects an action from someone not seated in the session", async () => {
    const { session } = await readyToPlay();
    const outsider = await User.create({
      email: "outsider@x.com",
      password: "h",
      displayName: "O",
    });
    await expect(
      submitAction({
        sessionId: session._id.toString(),
        caller: { kind: "user", userId: outsider._id },
        action: { type: "reserve-hand", cardIds: [] },
        io: null,
      })
    ).rejects.toMatchObject({ status: 403, code: "not_seated" });
  });

  it("rejects a guest token bound to a different session", async () => {
    const { session } = await readyToPlay();
    // Guest token pretending to be for a different session
    await expect(
      submitAction({
        sessionId: session._id.toString(),
        caller: {
          kind: "guest",
          playerId: "guest:whatever",
          sessionId: "507f1f77bcf86cd799439011",
        },
        action: { type: "reserve-hand", cardIds: [] },
        io: null,
      })
    ).rejects.toMatchObject({ status: 403, code: "wrong_session" });
  });
});

describe("services/sessions — viewForRequest privacy", () => {
  // The single most important behavior of this layer: no matter who asks,
  // a viewer must never see another player's hand. This is the network-facing
  // equivalent of the pure viewFor test in the game module — it verifies the
  // service passes the right (viewerId, role) tuple to the module.

  async function playing() {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const g1 = await joinAsGuest({ sessionId: session._id.toString(), nickname: "A" });
    const g2 = await joinAsGuest({ sessionId: session._id.toString(), nickname: "B" });
    await startSession({ sessionId: session._id.toString(), streamerUser });
    // Deal cards so hands exist
    const cards = ["pink-1","pink-2","pink-3","pink-4","yellow-1","yellow-2","yellow-3","yellow-4","green-1","green-2","green-3","green-4","blue-1","blue-2"];
    await submitAction({
      sessionId: session._id.toString(),
      caller: { kind: "user", userId: streamerUser._id },
      action: { type: "reserve-hand", cardIds: cards },
      io: null,
    });
    await submitAction({
      sessionId: session._id.toString(),
      caller: { kind: "user", userId: streamerUser._id },
      action: { type: "deal" },
      io: null,
    });
    const fresh = await Session.findById(session._id);
    return { session: fresh, streamerUser, g1, g2 };
  }

  it("streamer view has full hands + reservedByStreamer", async () => {
    const { session, streamerUser } = await playing();
    const view = viewForRequest(session, { kind: "user", userId: streamerUser._id });
    expect(view.reservedByStreamer).toBeTruthy();
    const streamerSeat = view.players.find((p) => p.playerType === "physical");
    expect(streamerSeat.hand).toHaveLength(14);
  });

  it("guest view has ONLY their own myHand, never others' hands or reservedByStreamer", async () => {
    const { session, g1 } = await playing();
    const view = viewForRequest(session, {
      kind: "guest",
      playerId: g1.seat.playerId,
      sessionId: session._id.toString(),
    });
    expect(view.myHand).toBeInstanceOf(Array);
    expect(view.myHand.length).toBeGreaterThan(0);
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
      expect(p).toHaveProperty("handSize");
    }
    expect(view).not.toHaveProperty("reservedByStreamer");
  });

  it("anonymous view is spectator: no hands anywhere, no reservedByStreamer", async () => {
    const { session } = await playing();
    const view = viewForRequest(session, { kind: "anon" });
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
    }
    expect(view).not.toHaveProperty("myHand");
    expect(view).not.toHaveProperty("reservedByStreamer");
  });

  it("a guest token for THIS session but a non-existent playerId gets spectator view (no leak)", async () => {
    const { session } = await playing();
    const view = viewForRequest(session, {
      kind: "guest",
      playerId: "guest:nope",
      sessionId: session._id.toString(),
    });
    expect(view).not.toHaveProperty("myHand");
    for (const p of view.players) {
      expect(p).not.toHaveProperty("hand");
    }
  });
});

const {
  getActiveSessionForChannel,
  abandonSession,
} = require("../../../services/sessions");

describe("services/sessions — getActiveSessionForChannel", () => {
  it("returns null when the channel has no sessions", async () => {
    const { channel } = await scaffold();
    const active = await getActiveSessionForChannel(channel._id);
    expect(active).toBeNull();
  });

  it("returns the lobby session when one exists", async () => {
    const { streamerUser, channel } = await scaffold();
    const created = await createSessionForStreamer({ channel, streamerUser });
    const active = await getActiveSessionForChannel(channel._id);
    expect(active).not.toBeNull();
    expect(active._id.toString()).toBe(created._id.toString());
    expect(active.status).toBe("lobby");
  });

  it("ignores finished and abandoned sessions", async () => {
    const { streamerUser, channel } = await scaffold();
    const s = await createSessionForStreamer({ channel, streamerUser });
    s.status = "finished";
    await s.save();
    const active = await getActiveSessionForChannel(channel._id);
    expect(active).toBeNull();
  });
});

describe("services/sessions — createSessionForStreamer guard", () => {
  it("throws 409 with sessionId when an active session already exists", async () => {
    const { streamerUser, channel } = await scaffold();
    const first = await createSessionForStreamer({ channel, streamerUser });
    try {
      await createSessionForStreamer({ channel, streamerUser });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.status).toBe(409);
      expect(err.code).toBe("active_session_exists");
      expect(err.data && err.data.sessionId).toBe(first._id.toString());
    }
  });

  it("allows a new session after the previous one is abandoned", async () => {
    const { streamerUser, channel } = await scaffold();
    const first = await createSessionForStreamer({ channel, streamerUser });
    await abandonSession({ sessionId: first._id.toString(), streamerUser });
    const second = await createSessionForStreamer({ channel, streamerUser });
    expect(second._id.toString()).not.toBe(first._id.toString());
    expect(second.status).toBe("lobby");
  });
});

describe("services/sessions — abandonSession", () => {
  it("streamer abandons their own session", async () => {
    const { streamerUser, channel } = await scaffold();
    const s = await createSessionForStreamer({ channel, streamerUser });
    const after = await abandonSession({ sessionId: s._id.toString(), streamerUser });
    expect(after.status).toBe("abandoned");
    expect(after.finishedAt).toBeTruthy();
  });

  it("throws 404 for unknown session", async () => {
    const { streamerUser } = await scaffold();
    const fakeId = "507f1f77bcf86cd799439011";
    try {
      await abandonSession({ sessionId: fakeId, streamerUser });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.status).toBe(404);
      expect(err.code).toBe("session_not_found");
    }
  });

  it("throws 403 when caller is not the streamer of the session", async () => {
    const { streamerUser, channel } = await scaffold();
    const s = await createSessionForStreamer({ channel, streamerUser });
    const otherUser = await User.create({
      email: "other@x.com",
      password: "hash",
      displayName: "Other",
      emailVerified: true,
    });
    try {
      await abandonSession({ sessionId: s._id.toString(), streamerUser: otherUser });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.code).toBe("not_streamer");
    }
  });

  it("is idempotent when the session is already finished or abandoned", async () => {
    const { streamerUser, channel } = await scaffold();
    const s = await createSessionForStreamer({ channel, streamerUser });
    await abandonSession({ sessionId: s._id.toString(), streamerUser });
    const again = await abandonSession({ sessionId: s._id.toString(), streamerUser });
    expect(again.status).toBe("abandoned");
  });
});

const {
  abandonAllActiveSessionsForChannel,
} = require("../../../services/sessions");

describe("services/sessions — abandonAllActiveSessionsForChannel", () => {
  it("abandons every lobby / in_progress session on the channel", async () => {
    const { streamerUser, channel } = await scaffold();
    // Two active sessions in the channel.
    const Session = require("../../../models/Session");
    const seat = {
      seatIndex: 0,
      playerId: `streamer:${streamerUser._id}`,
      userId: streamerUser._id,
      nickname: streamerUser.displayName,
      role: "streamer",
      playerType: "physical",
      status: "seated",
    };
    await Session.create({ channel: channel._id, gameId: "the-crew", status: "lobby", seats: [seat], version: 0 });
    await Session.create({ channel: channel._id, gameId: "the-crew", status: "lobby", seats: [seat], version: 0 });

    const result = await abandonAllActiveSessionsForChannel({ channel, streamerUser });
    expect(result.count).toBe(2);

    // No active sessions remain.
    const remaining = await getActiveSessionForChannel(channel._id);
    expect(remaining).toBeNull();
  });

  it("leaves finished / abandoned sessions alone", async () => {
    const { streamerUser, channel } = await scaffold();
    const Session = require("../../../models/Session");
    const seat = {
      seatIndex: 0,
      playerId: `streamer:${streamerUser._id}`,
      userId: streamerUser._id,
      nickname: streamerUser.displayName,
      role: "streamer",
      playerType: "physical",
      status: "seated",
    };
    await Session.create({ channel: channel._id, gameId: "the-crew", status: "finished", seats: [seat], version: 0 });
    await Session.create({ channel: channel._id, gameId: "the-crew", status: "abandoned", seats: [seat], version: 0 });
    const result = await abandonAllActiveSessionsForChannel({ channel, streamerUser });
    expect(result.count).toBe(0);
  });

  it("returns count 0 when there is nothing to abandon", async () => {
    const { streamerUser, channel } = await scaffold();
    const result = await abandonAllActiveSessionsForChannel({ channel, streamerUser });
    expect(result.count).toBe(0);
  });

  it("refuses a non-owner", async () => {
    const { channel } = await scaffold();
    const other = await User.create({
      email: "other@x.com",
      password: "hash",
      displayName: "Other",
      emailVerified: true,
    });
    try {
      await abandonAllActiveSessionsForChannel({ channel, streamerUser: other });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.code).toBe("not_owner");
    }
  });
});

describe("services/sessions — viewForRequest during lobby (no gameState yet)", () => {
  // Before startSession, session.gameState is null. viewForRequest must
  // still return a caller-scoped view so the client's SessionView can
  // dispatch to StreamerOperator / DigitalPlayView / SpectatorView
  // correctly. Without this the streamer's GET returned view: null and
  // the client fell through to SpectatorView.

  it("streamer at lobby gets reservedByStreamer + player list from seats", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const view = viewForRequest(session, { kind: "user", userId: streamerUser._id });
    expect(view).not.toBeNull();
    expect(view.phase).toBe("lobby");
    expect(view.reservedByStreamer).toEqual([]);
    expect(view.players).toHaveLength(1);
    expect(view.players[0].role).toBe("streamer");
    expect(view.players[0].nickname).toBe("Claudio");
  });

  it("streamer sees all seated players in the lobby view", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "Ana" });
    await joinAsGuest({ sessionId: session._id.toString(), nickname: "Bea" });
    const fresh = await Session.findById(session._id);
    const view = viewForRequest(fresh, { kind: "user", userId: streamerUser._id });
    expect(view.players).toHaveLength(3);
    const names = view.players.map((p) => p.nickname).sort();
    expect(names).toEqual(["Ana", "Bea", "Claudio"]);
  });

  it("digital guest at lobby gets myHand + myPlayerId", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const g = await joinAsGuest({ sessionId: session._id.toString(), nickname: "Ana" });
    const fresh = await Session.findById(session._id);
    const view = viewForRequest(fresh, {
      kind: "guest",
      playerId: g.seat.playerId,
      sessionId: fresh._id.toString(),
    });
    expect(view.phase).toBe("lobby");
    expect(view.myHand).toEqual([]);
    expect(view.myPlayerId).toBe(g.seat.playerId);
    expect(view).not.toHaveProperty("reservedByStreamer");
  });

  it("anon at lobby gets a spectator view (no myHand, no reservedByStreamer)", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const view = viewForRequest(session, { kind: "anon" });
    expect(view.phase).toBe("lobby");
    expect(view.players).toHaveLength(1);
    expect(view).not.toHaveProperty("myHand");
    expect(view).not.toHaveProperty("reservedByStreamer");
  });

  it("the trick and tricks fields are shaped so the client won't NPE reading them", async () => {
    const { streamerUser, channel } = await scaffold();
    const session = await createSessionForStreamer({ channel, streamerUser });
    const view = viewForRequest(session, { kind: "user", userId: streamerUser._id });
    expect(view.trick).toEqual({ leaderId: null, ledSuit: null, plays: [] });
    expect(view.tricks).toEqual([]);
    expect(view.currentTurnId).toBeNull();
  });
});
