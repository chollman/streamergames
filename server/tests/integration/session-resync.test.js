const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const app = require("../../app");
const { startTestServer, once } = require("../helpers/socketServer");

// The client emits session:resync-request when it detects a version gap.
// The server replies with session:state (same shape as the initial state
// on join) so the caller's slice can be repopulated in one step.
// Constitution §6.

async function setup(httpServer) {
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
    .send({ nickname: "Ana" });
  await request(httpServer)
    .post(`/api/sessions/${sessionId}/join`)
    .send({ nickname: "Bea" });
  await request(httpServer)
    .post(`/api/sessions/${sessionId}/start`)
    .set("Authorization", `Bearer ${streamerToken}`);

  return { sessionId, streamerToken, guestTokenA: j1.body.guestToken };
}

async function connect(url, token) {
  const socket = ioClient(url, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("socket connect timeout")), 4000);
    socket.on("connect", () => { clearTimeout(t); resolve(); });
    socket.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
  return socket;
}

describe("Socket.IO — session:resync-request", () => {
  let server;
  beforeEach(async () => { server = await startTestServer(); });
  afterEach(async () => { await server.close(); });

  it("streamer emits resync-request and receives session:state with the streamer view", async () => {
    const { sessionId, streamerToken } = await setup(server.httpServer);
    const socket = await connect(server.url, streamerToken);
    // Join to be part of the session's room, then intentionally re-request
    // state to simulate a version-gap recovery.
    const initial = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    await initial;

    const wait = once(socket, "session:state");
    socket.emit("session:resync-request", { sessionId });
    const state = await wait;
    expect(state.sessionId).toBe(sessionId);
    // Streamer view carries reservedByStreamer.
    expect(state.view).toBeTruthy();
    expect(state.view.reservedByStreamer).toBeInstanceOf(Array);
    // The resync envelope is flagged so the client can differentiate if it
    // ever wants to (e.g. to log). Same shape otherwise.
    expect(state.resync).toBe(true);
    socket.disconnect();
  });

  it("digital emits resync-request and receives session:state with their private view", async () => {
    const { sessionId, guestTokenA } = await setup(server.httpServer);
    const socket = await connect(server.url, guestTokenA);
    const initial = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    await initial;

    const wait = once(socket, "session:state");
    socket.emit("session:resync-request", { sessionId });
    const state = await wait;
    expect(state.view).toBeTruthy();
    expect(state.view).toHaveProperty("myHand");
    expect(state.view).not.toHaveProperty("reservedByStreamer");
    expect(state.resync).toBe(true);
    socket.disconnect();
  });

  it("anon emits resync-request and receives a spectator view", async () => {
    const { sessionId } = await setup(server.httpServer);
    const socket = await connect(server.url);
    const initial = once(socket, "session:state");
    socket.emit("session:join", { sessionId });
    await initial;

    const wait = once(socket, "session:state");
    socket.emit("session:resync-request", { sessionId });
    const state = await wait;
    expect(state.view).toBeTruthy();
    expect(state.view).not.toHaveProperty("reservedByStreamer");
    expect(state.view).not.toHaveProperty("myHand");
    socket.disconnect();
  });

  it("resync-request for an unknown session is a no-op (no reply)", async () => {
    await setup(server.httpServer);
    const socket = await connect(server.url);
    // No prior session:join — the server should simply ignore an unknown id.
    let got = null;
    socket.on("session:state", (env) => { got = env; });
    socket.emit("session:resync-request", { sessionId: "507f1f77bcf86cd799439011" });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toBeNull();
    socket.disconnect();
  });
});
