const request = require("supertest");
const app = require("../../app");

async function registerAndLogin(email = "streamer@example.com") {
  const reg = await request(app).post("/api/auth/register").send({
    email,
    password: "supersecret",
    displayName: "Claudio",
  });
  const ver = await request(app)
    .post("/api/auth/verify-email")
    .send({ email, code: reg.body.devCode });
  return { token: ver.body.token, user: ver.body.user, channel: ver.body.channel };
}

describe("POST /api/channels/:slug/queue — enqueue", () => {
  it("guest with nickname gets an entry + queueToken and position 1", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    expect(res.status).toBe(201);
    expect(res.body.entry.nickname).toBe("Ana");
    expect(res.body.entry.status).toBe("waiting");
    expect(res.body.entry.position).toBe(1);
    expect(res.body.queueToken).toEqual(expect.any(String));
  });

  it("returns 404 for unknown channel", async () => {
    const res = await request(app).post("/api/channels/nope/queue").send({ nickname: "Ana" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("channel_not_found");
  });

  it("rejects an empty nickname (400)", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("missing_fields");
  });

  it("reports position 3 for the third joiner", async () => {
    const { channel } = await registerAndLogin();
    await request(app).post(`/api/channels/${channel.slug}/queue`).send({ nickname: "A" });
    await request(app).post(`/api/channels/${channel.slug}/queue`).send({ nickname: "B" });
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "C" });
    expect(res.body.entry.position).toBe(3);
  });
});

