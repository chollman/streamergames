const request = require("supertest");
const app = require("../../app");

async function registerAndLogin() {
  const reg = await request(app).post("/api/auth/register").send({
    email: "streamer@example.com",
    password: "supersecret",
    displayName: "Claudio",
  });
  const ver = await request(app)
    .post("/api/auth/verify-email")
    .send({ email: "streamer@example.com", code: reg.body.devCode });
  return { token: ver.body.token, user: ver.body.user, channel: ver.body.channel };
}

describe("POST /api/channels/:slug/sessions", () => {
  it("owner creates a session on their channel", async () => {
    const { token, channel } = await registerAndLogin();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe("lobby");
    expect(res.body.session.seats).toHaveLength(1);
    expect(res.body.session.seats[0].role).toBe("streamer");
  });

  it("rejects unauthenticated caller", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown channel slug", async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post("/api/channels/nope/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("channel_not_found");
  });
});

describe("POST /api/sessions/:id/join", () => {
  it("guest joins with a nickname, gets a guestToken", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/join`)
      .send({ nickname: "Ana" });
    expect(res.status).toBe(201);
    expect(res.body.seat.role).toBe("digital");
    expect(res.body.seat.nickname).toBe("Ana");
    expect(res.body.guestToken).toEqual(expect.any(String));
  });
});

describe("POST /api/sessions/:id/start", () => {
  it("streamer starts a session with 3 players", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "A" });
    await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "B" });

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("in_progress");
    expect(res.body.session.gameState.phase).toBe("reserving");
  });
});

describe("POST /api/sessions/:id/actions — the full pipeline", () => {
  async function readyToPlay() {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    const j1 = await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "A" });
    const j2 = await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "B" });
    await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .set("Authorization", `Bearer ${token}`);
    return { sessionId, streamerToken: token, guestTokenA: j1.body.guestToken, guestTokenB: j2.body.guestToken };
  }

  it("streamer reserves 14 cards and receives streamer view", async () => {
    const { sessionId, streamerToken } = await readyToPlay();
    const cards = ["pink-1","pink-2","pink-3","pink-4","yellow-1","yellow-2","yellow-3","yellow-4","green-1","green-2","green-3","green-4","blue-1","blue-2"];
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "reserve-hand", cardIds: cards });
    expect(res.status).toBe(200);
    expect(res.body.view.reservedByStreamer).toEqual(cards);
  });

  it("rejects an action without any auth (anonymous)", async () => {
    const { sessionId } = await readyToPlay();
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/actions`)
      .send({ type: "reserve-hand", cardIds: [] });
    expect(res.status).toBe(401);
  });

  it("rejects a guest playing on someone else's turn", async () => {
    const { sessionId, streamerToken, guestTokenA } = await readyToPlay();
    // Move past reserving/dealing so a play-card action is valid to try.
    const cards = ["pink-1","pink-2","pink-3","pink-4","yellow-1","yellow-2","yellow-3","yellow-4","green-1","green-2","green-3","green-4","blue-1","blue-2"];
    await request(app)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "reserve-hand", cardIds: cards });
    await request(app)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "deal" });

    // Now check current turn — if guestA isn't up, playing anything should fail.
    const detail = await request(app).get(`/api/sessions/${sessionId}`);
    const currentTurnId = detail.body.session.gameState.currentTurnId;
    // Fetch guestA's seat playerId
    const guestASeat = detail.body.session.seats.find((s) => s.nickname === "A");
    if (guestASeat.playerId !== currentTurnId) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/actions`)
        .set("Authorization", `Bearer ${guestTokenA}`)
        .send({ type: "play-card", cardId: "pink-1" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("invalid_action");
    }
  });
});

describe("GET /api/sessions/:id — view filtering", () => {
  it("anonymous request gets spectator view (no reservedByStreamer, no hands)", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "A" });
    await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "B" });
    await request(app).post(`/api/sessions/${sessionId}/start`).set("Authorization", `Bearer ${token}`);
    const cards = ["pink-1","pink-2","pink-3","pink-4","yellow-1","yellow-2","yellow-3","yellow-4","green-1","green-2","green-3","green-4","blue-1","blue-2"];
    await request(app)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "reserve-hand", cardIds: cards });

    const res = await request(app).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.view).toBeTruthy();
    expect(res.body.view).not.toHaveProperty("reservedByStreamer");
    for (const p of res.body.view.players) {
      expect(p).not.toHaveProperty("hand");
    }
  });

  it("streamer GET during lobby (no gameState yet) still returns reservedByStreamer + seats", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;

    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.view).toBeTruthy();
    expect(res.body.view.phase).toBe("lobby");
    expect(res.body.view.reservedByStreamer).toEqual([]);
    expect(res.body.view.players).toHaveLength(1);
    expect(res.body.view.players[0].role).toBe("streamer");
  });

  it("digital guest GET during lobby returns myHand + myPlayerId", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    const joined = await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "Ana" });
    const guestToken = joined.body.guestToken;

    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${guestToken}`);
    expect(res.status).toBe(200);
    expect(res.body.view.phase).toBe("lobby");
    expect(res.body.view.myHand).toEqual([]);
    expect(res.body.view.myPlayerId).toBe(joined.body.seat.playerId);
  });

  it("anon GET during lobby returns spectator view (players from seats, no leak)", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;

    const res = await request(app).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.view.phase).toBe("lobby");
    expect(res.body.view).not.toHaveProperty("reservedByStreamer");
    expect(res.body.view).not.toHaveProperty("myHand");
    expect(res.body.view.players).toHaveLength(1);
  });
});

