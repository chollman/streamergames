const Session = require("../../models/Session");
const Channel = require("../../models/Channel");
const User = require("../../models/User");
const emitSessionEvent = require("../../utils/emitSessionEvent");

function makeIoStub() {
  const emitted = [];
  const io = {
    to(room) {
      return {
        emit(eventName, envelope) {
          emitted.push({ room, eventName, envelope });
        },
      };
    },
  };
  return { io, emitted };
}

async function makeSession() {
  const user = await User.create({
    email: `u${Date.now()}${Math.random()}@x.com`,
    password: "hash",
    displayName: "u",
  });
  const channel = await Channel.create({
    slug: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    displayName: "c",
    ownerUserId: user._id,
  });
  return Session.create({ channel: channel._id, gameId: "the-crew" });
}

describe("emitSessionEvent", () => {
  it("increments session.version and emits an envelope to every room", async () => {
    const session = await makeSession();
    const { io, emitted } = makeIoStub();

    const envelope = await emitSessionEvent(
      io,
      session._id.toString(),
      "session:action-accepted",
      { action: { type: "play-card", cardId: "pink-6" } },
      {
        rooms: [
          `session:${session._id}`,
          `session:${session._id}:player:p1`,
        ],
      }
    );

    expect(envelope.version).toBe(1);
    expect(envelope.sessionId).toBe(session._id.toString());
    expect(envelope.timestamp).toEqual(expect.any(String));
    expect(envelope.action).toEqual({ type: "play-card", cardId: "pink-6" });

    expect(emitted).toHaveLength(2);
    expect(emitted[0].room).toBe(`session:${session._id}`);
    expect(emitted[1].room).toBe(`session:${session._id}:player:p1`);

    const reloaded = await Session.findById(session._id);
    expect(reloaded.version).toBe(1);
  });

  it("increments version monotonically on every subsequent emit", async () => {
    const session = await makeSession();
    const { io } = makeIoStub();
    const rooms = [`session:${session._id}`];
    const first = await emitSessionEvent(io, session._id.toString(), "e1", {}, { rooms });
    const second = await emitSessionEvent(io, session._id.toString(), "e2", {}, { rooms });
    const third = await emitSessionEvent(io, session._id.toString(), "e3", {}, { rooms });
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(third.version).toBe(3);
  });

  it("does not emit to any room when rooms is empty", async () => {
    const session = await makeSession();
    const { io, emitted } = makeIoStub();
    await emitSessionEvent(io, session._id.toString(), "e", {}, { rooms: [] });
    expect(emitted).toHaveLength(0);
  });

  it("still increments version even when emitting to zero rooms", async () => {
    const session = await makeSession();
    const { io } = makeIoStub();
    const envelope = await emitSessionEvent(io, session._id.toString(), "e", {}, { rooms: [] });
    expect(envelope.version).toBe(1);
    const reloaded = await Session.findById(session._id);
    expect(reloaded.version).toBe(1);
  });

  it("throws with status 404 when the session does not exist", async () => {
    const { io } = makeIoStub();
    const fakeId = "507f1f77bcf86cd799439011";
    await expect(
      emitSessionEvent(io, fakeId, "e", {}, { rooms: [] })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws when rooms is not an array (contract guard)", async () => {
    const session = await makeSession();
    const { io } = makeIoStub();
    await expect(
      emitSessionEvent(io, session._id.toString(), "e", {}, { rooms: "session:1" })
    ).rejects.toThrow(/rooms must be an array/);
  });

  it("envelope keys always win: a caller cannot override version, sessionId, or timestamp via payload", async () => {
    const session = await makeSession();
    const { io } = makeIoStub();
    const beforeTs = Date.now();
    const envelope = await emitSessionEvent(
      io,
      session._id.toString(),
      "e",
      {
        version: 999,
        sessionId: "spoofed",
        timestamp: "1970-01-01T00:00:00.000Z",
        payloadField: "kept",
      },
      { rooms: [`session:${session._id}`] }
    );
    expect(envelope.version).toBe(1);
    expect(envelope.sessionId).toBe(session._id.toString());
    expect(new Date(envelope.timestamp).getTime()).toBeGreaterThanOrEqual(beforeTs);
    expect(envelope.payloadField).toBe("kept");
  });

  it("with io=null: increments version and returns the envelope without emitting", async () => {
    const session = await makeSession();
    const envelope = await emitSessionEvent(
      null,
      session._id.toString(),
      "e",
      { foo: "bar" },
      { rooms: [`session:${session._id}`] }
    );
    expect(envelope.version).toBe(1);
    expect(envelope.foo).toBe("bar");
    const reloaded = await Session.findById(session._id);
    expect(reloaded.version).toBe(1);
  });
});
