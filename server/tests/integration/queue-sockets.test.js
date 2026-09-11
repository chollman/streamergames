const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../../app");
const { startTestServer, once, collect } = require("../helpers/socketServer");

// End-to-end test with real socket.io clients for the queue events added
// in F2c.3. Two events matter:
//   seat-queue:updated  → the public queue room (channel:<slug>:queue),
//                         every subscriber sees enqueue/kick/leave/offer/accept.
//   seat:offered        → per-entry room (channel:<slug>:queue:entry:<id>),
//                         only the entrant's own tab receives it.
// Isolation: an offer to entry A must NEVER reach entry B's per-entry room.

async function registerStreamer(httpServer) {
  const reg = await request(httpServer)
    .post("/api/auth/register")
    .send({
      email: `s${Date.now()}${Math.random()}@x.com`,
      password: "supersecret",
      displayName: "Streamer",
    });
  const ver = await request(httpServer)
    .post("/api/auth/verify-email")
    .send({ email: reg.body.email, code: reg.body.devCode });
  return {
    token: ver.body.token,
    channelSlug: ver.body.channel.slug,
  };
}

async function connect(url, token) {
  const socket = ioClient(url, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("socket connect timeout")), 4000);
    socket.on("connect", () => {
      clearTimeout(t);
      resolve();
    });
    socket.on("connect_error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  return socket;
}

describe("Socket.IO — queue events", () => {
  let server;
  beforeEach(async () => {
    server = await startTestServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("subscribers to channel:<slug>:queue receive seat-queue:updated on enqueue", async () => {
    const { channelSlug } = await registerStreamer(server.httpServer);
    // Anon subscriber (a spectator watching the channel page, for example).
    const s = await connect(server.url);
    const wait = once(s, "seat-queue:updated");
    s.emit("queue:join", { channelSlug });
    // Give socket.io a beat to process the join before we cause the emit.
    await new Promise((r) => setTimeout(r, 100));

    await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/queue`)
      .send({ nickname: "Ana" });

    const env = await wait;
    expect(env.channelSlug).toBe(channelSlug);
    expect(env.queue).toHaveLength(1);
    expect(env.queue[0].nickname).toBe("Ana");
    expect(env.queue[0].status).toBe("waiting");
    s.disconnect();
  });

  it("streamer's queue socket receives seat-queue:updated on kick", async () => {
    const { token, channelSlug } = await registerStreamer(server.httpServer);
    const enq = await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/queue`)
      .send({ nickname: "Ana" });
    const entryId = enq.body.entry._id;

    const s = await connect(server.url, token);
    const wait = once(s, "seat-queue:updated");
    s.emit("queue:join", { channelSlug });
    await new Promise((r) => setTimeout(r, 100));

    await request(server.httpServer)
      .delete(`/api/channels/${channelSlug}/queue/${entryId}`)
      .set("Authorization", `Bearer ${token}`);

    const env = await wait;
    expect(env.channelSlug).toBe(channelSlug);
    expect(env.queue).toHaveLength(0);
    s.disconnect();
  });

  it("only the offered entry's per-entry room receives seat:offered", async () => {
    const { token, channelSlug } = await registerStreamer(server.httpServer);
    // Session in lobby for the offer to target.
    const sess = await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/sessions`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const sessionId = sess.body.session._id;

    // Two entries in the queue.
    const eA = await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/queue`)
      .send({ nickname: "Ana" });
    const eB = await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/queue`)
      .send({ nickname: "Bea" });

    // Each entry's browser tab subscribes with its own queueToken.
    const sA = await connect(server.url, eA.body.queueToken);
    const sB = await connect(server.url, eB.body.queueToken);
    const collectorA = collect(sA, "seat:offered");
    const collectorB = collect(sB, "seat:offered");
    sA.emit("queue:join", { channelSlug });
    sB.emit("queue:join", { channelSlug });
    await new Promise((r) => setTimeout(r, 100));

    // Streamer offers a seat to A only.
    await request(server.httpServer)
      .post(`/api/channels/${channelSlug}/sessions/${sessionId}/offer/${eA.body.entry._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    // Give a moment for delivery.
    await new Promise((r) => setTimeout(r, 200));

    // A received the offer; B never did.
    expect(collectorA.items.length).toBeGreaterThan(0);
    const offer = collectorA.items[0];
    expect(offer.entryId).toBe(eA.body.entry._id);
    expect(offer.sessionId).toBe(sessionId);
    expect(offer.channelSlug).toBe(channelSlug);
    expect(offer.offerExpiresAt).toBeTruthy();

    expect(collectorB.items).toHaveLength(0);

    collectorA.stop();
    collectorB.stop();
    sA.disconnect();
    sB.disconnect();
  });
});
