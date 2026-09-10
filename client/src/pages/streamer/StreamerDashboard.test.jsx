import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { setAuth, clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

describe("StreamerDashboard", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
    store.dispatch(setAuth({
      token: "jwt-x",
      user: { displayName: "Claudio" },
      channel: { slug: "claudio" },
    }));
  });

  it("renders the greeting + channel + create button", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });
    expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
    expect(screen.getByText(/tu canal: claudio/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear una nueva sesión/i })).toBeInTheDocument();
  });

  it("on click, creates a session and navigates into it", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/channels/claudio/sessions", () =>
        HttpResponse.json({
          session: {
            _id: "sess-1",
            channel: "ch-1",
            gameId: "the-crew",
            status: "lobby",
            seats: [
              {
                seatIndex: 0,
                playerId: "streamer:u1",
                userId: "u1",
                nickname: "Claudio",
                role: "streamer",
                playerType: "physical",
                status: "seated",
              },
            ],
            version: 0,
          },
        })
      ),
      // SessionView will bootstrap-fetch the session:
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: {
            _id: "sess-1",
            channel: "ch-1",
            gameId: "the-crew",
            status: "lobby",
            seats: [
              { seatIndex: 0, playerId: "streamer:u1", userId: "u1", nickname: "Claudio", role: "streamer", playerType: "physical", status: "seated" },
            ],
            version: 0,
          },
          view: {
            phase: "lobby",
            players: [
              { id: "streamer:u1", nickname: "Claudio", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null, hand: [] },
            ],
            commanderId: null,
            trick: { leaderId: null, ledSuit: null, plays: [] },
            tricks: [],
            currentTurnId: null,
            reservedByStreamer: [],
          },
        })
      )
    );

    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });
    await user.click(screen.getByRole("button", { name: /crear una nueva sesión/i }));

    // Once navigated, StreamerOperator renders — its header includes
    // "Panel de operador".
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });

  it("on error, shows the message and stays put", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/channels/claudio/sessions", () =>
        HttpResponse.json({ message: "Canal no encontrado", code: "channel_not_found" }, { status: 404 })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });
    await user.click(screen.getByRole("button", { name: /crear una nueva sesión/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/canal no encontrado/i);
    });
    // Still on dashboard.
    expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
  });
});
