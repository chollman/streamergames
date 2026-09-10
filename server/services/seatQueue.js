const jwt = require("jsonwebtoken");
const SeatQueueEntry = require("../models/SeatQueue");
const Channel = require("../models/Channel");
const httpError = require("../utils/httpError");
const { JWT_SECRET } = require("../config/env");

// A queueToken is a JWT bound to a specific queue entry. It's how a guest's
// browser reclaims their entry across reconnects. Signed like the guest
// session token (Constitution §5) but scoped to (channelSlug, entryId).
// 24h TTL — enough to sit through a stream, cheap to reissue if they come
// back later.
const QUEUE_TOKEN_TTL = "24h";

function signQueueToken({ entryId, channelSlug }) {
  return jwt.sign({ entryId, channelSlug, kind: "queue" }, JWT_SECRET, {
    expiresIn: QUEUE_TOKEN_TTL,
  });
}

function verifyQueueToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.kind !== "queue") return null;
    return decoded;
  } catch (_e) {
    return null;
  }
}

// Adds a person to the queue for a channel. Idempotent for a signed-in
// user (returns their existing waiting entry rather than duplicating).
// For guests each call creates a new entry — the client's queueToken is
// the only handle on it.
async function enqueue({ channel, nickname, user = null }) {
  const trimmed = String(nickname || "").trim();
  if (!trimmed) throw httpError(400, "nickname is required", { code: "missing_fields" });
  if (trimmed.length > 50) throw httpError(400, "nickname too long", { code: "nickname_too_long" });

  // Signed-in user: reuse waiting entry if there is one.
  if (user) {
    const existing = await SeatQueueEntry.findOne({
      channel: channel._id,
      userId: user._id,
      status: "waiting",
    });
    if (existing) {
      // Keep the karma they already have; refresh nickname in case they
      // changed their display name.
      existing.nickname = trimmed;
      await existing.save();
      const token = signQueueToken({ entryId: existing._id.toString(), channelSlug: channel.slug });
      return { entry: existing, queueToken: token };
    }
  }

  const entry = await SeatQueueEntry.create({
    channel: channel._id,
    userId: user ? user._id : null,
    nickname: trimmed,
    status: "waiting",
    karma: 0,
  });
  const token = signQueueToken({ entryId: entry._id.toString(), channelSlug: channel.slug });
  return { entry, queueToken: token };
}

// The visible waiting list — used both by the streamer's queue panel and
// to compute a specific entry's position for the digital's own view.
// Sorted top-of-queue first: karma DESC, then oldest waiter first.
async function listWaiting(channelId) {
  return SeatQueueEntry.find({ channel: channelId, status: "waiting" }).sort({
    karma: -1,
    createdAt: 1,
  });
}

// Full audit-friendly listing (waiting + offered) — the streamer's panel
// wants to see who's currently under offer too.
async function listActive(channelId) {
  return SeatQueueEntry.find({
    channel: channelId,
    status: { $in: ["waiting", "offered"] },
  }).sort({ status: 1, karma: -1, createdAt: 1 });
}

// 1-based position within the waiting list, or null if not waiting.
async function positionFor(channelId, entryId) {
  const entry = await SeatQueueEntry.findById(entryId);
  if (!entry || entry.status !== "waiting") return null;
  const ahead = await SeatQueueEntry.countDocuments({
    channel: channelId,
    status: "waiting",
    $or: [
      { karma: { $gt: entry.karma } },
      { karma: entry.karma, createdAt: { $lt: entry.createdAt } },
    ],
  });
  return ahead + 1;
}

// Marks an entry as offered and sets an expiration N seconds from now.
// The streamer calls this to invite someone from the queue to a specific
// session. The caller is expected to also emit a socket event so the
// client can react — this service only mutates the DB.
async function offerSeat({ entryId, sessionId = null, ttlSeconds = 30 }) {
  const entry = await SeatQueueEntry.findById(entryId);
  if (!entry) throw httpError(404, "queue entry not found", { code: "entry_not_found" });
  if (entry.status !== "waiting") {
    throw httpError(400, "entry is not waiting", { code: "entry_not_waiting" });
  }
  entry.status = "offered";
  entry.offerExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
  if (sessionId) entry.offeredSessionId = sessionId;
  await entry.save();
  return entry;
}

// The person accepts the offer. Marks seated and links to the session
// seat. Caller (route/service that seats them into the session) provides
// the sessionId + playerId. Karma drops by 1 as they cash in their wait.
// If the caller doesn't pass sessionId, the entry's own offeredSessionId
// is used (that's the common case — accept resolves the target session
// from the offer stored earlier).
async function acceptSeat({ entryId, sessionId = null, playerId }) {
  const entry = await SeatQueueEntry.findById(entryId);
  if (!entry) throw httpError(404, "queue entry not found", { code: "entry_not_found" });
  if (entry.status !== "offered") {
    throw httpError(400, "entry has no active offer", { code: "no_active_offer" });
  }
  if (entry.offerExpiresAt && entry.offerExpiresAt < new Date()) {
    // The offer already expired — the streamer will re-poll and move on.
    entry.status = "waiting";
    entry.offerExpiresAt = null;
    await entry.save();
    throw httpError(410, "offer expired", { code: "offer_expired" });
  }
  const targetSessionId = sessionId || entry.offeredSessionId;
  if (!targetSessionId) {
    throw httpError(400, "no target session for this offer", { code: "no_target_session" });
  }
  entry.status = "seated";
  entry.offerExpiresAt = null;
  entry.seatedSessionId = targetSessionId;
  entry.playerId = playerId;
  entry.karma = entry.karma - 1;
  await entry.save();
  return entry;
}

// Streamer kicks an entry — either waiting or offered. Doesn't touch
// karma (kicks are a moderator action, not a play).
async function kickEntry({ entryId }) {
  const entry = await SeatQueueEntry.findById(entryId);
  if (!entry) throw httpError(404, "queue entry not found", { code: "entry_not_found" });
  if (entry.status === "seated") {
    throw httpError(400, "entry is already seated", { code: "already_seated" });
  }
  entry.status = "kicked";
  entry.offerExpiresAt = null;
  await entry.save();
  return entry;
}

// The person leaves the queue voluntarily. Same terminal state as kicked
// but without the moderator connotation.
async function leaveQueue({ entryId }) {
  const entry = await SeatQueueEntry.findById(entryId);
  if (!entry) throw httpError(404, "queue entry not found", { code: "entry_not_found" });
  if (entry.status === "seated") {
    throw httpError(400, "entry is already seated", { code: "already_seated" });
  }
  entry.status = "left";
  entry.offerExpiresAt = null;
  await entry.save();
  return entry;
}

// After a session ends, bump karma for everyone still waiting (they were
// patient) and leave the karma of those who played as-is (already
// decremented by acceptSeat). Kept small — a bigger karma model can
// replace this in F5.
async function bumpWaitingKarma(channelId, delta = 0.1) {
  const res = await SeatQueueEntry.updateMany(
    { channel: channelId, status: "waiting" },
    { $inc: { karma: delta } }
  );
  return { count: res.modifiedCount || 0 };
}

module.exports = {
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
};
