// Derives the caller's role from the session view shape:
//   - view has reservedByStreamer → "streamer"
//   - view has myHand              → "digital"
//   - view exists but neither      → "spectator"
//   - view is null (bootstrap)     → "unknown"
//
// The server's viewFor is authoritative — it only sends reservedByStreamer
// to the streamer's socket and myHand to the digital's private room, so
// what the client observes is a reliable identity check. Constitution §6.
export function useSessionRole(view) {
  if (!view) return "unknown";
  if (view.reservedByStreamer !== undefined) return "streamer";
  if (view.myHand !== undefined) return "digital";
  return "spectator";
}
