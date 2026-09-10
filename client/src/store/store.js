import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import themeReducer from "./slices/themeSlice";
import languageReducer from "./slices/languageSlice";
import authReducer from "./slices/authSlice";
import sessionReducer from "./slices/sessionSlice";

const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  predicate: (a) => a.type.startsWith("theme/"),
  effect: (_a, api) => {
    try {
      localStorage.setItem("streamergames_theme", api.getState().theme.value);
    } catch { /* ignore */ }
  },
});

listenerMiddleware.startListening({
  predicate: (a) => a.type.startsWith("language/"),
  effect: (_a, api) => {
    try {
      localStorage.setItem("streamergames_language", api.getState().language.value);
    } catch { /* ignore */ }
  },
});

// Persist auth (token + user + channel) on every auth/* action so a page
// reload keeps the session. Clearing auth removes the key entirely so a
// stale token can never be re-hydrated after logout.
listenerMiddleware.startListening({
  predicate: (a) => a.type.startsWith("auth/"),
  effect: (_a, api) => {
    try {
      const { token, user, channel } = api.getState().auth;
      if (!token) {
        localStorage.removeItem("streamergames_auth");
      } else {
        localStorage.setItem(
          "streamergames_auth",
          JSON.stringify({ token, user, channel })
        );
      }
    } catch { /* ignore */ }
  },
});

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    language: languageReducer,
    auth: authReducer,
    session: sessionReducer,
  },
  middleware: (getDefault) =>
    getDefault().prepend(listenerMiddleware.middleware),
  // Constitution §8: Vite doesn't set process.env.NODE_ENV the way RTK's
  // implicit devtools check expects, so set it explicitly.
  devTools: import.meta.env.DEV,
});
