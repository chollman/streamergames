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
