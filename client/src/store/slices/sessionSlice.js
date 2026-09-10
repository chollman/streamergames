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
    },
    setConnected(state, action) {
      state.connected = !!action.payload;
    },
    // Apply an envelope from emitSessionEvent. Envelopes carry a monotonic
    // per-session version; discard anything strictly older than what we've
    // already applied (out-of-order delivery). Equal-version replays are
    // safe (idempotent overwrite). A gap triggers a full resync elsewhere.
    applyEnvelope(state, action) {
      const { eventName, envelope } = action.payload || {};
      if (!envelope) return;
      if (typeof envelope.version === "number" && envelope.version < state.version) {
        return;
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
  setError,
} = slice.actions;
export default slice.reducer;