describe("POST /api/channels/:slug/sessions — active session guard", () => {
  it("refuses a second create while an active session exists, returning 409 with sessionId", async () => {
    const { token, channel } = await registerAndLogin();
    const first = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(first.status).toBe(201);
    const firstId = first.body.session._id;

    const second = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("active_session_exists");
    expect(second.body.sessionId).toBe(firstId);
  });

  it("allows creating a new session after the previous one is abandoned", async () => {
    const { token, channel } = await registerAndLogin();
    const first = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const firstId = first.body.session._id;

    const abandon = await request(app)
      .post(`/api/sessions/${firstId}/abandon`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(abandon.status).toBe(200);
    expect(abandon.body.session.status).toBe("abandoned");

    const second = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(second.status).toBe(201);
    expect(second.body.session._id).not.toBe(firstId);
  });
});

describe("GET /api/channels/:slug/sessions/active", () => {
  it("returns 204 when no active session exists", async () => {
    const { token, channel } = await registerAndLogin();
    const res = await request(app)
      .get(`/api/channels/${channel.slug}/sessions/active`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it("returns the session when one is active", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;

    const res = await request(app)
      .get(`/api/channels/${channel.slug}/sessions/active`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.session._id).toBe(sessionId);
    expect(res.body.session.status).toBe("lobby");
  });

  it("rejects unauthenticated caller", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app).get(`/api/channels/${channel.slug}/sessions/active`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown channel slug", async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get("/api/channels/nope/sessions/active")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("channel_not_found");
  });
});

describe("POST /api/sessions/:id/abandon", () => {
  it("streamer abandons their own lobby session", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/abandon`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("abandoned");
    expect(res.body.session.finishedAt).toBeTruthy();
  });

  it("is idempotent — abandoning an already-abandoned session returns 200", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    await request(app)
      .post(`/api/sessions/${sessionId}/abandon`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const again = await request(app)
      .post(`/api/sessions/${sessionId}/abandon`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.session.status).toBe("abandoned");
  });

  it("rejects unauthenticated caller", async () => {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    const res = await request(app).post(`/api/sessions/${sessionId}/abandon`).send({});
    expect(res.status).toBe(401);
  });

  it("rejects a non-streamer caller (403 not_streamer)", async () => {
    // Streamer A creates a session.
    const A = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${A.channel.slug}/sessions`)
      .set("Authorization", `Bearer ${A.token}`)
      .send({});
    const sessionId = created.body.session._id;

    // Streamer B tries to abandon it. registerAndLogin uses the same
    // canned email so we need a second helper for a different user.
    const reg2 = await request(app).post("/api/auth/register").send({
      email: "otro@example.com",
      password: "supersecret",
      displayName: "Otro",
    });
    const ver2 = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "otro@example.com", code: reg2.body.devCode });
    const otherToken = ver2.body.token;

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/abandon`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_streamer");
  });
});

describe("POST /api/channels/:slug/sessions/abandon-active", () => {
  it("closes every lobby / in_progress session on the channel", async () => {
    const { token, channel } = await registerAndLogin();
    // Seed two active sessions by writing directly (simulating the pre-guard state).
    const Session = require("../../models/Session");
    const Channel = require("../../models/Channel");
    const ch = await Channel.findOne({ slug: channel.slug });
    const seat = {
      seatIndex: 0,
      playerId: `streamer:${ch.ownerUserId}`,
      userId: ch.ownerUserId,
      nickname: "S",
      role: "streamer",
      playerType: "physical",
      status: "seated",
    };
    await Session.create({ channel: ch._id, gameId: "the-crew", status: "lobby", seats: [seat], version: 0 });
    await Session.create({ channel: ch._id, gameId: "the-crew", status: "lobby", seats: [seat], version: 0 });

    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/abandon-active`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    // A subsequent create now succeeds.
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(created.status).toBe(201);
  });

  it("returns count: 0 when there is nothing to abandon", async () => {
    const { token, channel } = await registerAndLogin();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/abandon-active`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("rejects unauthenticated caller", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app).post(`/api/channels/${channel.slug}/sessions/abandon-active`).send({});
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner", async () => {
    const { channel } = await registerAndLogin();
    // Second streamer with their own channel; try to bulk-abandon on the first's channel.
    const reg = await request(app).post("/api/auth/register").send({
      email: "other@example.com",
      password: "supersecret",
      displayName: "Otro",
    });
    const ver = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "other@example.com", code: reg.body.devCode });
    const otherToken = ver.body.token;
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/abandon-active`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_owner");
  });
});
