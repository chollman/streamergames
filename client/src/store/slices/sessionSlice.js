import { createSlice } from "@reduxjs/toolkit";

// Live session state fed by Socket.IO envelopes. NOT the query cache for
// GET /api/sessions/:id (that's TanStack Query). Constitution §8.
const initial = {
  sessionId: null,
  role: null, // 'streamer' | 'digital' | 'spectator'
  version: 0,
  view: null, // shape depends on role — see server viewFor
  myPlayerId: null,
  connected: false,
  lastEventName: null,
  lastAction: null,
  error: null,
  // When applyEnvelope sees a version jump (missed events), it flips this
  // flag. useSocket watches it and emits session:resync-request; the
  // server replies with a fresh session:state and clearGap resets the flag.
  gapDetected: false,
  // Set by the session:ended socket event when the streamer abandons or
  // finishes the session. { reason, channelSlug } — SessionView renders
  // a terminal screen from this and offers a way back to /canal/<slug>.
  // null while the session is live; cleared on setSession + reset.
  ended: null,
};

const slice = createSlice({
  name: "session",
  initialState: initial,
  reducers: {
    reset() {
      return initial;
    },
    setSession(state, action) {
      const { sessionId, role } = action.payload || {};
      state.sessionId = sessionId || null;
      state.role = role || null;
      state.version = 0;
      state.view = null;
      state.myPlayerId = null;
      state.error = null;
      state.gapDetected = false;
      state.ended = null;
    },
    setConnected(state, action) {
      state.connected = !!action.payload;
    },
    // Apply an envelope from emitSessionEvent. Envelopes carry a monotonic
    // per-session version; discard anything strictly older than what we've
    // already applied (out-of-order delivery). Equal-version replays are
    // safe (idempotent overwrite). A version jump (envelope.version >
    // state.version + 1) means we missed events — set gapDetected so
    // useSocket can request a fresh session:state. We still apply the
    // current envelope's view since it's the latest state anyway.
    applyEnvelope(state, action) {
      const { eventName, envelope } = action.payload || {};
      if (!envelope) return;
      if (typeof envelope.version === "number" && envelope.version < state.version) {
        return;
      }
      if (
        typeof envelope.version === "number" &&
        state.version > 0 &&
        envelope.version > state.version + 1
      ) {
        state.gapDetected = true;
      }
      if (typeof envelope.version === "number") {
        state.version = envelope.version;
      }
      state.lastEventName = eventName || null;
      if (envelope.view !== undefined) {
        state.view = envelope.view;
        if (envelope.view && envelope.view.myPlayerId) {
          state.myPlayerId = envelope.view.myPlayerId;
        }
      }
      if (envelope.action) state.lastAction = envelope.action;
    },
    // Called by useSocket after it has sent session:resync-request. Keeps
    // the flag single-shot: further gap detections re-arm it, but the
    // in-flight request doesn't fire again until then.
    clearGap(state) {
      state.gapDetected = false;
    },
    // The server told us this session is done — the streamer abandoned it,
    // or the game finished. Everything else in the slice stays as it was
    // so the view can still render a snapshot behind the "session ended"
    // banner if it wants to. Cleared by setSession / reset.
    markSessionEnded(state, action) {
      const { reason, channelSlug } = action.payload || {};
      state.ended = { reason: reason || "abandoned", channelSlug: channelSlug || null };
    },
    setError(state, action) {
      state.error = action.payload || null;
    },
  },
});

export const {
  reset,
  setSession,
  setConnected,
  applyEnvelope,
  clearGap,
  markSessionEnded,
  setError,
} = slice.actions;
export default slice.reducer;
