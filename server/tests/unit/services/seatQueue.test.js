const {
  enqueue,
  listWaiting,
  listActive,
  positionFor,
  offerSeat,
  acceptSeat,
  kickEntry,
  leaveQueue,
  bumpWaitingKarma,
  signQueueToken,
  verifyQueueToken,
} = require("../../../services/seatQueue");
const User = require("../../../models/User");
const Channel = require("../../../models/Channel");
const SeatQueueEntry = require("../../../models/SeatQueue");

async function scaffold() {
  const owner = await User.create({
    email: "s@x.com",
    password: "h",
    displayName: "Claudio",
    emailVerified: true,
  });
  const channel = await Channel.create({
    slug: "claudio",
    displayName: "Claudio",
    ownerUserId: owner._id,
  });
  return { owner, channel };
}

describe("services/seatQueue — enqueue", () => {
  it("adds a guest entry and returns a queueToken", async () => {
    const { channel } = await scaffold();
    const { entry, queueToken } = await enqueue({ channel, nickname: "Ana" });
    expect(entry.nickname).toBe("Ana");
    expect(entry.status).toBe("waiting");
    expect(entry.karma).toBe(0);
    expect(entry.userId).toBeNull();
    expect(queueToken).toEqual(expect.any(String));
    const decoded = verifyQueueToken(queueToken);
    expect(decoded.entryId).toBe(entry._id.toString());
    expect(decoded.channelSlug).toBe(channel.slug);
  });

  it("rejects empty nickname", async () => {
    const { channel } = await scaffold();
    await expect(enqueue({ channel, nickname: "" })).rejects.toMatchObject({
      status: 400,
      code: "missing_fields",
    });
    await expect(enqueue({ channel, nickname: "   " })).rejects.toMatchObject({
      status: 400,
      code: "missing_fields",
    });
  });

  it("rejects nicknames over 50 chars", async () => {
    const { channel } = await scaffold();
    await expect(enqueue({ channel, nickname: "x".repeat(51) })).rejects.toMatchObject({
      status: 400,
      code: "nickname_too_long",
    });
  });

  it("idempotent for a signed-in user with a waiting entry", async () => {
    const { channel } = await scaffold();
    const user = await User.create({ email: "u@x.com", password: "h", displayName: "U" });
    const first = await enqueue({ channel, nickname: "OldName", user });
    const second = await enqueue({ channel, nickname: "NewName", user });
    expect(second.entry._id.toString()).toBe(first.entry._id.toString());
    // Nickname refreshed
    const fresh = await SeatQueueEntry.findById(first.entry._id);
    expect(fresh.nickname).toBe("NewName");
  });

  it("creates a new entry per guest (no dedup for anons)", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "Ana" });
    const b = await enqueue({ channel, nickname: "Ana" });
    expect(a.entry._id.toString()).not.toBe(b.entry._id.toString());
  });
});

describe("services/seatQueue — listing + position", () => {
  it("listWaiting orders by karma desc, then oldest first", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const b = await enqueue({ channel, nickname: "B" });
    const c = await enqueue({ channel, nickname: "C" });
    // Boost B's karma so B jumps to top.
    await SeatQueueEntry.findByIdAndUpdate(b.entry._id, { karma: 5 });

    const rows = await listWaiting(channel._id);
    expect(rows.map((r) => r.nickname)).toEqual(["B", "A", "C"]);
  });

  it("listActive includes offered entries too", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const b = await enqueue({ channel, nickname: "B" });
    await offerSeat({ entryId: b.entry._id, ttlSeconds: 30 });
    const rows = await listActive(channel._id);
    const names = rows.map((r) => r.nickname).sort();
    expect(names).toEqual(["A", "B"]);
  });

  it("positionFor returns 1-based rank; null for non-waiting", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const b = await enqueue({ channel, nickname: "B" });
    const c = await enqueue({ channel, nickname: "C" });
    expect(await positionFor(channel._id, a.entry._id)).toBe(1);
    expect(await positionFor(channel._id, b.entry._id)).toBe(2);
    expect(await positionFor(channel._id, c.entry._id)).toBe(3);

    await kickEntry({ entryId: b.entry._id });
    expect(await positionFor(channel._id, b.entry._id)).toBeNull();
    // A stays at 1, C moves to 2.
    expect(await positionFor(channel._id, a.entry._id)).toBe(1);
    expect(await positionFor(channel._id, c.entry._id)).toBe(2);
  });
});

