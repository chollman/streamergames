import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import { getGuestToken, clearAllGuestTokens } from "../../api/sessionStorage";
import App from "../../App";

describe("DigitalJoin", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    clearAllGuestTokens();
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("shows the nickname form", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/entrar/sess-1"] }) });
    expect(screen.getByRole("heading", { name: /unirte a la partida/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nickname/i)).toBeInTheDocument();
  });

  it("on successful join, stores guest token and navigates into the session", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/sessions/sess-1/join", () =>
        HttpResponse.json({
          session: { _id: "sess-1" },
          seat: { playerId: "guest:abc", nickname: "Ana", role: "digital", playerType: "digital" },
          guestToken: "guest-jwt-xyz",
        })
      ),
      // SessionView will fetch on landing:
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: {
            _id: "sess-1",
            gameId: "the-crew",
            status: "lobby",
            seats: [
              { seatIndex: 0, playerId: "s", nickname: "Streamer", role: "streamer", playerType: "physical", status: "seated" },
              { seatIndex: 1, playerId: "guest:abc", nickname: "Ana", role: "digital", playerType: "digital", status: "seated" },
            ],
            version: 1,
          },
          view: {
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
          },
        })
      )
    );

    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/entrar/sess-1"] }) });
    await user.type(screen.getByLabelText(/nickname/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(getGuestToken("sess-1")).toBe("guest-jwt-xyz");
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /esperando que arranque la partida/i })).toBeInTheDocument();
    });
  });

  it("if a guest token already exists for this session, jumps straight in", async () => {
    // Pre-seed the guest token.
    const { setGuestToken } = await import("../../api/sessionStorage");
    setGuestToken("sess-1", "existing-jwt");
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "lobby", seats: [], version: 0 },
          view: {
            phase: "lobby",
            players: [],
            commanderId: null,
            trick: { leaderId: null, ledSuit: null, plays: [] },
            tricks: [],
            currentTurnId: null,
            myHand: [],
            myPlayerId: "guest:existing",
          },
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/entrar/sess-1"] }) });
    await waitFor(() => {
      // The nickname form should not appear; we go to SessionView.
      expect(screen.queryByRole("heading", { name: /unirte a la partida/i })).toBeNull();
    });
  });

  it("on error, shows the message and stays put", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/sessions/sess-1/join", () =>
        HttpResponse.json({ message: "La sesión está llena", code: "session_full" }, { status: 400 })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/entrar/sess-1"] }) });
    await user.type(screen.getByLabelText(/nickname/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/la sesión está llena/i);
    });
    expect(getGuestToken("sess-1")).toBeNull();
  });
});
