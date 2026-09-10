import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { makeWrapper } from "../test/wrappers/AllProviders";
import { store } from "../store/store";
import { setAuth, clearAuth } from "../store/slices/authSlice";
import { setGuestToken, clearAllGuestTokens } from "../api/sessionStorage";
import App from "../App";

// SessionView reads the view shape returned by the server (which is filtered
// per-caller by viewFor) and dispatches to the streamer / digital /
// spectator sub-page. These tests exercise that dispatch without booting a
// real socket; the initial query response is enough to decide.

const LOBBY_STREAMER_VIEW = {
  phase: "lobby",
  players: [
    { id: "s", nickname: "Streamer", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null, hand: [] },
  ],
  commanderId: null,
  trick: { leaderId: null, ledSuit: null, plays: [] },
  tricks: [],
  currentTurnId: null,
  reservedByStreamer: [],
};

const LOBBY_DIGITAL_VIEW = {
  phase: "lobby",
  players: [
    { id: "s", nickname: "Streamer", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null },
    { id: "guest:abc", nickname: "Ana", playerType: "digital", role: "digital", order: 1, handSize: 0, commTokenUsed: false, commCard: null },
  ],
  commanderId: null,
  trick: { leaderId: null, ledSuit: null, plays: [] },
  tricks: [],
  currentTurnId: null,
  myHand: [],
  myPlayerId: "guest:abc",
};

const LOBBY_SPECTATOR_VIEW = {
  phase: "lobby",
  players: [
    { id: "s", nickname: "Streamer", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null },
  ],
  commanderId: null,
  trick: { leaderId: null, ledSuit: null, plays: [] },
  tricks: [],
  currentTurnId: null,
};

function mockGetSession(view) {
  server.use(
    http.get("*/api/sessions/sess-1", () =>
      HttpResponse.json({
        session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 1 },
        view,
      })
    )
  );
}

describe("SessionView role dispatch", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    clearAllGuestTokens();
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("view with reservedByStreamer → renders StreamerOperator", async () => {
    store.dispatch(setAuth({ token: "jwt", user: { displayName: "S" }, channel: { slug: "s" } }));
    mockGetSession(LOBBY_STREAMER_VIEW);
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });

  it("view with myHand → renders DigitalPlayView", async () => {
    setGuestToken("sess-1", "guest-jwt");
    mockGetSession(LOBBY_DIGITAL_VIEW);
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /esperando que arranque la partida/i })).toBeInTheDocument();
    });
  });

  it("view with neither → renders SpectatorView", async () => {
    mockGetSession(LOBBY_SPECTATOR_VIEW);
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /estás mirando esta partida/i })).toBeInTheDocument();
    });
  });

  it("network error → renders session_load_error", async () => {
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({ message: "not found" }, { status: 404 })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/no pudimos cargar la sesión/i);
    });
  });
});
