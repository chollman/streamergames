const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../../app");
const { startTestServer, once, collect } = require("../helpers/socketServer");

// End-to-end test with real socket.io clients. Covers Constitution §6's
// most critical rule: private per-player events NEVER reach another player.
// If this test starts silently passing when the isolation is broken (e.g.
// because a bug made everyone join every private room), it's a game-over
// bug — so the assertion pattern is deliberately picky.

const RESERVE_CARDS = [
  "pink-1", "pink-2", "pink-3", "pink-4",
  "yellow-1", "yellow-2", "yellow-3", "yellow-4",
  "green-1", "green-2", "green-3", "green-4",
  "blue-1", "blue-2",
];

async function setupPlayingSession(httpServer) {
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
  const streamerToken = ver.body.token;
  const channelSlug = ver.body.channel.slug;

  const sess = await request(httpServer)
    .post(`/api/channels/${channelSlug}/sessions`)
    .set("Authorization", `Bearer ${streamerToken}`)
    .send({});
  const sessionId = sess.body.session._id;

  const j1 = await request(httpServer)
    .post(`/api/sessions/${sessionId}/join`)
    .send({ nickname: "AnaDigital" });
  const j2 = await request(httpServer)
    .post(`/api/sessions/${sessionId}/join`)
    .send({ nickname: "BeaDigital" });

  await request(httpServer)
    .post(`/api/sessions/${sessionId}/start`)
    .set("Authorization", `Bearer ${streamerToken}`);

  return {
    sessionId,
    streamerToken,
    guestTokenA: j1.body.guestToken,
    guestTokenB: j2.body.guestToken,
    seatA: j1.body.seat,
    seatB: j2.body.seat,
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

describe("Socket.IO — connection + session:join", () => {
  let server;
  beforeEach(async () => {
    server = await startTestServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("anonymous client (no token) connects and receives session:state as spectator on join", async () => {
    const { sessionId } = await setupPlayingSession(server.httpServer);
    const socket = await connect(server.url);
    const wait = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    const state = await wait;
    expect(state.sessionId).toBe(sessionId);
    // Spectator view: no reservedByStreamer, no per-player hand.
    expect(state.view).toBeTruthy();
    expect(state.view).not.toHaveProperty("reservedByStreamer");
    expect(state.view).not.toHaveProperty("myHand");
    socket.disconnect();
  });

  it("streamer client connects with user token and gets the streamer view on join", async () => {
    const { sessionId, streamerToken } = await setupPlayingSession(server.httpServer);
    const socket = await connect(server.url, streamerToken);
    const wait = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    const state = await wait;
    // Streamer view has full player hands (they're empty at this phase but
    // still present) and reservedByStreamer (empty array).
    expect(state.view).toBeTruthy();
    expect(state.view.reservedByStreamer).toBeInstanceOf(Array);
    expect(state.view.players.every((p) => Array.isArray(p.hand))).toBe(true);
    socket.disconnect();
  });

  it("digital guest client connects and gets only their own myHand on join", async () => {
    const { sessionId, guestTokenA } = await setupPlayingSession(server.httpServer);
    const socket = await connect(server.url, guestTokenA);
    const wait = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    const state = await wait;
    expect(state.view).toBeTruthy();
    expect(state.view).toHaveProperty("myHand");
    expect(state.view).not.toHaveProperty("reservedByStreamer");
    // Other players in the view have handSize but no hand.
    for (const p of state.view.players) {
      expect(p).not.toHaveProperty("hand");
      expect(p).toHaveProperty("handSize");
    }
    socket.disconnect();
  });
});

describe("Socket.IO — action pipeline delivers events to the right rooms", () => {
  let server;
  beforeEach(async () => {
    server = await startTestServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("reserve-hand fires session:action-accepted to everyone in the session room", async () => {
    const { sessionId, streamerToken, guestTokenA, guestTokenB } = await setupPlayingSession(server.httpServer);

    const sS = await connect(server.url, streamerToken);
    const sA = await connect(server.url, guestTokenA);
    const sB = await connect(server.url, guestTokenB);

    const joined = Promise.all([
      once(sS, "session:state"),
      once(sA, "session:state"),
      once(sB, "session:state"),
    ]);
    sS.emit("session:join", { sessionId });
    sA.emit("session:join", { sessionId });
    sB.emit("session:join", { sessionId });
    await joined;

    const pub = Promise.all([
      once(sS, "session:action-accepted"),
      once(sA, "session:action-accepted"),
      once(sB, "session:action-accepted"),
    ]);

    await request(server.httpServer)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "reserve-hand", cardIds: RESERVE_CARDS });

    const [envS, envA, envB] = await pub;
    // Same version reaches all three subscribers.
    expect(envS.version).toBe(envA.version);
    expect(envA.version).toBe(envB.version);
    // Envelope carries an anonymous-safe spectator view (no reservedByStreamer,
    // no hands).
    for (const env of [envS, envA, envB]) {
      expect(env.view).not.toHaveProperty("reservedByStreamer");
      for (const p of env.view.players) {
        expect(p).not.toHaveProperty("hand");
      }
    }

    sS.disconnect();
    sA.disconnect();
    sB.disconnect();
  });

  it("PRIVACY CRITICAL: after deal, digital A gets its own myHand and NEVER receives digital B's private view", async () => {
    const { sessionId, streamerToken, guestTokenA, guestTokenB, seatA, seatB } = await setupPlayingSession(server.httpServer);

    const sS = await connect(server.url, streamerToken);
    const sA = await connect(server.url, guestTokenA);
    const sB = await connect(server.url, guestTokenB);

    // Everyone joins.
    const joined = Promise.all([
      once(sS, "session:state"),
      once(sA, "session:state"),
      once(sB, "session:state"),
    ]);
    sS.emit("session:join", { sessionId });
    sA.emit("session:join", { sessionId });
    sB.emit("session:join", { sessionId });
    await joined;

    // Start collecting session:you-are events on each digital socket. If room
    // isolation is broken, sA will collect an event with sB's playerId, and
    // vice versa.
    const collectorA = collect(sA, "session:you-are");
    const collectorB = collect(sB, "session:you-are");
    const collectorS = collect(sS, "session:you-are");

    // Reserve + deal.
    await request(server.httpServer)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "reserve-hand", cardIds: RESERVE_CARDS });
    await request(server.httpServer)
      .post(`/api/sessions/${sessionId}/actions`)
      .set("Authorization", `Bearer ${streamerToken}`)
      .send({ type: "deal" });

    // Give socket.io a moment to deliver the buffered events.
    await new Promise((r) => setTimeout(r, 300));

    // A got at least one private event, and every one it got is for playerId A.
    expect(collectorA.items.length).toBeGreaterThan(0);
    for (const env of collectorA.items) {
      expect(env.view.myPlayerId).toBe(seatA.playerId);
    }
    // B got at least one private event, and every one it got is for playerId B.
    expect(collectorB.items.length).toBeGreaterThan(0);
    for (const env of collectorB.items) {
      expect(env.view.myPlayerId).toBe(seatB.playerId);
    }
    // Streamer is not in any per-player private room (never subscribed).
    expect(collectorS.items).toHaveLength(0);

    // Extra guard: verify A's hand contents don't appear in B's view (and
    // vice versa). If they did, the digital views would have leaked.
    const lastA = collectorA.items[collectorA.items.length - 1];
    const lastB = collectorB.items[collectorB.items.length - 1];
    const overlap = lastA.view.myHand.filter((c) => lastB.view.myHand.includes(c));
    expect(overlap).toEqual([]);

    collectorA.stop();
    collectorB.stop();
    collectorS.stop();

    sS.disconnect();
    sA.disconnect();
    sB.disconnect();
  });
});
