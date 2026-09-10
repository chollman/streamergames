import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

const TRICK_VIEW = {
  phase: "trick",
  players: [
    { id: "s", nickname: "Streamer", playerType: "physical", role: "streamer", order: 0, handSize: 13, commTokenUsed: false, commCard: null },
    { id: "guest:a", nickname: "Ana", playerType: "digital", role: "digital", order: 1, handSize: 12, commTokenUsed: true, commCard: { cardId: "pink-7", position: "highest" } },
    { id: "guest:b", nickname: "Bea", playerType: "digital", role: "digital", order: 2, handSize: 13, commTokenUsed: false, commCard: null },
  ],
  commanderId: "s",
  trick: {
    leaderId: "s",
    ledSuit: "pink",
    plays: [
      { playerId: "s", cardId: "pink-3" },
      { playerId: "guest:a", cardId: "pink-9" },
    ],
  },
  tricks: [
    { leaderId: "s", ledSuit: "blue", plays: [], winnerId: "s" },
  ],
  currentTurnId: "guest:b",
};

describe("SessionOverlay", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("renders players + trick + tricks-count", async () => {
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "in_progress", version: 5 },
          view: TRICK_VIEW,
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1/overlay"] }) });
    await waitFor(() => {
      expect(screen.getByTestId("session-overlay")).toBeInTheDocument();
    });
    expect(screen.getByText("Streamer")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bea")).toBeInTheDocument();
    // Trick has led suit label ("Palo obligado:")
    expect(screen.getByText(/palo obligado/i)).toBeInTheDocument();
    // Tricks-count message
    expect(screen.getByText(/1 bazas jugadas/i)).toBeInTheDocument();
  });

  it("applies data-theme=dark to <html> while mounted (forced-dark)", async () => {
    document.documentElement.removeAttribute("data-theme");
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "in_progress", version: 1 },
          view: TRICK_VIEW,
        })
      )
    );
    const { unmount } = render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1/overlay"] }) });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
    unmount();
    // Restored on unmount (was null → attribute removed again).
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
