import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import themeReducer from "./slices/themeSlice";
import languageReducer from "./slices/languageSlice";

// Persistence effects live here instead of inside reducers — the reducers stay
// pure. This middleware writes to localStorage as a side effect.
const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  predicate: (action) => action.type.startsWith("theme/"),
  effect: (_action, api) => {
    try {
      localStorage.setItem("streamergames_theme", api.getState().theme.value);
    } catch {
      /* private window, quota, etc. */
    }
  },
});

listenerMiddleware.startListening({
  predicate: (action) => action.type.startsWith("language/"),
  effect: (_action, api) => {
    try {
      localStorage.setItem(
        "streamergames_language",
        api.getState().language.value
      );
    } catch {
      /* ignore */
    }
  },
});

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    language: languageReducer,
  },
  middleware: (getDefault) =>
    getDefault().prepend(listenerMiddleware.middleware),
  // Constitution §8: Vite doesn't set process.env.NODE_ENV the way RTK's
  // implicit devtools check expects, so set it explicitly.
  devTools: import.meta.env.DEV,
});
