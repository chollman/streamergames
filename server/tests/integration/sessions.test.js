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
});