describe("services/seatQueue — offer / accept lifecycle", () => {
  it("offer moves waiting → offered with an expiry", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const before = Date.now();
    const offered = await offerSeat({ entryId: a.entry._id, ttlSeconds: 30 });
    expect(offered.status).toBe("offered");
    expect(offered.offerExpiresAt).toBeTruthy();
    expect(offered.offerExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 29_000);
    expect(offered.offerExpiresAt.getTime()).toBeLessThanOrEqual(before + 31_000);
  });

  it("offer refuses if entry isn't waiting", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    await kickEntry({ entryId: a.entry._id });
    await expect(offerSeat({ entryId: a.entry._id })).rejects.toMatchObject({
      status: 400,
      code: "entry_not_waiting",
    });
  });

  it("accept moves offered → seated and drops karma by 1", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    await SeatQueueEntry.findByIdAndUpdate(a.entry._id, { karma: 3 });
    await offerSeat({ entryId: a.entry._id });
    const seated = await acceptSeat({
      entryId: a.entry._id,
      sessionId: "507f1f77bcf86cd799439011",
      playerId: "guest:xyz",
    });
    expect(seated.status).toBe("seated");
    expect(seated.karma).toBe(2);
    expect(seated.playerId).toBe("guest:xyz");
    expect(seated.offerExpiresAt).toBeNull();
  });

  it("accept refuses if there's no active offer", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    await expect(
      acceptSeat({ entryId: a.entry._id, sessionId: "x", playerId: "y" })
    ).rejects.toMatchObject({ status: 400, code: "no_active_offer" });
  });

  it("accept refuses (and resets to waiting) when the offer has expired", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    await offerSeat({ entryId: a.entry._id, ttlSeconds: 30 });
    // Manually rewind the expiry to the past.
    await SeatQueueEntry.findByIdAndUpdate(a.entry._id, {
      offerExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      acceptSeat({ entryId: a.entry._id, sessionId: "x", playerId: "y" })
    ).rejects.toMatchObject({ status: 410, code: "offer_expired" });
    const back = await SeatQueueEntry.findById(a.entry._id);
    expect(back.status).toBe("waiting");
    expect(back.offerExpiresAt).toBeNull();
  });
});

describe("services/seatQueue — kick / leave", () => {
  it("kick refuses on a seated entry", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    await offerSeat({ entryId: a.entry._id });
    await acceptSeat({ entryId: a.entry._id, sessionId: "x", playerId: "y" });
    await expect(kickEntry({ entryId: a.entry._id })).rejects.toMatchObject({
      status: 400,
      code: "already_seated",
    });
  });

  it("leave is idempotent-safe for waiting/offered but blocks after seated", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const left = await leaveQueue({ entryId: a.entry._id });
    expect(left.status).toBe("left");

    const b = await enqueue({ channel, nickname: "B" });
    await offerSeat({ entryId: b.entry._id });
    await acceptSeat({ entryId: b.entry._id, sessionId: "x", playerId: "y" });
    await expect(leaveQueue({ entryId: b.entry._id })).rejects.toMatchObject({
      status: 400,
      code: "already_seated",
    });
  });
});

describe("services/seatQueue — karma bump", () => {
  it("bumpWaitingKarma raises only waiting entries", async () => {
    const { channel } = await scaffold();
    const a = await enqueue({ channel, nickname: "A" });
    const b = await enqueue({ channel, nickname: "B" });
    const c = await enqueue({ channel, nickname: "C" });
    await kickEntry({ entryId: c.entry._id });

    const { count } = await bumpWaitingKarma(channel._id, 0.5);
    expect(count).toBe(2);
    const aFresh = await SeatQueueEntry.findById(a.entry._id);
    const bFresh = await SeatQueueEntry.findById(b.entry._id);
    const cFresh = await SeatQueueEntry.findById(c.entry._id);
    expect(aFresh.karma).toBeCloseTo(0.5);
    expect(bFresh.karma).toBeCloseTo(0.5);
    expect(cFresh.karma).toBe(0);
  });
});

describe("services/seatQueue — queue token", () => {
  it("signQueueToken then verifyQueueToken round-trips", () => {
    const t = signQueueToken({ entryId: "abc123", channelSlug: "claudio" });
    const d = verifyQueueToken(t);
    expect(d.entryId).toBe("abc123");
    expect(d.channelSlug).toBe("claudio");
    expect(d.kind).toBe("queue");
  });

  it("verifyQueueToken returns null for junk / wrong kind", () => {
    expect(verifyQueueToken("garbage")).toBeNull();
    // Sign a token with the wrong kind to make sure we reject it.
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../../../config/env");
    const other = jwt.sign({ kind: "guest" }, JWT_SECRET);
    expect(verifyQueueToken(other)).toBeNull();
  });
});
