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
