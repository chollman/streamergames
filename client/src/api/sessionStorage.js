// A guest joining a session gets a JWT bound to (sessionId, playerId). We
// keep it keyed by sessionId in localStorage so a page reload restores the
// seat without asking for the nickname again. User JWT lives in the auth
// slice; this file is only for guest tokens.
const KEY = "streamergames_guest_tokens";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode or quota */
  }
}

export function getGuestToken(sessionId) {
  if (!sessionId) return null;
  return readAll()[sessionId] || null;
}

export function setGuestToken(sessionId, token) {
  if (!sessionId || !token) return;
  const all = readAll();
  all[sessionId] = token;
  writeAll(all);
}

export function clearGuestToken(sessionId) {
  if (!sessionId) return;
  const all = readAll();
  delete all[sessionId];
  writeAll(all);
}

export function clearAllGuestTokens() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// A guest sitting in a channel's SeatQueue gets a queueToken — a JWT bound
// to (channelSlug, entryId). Keyed by channelSlug so reload restores the
// entry without re-asking for the nickname. Same pattern as guest session
// tokens above but scoped to the channel, not a session.
const QUEUE_KEY = "streamergames_queue_tokens";

function readAllQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllQueue(map) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(map));
  } catch {
    /* private mode or quota */
  }
}

export function getQueueToken(channelSlug) {
  if (!channelSlug) return null;
  return readAllQueue()[channelSlug] || null;
}

export function setQueueToken(channelSlug, token) {
  if (!channelSlug || !token) return;
  const all = readAllQueue();
  all[channelSlug] = token;
  writeAllQueue(all);
}

export function clearQueueToken(channelSlug) {
  if (!channelSlug) return;
  const all = readAllQueue();
  delete all[channelSlug];
  writeAllQueue(all);
}

export function clearAllQueueTokens() {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}
