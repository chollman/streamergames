import { createSlice } from "@reduxjs/toolkit";

const STORAGE_KEY = "streamergames_auth";

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null, channel: null };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        token: parsed.token || null,
        user: parsed.user || null,
        channel: parsed.channel || null,
      };
    }
  } catch {
    /* fall through */
  }
  return { token: null, user: null, channel: null };
}

const slice = createSlice({
  name: "auth",
  initialState: loadInitial(),
  reducers: {
    setAuth(state, action) {
      state.token = (action.payload && action.payload.token) || null;
      state.user = (action.payload && action.payload.user) || null;
      state.channel = (action.payload && action.payload.channel) || null;
    },
    setChannel(state, action) {
      state.channel = action.payload || null;
    },
    clearAuth(state) {
      state.token = null;
      state.user = null;
      state.channel = null;
    },
  },
});

export const { setAuth, setChannel, clearAuth } = slice.actions;
export default slice.reducer;
