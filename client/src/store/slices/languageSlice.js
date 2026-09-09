import { createSlice } from "@reduxjs/toolkit";

function getInitial() {
  try {
    const stored = localStorage.getItem("streamergames_language");
    if (stored === "es" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return "es";
}

const slice = createSlice({
  name: "language",
  initialState: { value: getInitial() },
  reducers: {
    setLanguage(state, action) {
      state.value = action.payload;
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("lang", action.payload);
      }
    },
  },
});

export const { setLanguage } = slice.actions;
export default slice.reducer;
