import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import {
  getQueueToken,
  clearAllQueueTokens,
  setQueueToken,
} from "../../api/sessionStorage";
import App from "../../App";

describe("ChannelJoin", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    clearAllQueueTokens();
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("shows the nickname form when there is no queueToken", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    expect(screen.getByRole("heading", { name: /canal de claudio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nickname/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar a la cola/i })).toBeInTheDocument();
  });

  it("on successful enqueue: stores queueToken and shows waiting card with position", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/channels/claudio/queue", () =>
        HttpResponse.json(
          {
            entry: {
              _id: "e1",
              nickname: "Ana",
              status: "waiting",
              karma: 0,
              position: 1,
            },
            queueToken: "qtoken-abc",
          },
          { status: 201 }
        )
      ),
      // /me starts polling once the token is set; mock it too so MSW
      // doesn't warn on unhandled requests.
      http.get("*/api/channels/claudio/queue/me", () =>
        HttpResponse.json({
          entry: { _id: "e1", nickname: "Ana", status: "waiting", karma: 0, position: 1 },
        })
      )
    );

    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    await user.type(screen.getByLabelText(/nickname/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a la cola/i }));

    await waitFor(() => {
      expect(getQueueToken("claudio")).toBe("qtoken-abc");
    });
    await waitFor(() => {
      expect(screen.getByTestId("queue-waiting-card")).toBeInTheDocument();
    });
    expect(screen.getByText(/estás como ana/i)).toBeInTheDocument();
    expect(screen.getByText(/posición 1/i)).toBeInTheDocument();
  });

  it("if a queueToken already exists: skips the form and polls /me", async () => {
    setQueueToken("claudio", "existing-qtoken");
    server.use(
      http.get("*/api/channels/claudio/queue/me", () =>
        HttpResponse.json({
          entry: {
            _id: "e1",
            nickname: "Beto",
            status: "waiting",
            karma: 0,
            position: 3,
          },
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    await waitFor(() => {
      expect(screen.getByText(/estás como beto/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/nickname/i)).toBeNull();
    expect(screen.getByText(/posición 3/i)).toBeInTheDocument();
  });

  it("on enqueue error, shows the message and stays put", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/channels/claudio/queue", () =>
        HttpResponse.json(
          { message: "Faltan campos requeridos", code: "missing_fields" },
          { status: 400 }
        )
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    await user.type(screen.getByLabelText(/nickname/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a la cola/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/faltan campos/i);
    });
    expect(getQueueToken("claudio")).toBeNull();
  });

  it("when the /me endpoint returns 404 (stale token), token is cleared and form reappears", async () => {
    setQueueToken("claudio", "stale-qtoken");
    server.use(
      http.get("*/api/channels/claudio/queue/me", () =>
        HttpResponse.json({ message: "not found", code: "entry_not_found" }, { status: 404 })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    await waitFor(() => {
      expect(screen.getByLabelText(/nickname/i)).toBeInTheDocument();
    });
    expect(getQueueToken("claudio")).toBeNull();
  });

  it("when offered: shows Accept button; on click, sets guestToken and navigates to /sesion/:id", async () => {
    const { setQueueToken } = await import("../../api/sessionStorage");
    setQueueToken("claudio", "qtoken-x");
    server.use(
      http.get("*/api/channels/claudio/queue/me", () =>
        HttpResponse.json({
          entry: {
            _id: "e1",
            nickname: "Ana",
            status: "offered",
            karma: 0,
            offerExpiresAt: new Date(Date.now() + 30000).toISOString(),
            offeredSessionId: "sess-1",
            position: null,
          },
        })
      ),
      http.post("*/api/channels/claudio/queue/accept", () =>
        HttpResponse.json(
          {
            session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
            seat: { playerId: "guest:abc", nickname: "Ana", role: "digital", playerType: "digital" },
            guestToken: "guest-jwt-abc",
          },
          { status: 201 }
        )
      ),
      // After navigation SessionView bootstraps.
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
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
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    const acceptBtn = await screen.findByRole("button", { name: /aceptar asiento/i });
    await user.click(acceptBtn);
    const { getGuestToken } = await import("../../api/sessionStorage");
    await waitFor(() => {
      expect(getGuestToken("sess-1")).toBe("guest-jwt-abc");
    });
    // After navigation the digital lands on DigitalPlayView (view has myHand).
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /esperando que arranque la partida/i })).toBeInTheDocument();
    });
  });

  it("Leave button clears the token and returns to the join form", async () => {
    setQueueToken("claudio", "qtoken-x");
    server.use(
      http.get("*/api/channels/claudio/queue/me", () =>
        HttpResponse.json({
          entry: { _id: "e1", nickname: "Ana", status: "waiting", karma: 0, position: 2 },
        })
      ),
      http.post("*/api/channels/claudio/queue/leave", () =>
        HttpResponse.json({ entry: { _id: "e1", status: "left" } })
      )
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/canal/claudio"] }) });
    // Wait for the query to resolve so the Leave button actually renders
    // (it's gated on entry.status === "waiting" | "offered").
    const leaveBtn = await screen.findByRole("button", { name: /salir de la cola/i });
    await user.click(leaveBtn);
    await waitFor(() => {
      expect(getQueueToken("claudio")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/nickname/i)).toBeInTheDocument();
    });
  });
});
