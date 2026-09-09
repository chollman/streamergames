import { createSlice } from "@reduxjs/toolkit";

function getInitial() {
  try {
    const stored = localStorage.getItem("streamergames_theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

const slice = createSlice({
  name: "theme",
  initialState: { value: getInitial() },
  reducers: {
    setTheme(state, action) {
      state.value = action.payload;
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", action.payload);
      }
    },
    toggleTheme(state) {
      state.value = state.value === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", state.value);
      }
    },
  },
});

export const { setTheme, toggleTheme } = slice.actions;
export default slice.reducer;
