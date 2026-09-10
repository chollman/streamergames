import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { setAuth, clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

// The QueuePanel is rendered inside LobbyPanel which is inside
// StreamerOperator. Reaching it requires the full route:
// /sesion/:id with a streamer view. We MSW that route to a lobby-phase
// streamer view and let the panel poll /queue.

const LOBBY_STREAMER_VIEW = {
  phase: "lobby",
  players: [
    { id: "s", nickname: "Claudio", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null, hand: [] },
  ],
  commanderId: null,
  trick: { leaderId: null, ledSuit: null, plays: [] },
  tricks: [],
  currentTurnId: null,
  reservedByStreamer: [],
};

function seedAuth() {
  store.dispatch(setAuth({
    token: "jwt-x",
    user: { displayName: "Claudio" },
    channel: { slug: "claudio" },
  }));
}

function stubSessionAndEmptyQueue() {
  server.use(
    http.get("*/api/sessions/sess-1", () =>
      HttpResponse.json({
        session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
        view: LOBBY_STREAMER_VIEW,
      })
    ),
    http.get("*/api/channels/claudio/queue", () =>
      HttpResponse.json({ queue: [] })
    )
  );
}

describe("QueuePanel", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
    seedAuth();
  });

  it("renders the panel with an empty state when the queue is empty", async () => {
    stubSessionAndEmptyQueue();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    await waitFor(() => {
      expect(screen.getByTestId("queue-panel")).toBeInTheDocument();
    });
    expect(await screen.findByText(/no hay nadie en la cola/i)).toBeInTheDocument();
  });

  it("lists waiting entries and shows an Invite button per row", async () => {
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
          view: LOBBY_STREAMER_VIEW,
        })
      ),
      http.get("*/api/channels/claudio/queue", () =>
        HttpResponse.json({
          queue: [
            { _id: "e1", nickname: "Ana", status: "waiting", karma: 0.5 },
            { _id: "e2", nickname: "Bea", status: "waiting", karma: 0 },
          ],
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bea")).toBeInTheDocument();
    // Two invite buttons appear.
    const inviteBtns = screen.getAllByRole("button", { name: /invitar/i });
    expect(inviteBtns).toHaveLength(2);
  });

  it("clicking Invite posts to the offer endpoint", async () => {
    let offerCalled = null;
    server.use(
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
          view: LOBBY_STREAMER_VIEW,
        })
      ),
      http.get("*/api/channels/claudio/queue", () =>
        HttpResponse.json({
          queue: [{ _id: "e1", nickname: "Ana", status: "waiting", karma: 0 }],
        })
      ),
      http.post("*/api/channels/claudio/sessions/sess-1/offer/e1", ({ request }) => {
        offerCalled = request.url;
        return HttpResponse.json({
          entry: {
            _id: "e1",
            status: "offered",
            offerExpiresAt: new Date(Date.now() + 30000).toISOString(),
            offeredSessionId: "sess-1",
          },
        });
      })
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/sesion/sess-1"] }) });
    const btn = await screen.findByRole("button", { name: /invitar/i });
    await user.click(btn);
    await waitFor(() => {
      expect(offerCalled).toContain("/api/channels/claudio/sessions/sess-1/offer/e1");
    });
  });
});