describe("GET /api/channels/:slug/queue — owner listing", () => {
  it("owner sees the queue sorted top-first", async () => {
    const { token, channel } = await registerAndLogin();
    await request(app).post(`/api/channels/${channel.slug}/queue`).send({ nickname: "A" });
    await request(app).post(`/api/channels/${channel.slug}/queue`).send({ nickname: "B" });
    const res = await request(app)
      .get(`/api/channels/${channel.slug}/queue`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(2);
    expect(res.body.queue.map((e) => e.nickname).sort()).toEqual(["A", "B"]);
  });

  it("rejects unauthenticated", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app).get(`/api/channels/${channel.slug}/queue`);
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner", async () => {
    const A = await registerAndLogin("a@example.com");
    const B = await registerAndLogin("b@example.com");
    const res = await request(app)
      .get(`/api/channels/${A.channel.slug}/queue`)
      .set("Authorization", `Bearer ${B.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_owner");
  });
});

describe("GET /api/channels/:slug/queue/me — entrant view", () => {
  it("returns position + status for a waiting entry authed by its queueToken", async () => {
    const { channel } = await registerAndLogin();
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const qToken = enq.body.queueToken;
    const me = await request(app)
      .get(`/api/channels/${channel.slug}/queue/me`)
      .set("Authorization", `Bearer ${qToken}`);
    expect(me.status).toBe(200);
    expect(me.body.entry.nickname).toBe("Ana");
    expect(me.body.entry.status).toBe("waiting");
    expect(me.body.entry.position).toBe(1);
  });

  it("rejects with no token", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app).get(`/api/channels/${channel.slug}/queue/me`);
    expect(res.status).toBe(401);
  });

  it("rejects a queueToken for another channel", async () => {
    const A = await registerAndLogin("a@example.com");
    const B = await registerAndLogin("b@example.com");
    const enq = await request(app)
      .post(`/api/channels/${A.channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const qToken = enq.body.queueToken;
    const res = await request(app)
      .get(`/api/channels/${B.channel.slug}/queue/me`)
      .set("Authorization", `Bearer ${qToken}`);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/channels/:slug/queue/:entryId — streamer kick", () => {
  it("owner kicks a waiting entry", async () => {
    const { token, channel } = await registerAndLogin();
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const entryId = enq.body.entry._id;
    const res = await request(app)
      .delete(`/api/channels/${channel.slug}/queue/${entryId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe("kicked");
  });

  it("rejects a non-owner", async () => {
    const A = await registerAndLogin("a@example.com");
    const B = await registerAndLogin("b@example.com");
    const enq = await request(app)
      .post(`/api/channels/${A.channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const entryId = enq.body.entry._id;
    const res = await request(app)
      .delete(`/api/channels/${A.channel.slug}/queue/${entryId}`)
      .set("Authorization", `Bearer ${B.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_owner");
  });

  it("refuses to kick an entry that belongs to a different channel", async () => {
    const A = await registerAndLogin("a@example.com");
    const B = await registerAndLogin("b@example.com");
    // Enqueue on B's channel...
    const enq = await request(app)
      .post(`/api/channels/${B.channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const entryId = enq.body.entry._id;
    // ...try to kick as A on A's channel path.
    const res = await request(app)
      .delete(`/api/channels/${A.channel.slug}/queue/${entryId}`)
      .set("Authorization", `Bearer ${A.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("wrong_channel");
  });
});

describe("POST /api/channels/:slug/queue/leave — entrant leaves", () => {
  it("entrant with queueToken leaves and is marked 'left'", async () => {
    const { channel } = await registerAndLogin();
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const qToken = enq.body.queueToken;
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue/leave`)
      .set("Authorization", `Bearer ${qToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe("left");
  });

  it("rejects with no token", async () => {
    const { channel } = await registerAndLogin();
    const res = await request(app).post(`/api/channels/${channel.slug}/queue/leave`).send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/channels/:slug/sessions/:sessionId/offer/:entryId — streamer offers a seat", () => {
  async function ownerSessionAndEntry() {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    return { token, channel, sessionId, entryId: enq.body.entry._id, queueToken: enq.body.queueToken };
  }

  it("moves the entry to 'offered' with an expiry and target session", async () => {
    const { token, channel, sessionId, entryId } = await ownerSessionAndEntry();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/${sessionId}/offer/${entryId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe("offered");
    expect(res.body.entry.offerExpiresAt).toBeTruthy();
    expect(res.body.entry.offeredSessionId).toBe(sessionId);
  });

  it("rejects a non-owner", async () => {
    const { channel, sessionId, entryId } = await ownerSessionAndEntry();
    const other = await registerAndLogin("other@example.com");
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/${sessionId}/offer/${entryId}`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("not_owner");
  });

  it("refuses to offer an entry from another channel", async () => {
    const A = await registerAndLogin("a@example.com");
    const B = await registerAndLogin("b@example.com");
    // Session on A's channel, entry on B's channel.
    const created = await request(app)
      .post(`/api/channels/${A.channel.slug}/sessions`)
      .set("Authorization", `Bearer ${A.token}`)
      .send({});
    const enq = await request(app)
      .post(`/api/channels/${B.channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const res = await request(app)
      .post(`/api/channels/${A.channel.slug}/sessions/${created.body.session._id}/offer/${enq.body.entry._id}`)
      .set("Authorization", `Bearer ${A.token}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("wrong_channel");
  });

  it("refuses to offer once the session is no longer in lobby", async () => {
    const { token, channel, sessionId, entryId } = await ownerSessionAndEntry();
    // Need two guests to start (game.minPlayers = 3 for The Crew).
    await request(app).post(`/api/channels/${channel.slug}/queue`).send({ nickname: "Zzz" });
    // Directly seat 2 guests to be able to start:
    const j1 = await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "j1" });
    const j2 = await request(app).post(`/api/sessions/${sessionId}/join`).send({ nickname: "j2" });
    await request(app)
      .post(`/api/sessions/${sessionId}/start`)
      .set("Authorization", `Bearer ${token}`);
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/sessions/${sessionId}/offer/${entryId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("session_not_in_lobby");
  });
});

describe("POST /api/channels/:slug/queue/accept — entrant accepts a seat", () => {
  async function offered() {
    const { token, channel } = await registerAndLogin();
    const created = await request(app)
      .post(`/api/channels/${channel.slug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = created.body.session._id;
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const entryId = enq.body.entry._id;
    const queueToken = enq.body.queueToken;
    await request(app)
      .post(`/api/channels/${channel.slug}/sessions/${sessionId}/offer/${entryId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    return { channel, sessionId, entryId, queueToken };
  }

  it("seats the entrant and returns a session-scoped guestToken", async () => {
    const { channel, sessionId, queueToken } = await offered();
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue/accept`)
      .set("Authorization", `Bearer ${queueToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.session._id).toBe(sessionId);
    expect(res.body.seat.role).toBe("digital");
    expect(res.body.seat.nickname).toBe("Ana");
    expect(res.body.guestToken).toEqual(expect.any(String));
    // Entry is now seated.
    const me = await request(app)
      .get(`/api/channels/${channel.slug}/queue/me`)
      .set("Authorization", `Bearer ${queueToken}`);
    expect(me.status).toBe(200);
    expect(me.body.entry.status).toBe("seated");
  });

  it("rejects without a queueToken", async () => {
    const { channel } = await offered();
    const res = await request(app).post(`/api/channels/${channel.slug}/queue/accept`).send({});
    expect(res.status).toBe(401);
  });

  it("rejects when the entry is not offered", async () => {
    const { token, channel } = await registerAndLogin();
    const enq = await request(app)
      .post(`/api/channels/${channel.slug}/queue`)
      .send({ nickname: "Ana" });
    const res = await request(app)
      .post(`/api/channels/${channel.slug}/queue/accept`)
      .set("Authorization", `Bearer ${enq.body.queueToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("no_active_offer");
  });

  it("/queue/me carries offeredSessionId when the entry is offered", async () => {
    const { channel, sessionId, queueToken } = await offered();
    const res = await request(app)
      .get(`/api/channels/${channel.slug}/queue/me`)
      .set("Authorization", `Bearer ${queueToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe("offered");
    expect(res.body.entry.offeredSessionId).toBe(sessionId);
  });
});
