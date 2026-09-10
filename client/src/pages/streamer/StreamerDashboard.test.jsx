import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { setAuth, clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

function seedStreamer() {
  store.dispatch(clearAuth());
  try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  store.dispatch(setAuth({
    token: "jwt-x",
    user: { displayName: "Claudio" },
    channel: { slug: "claudio" },
  }));
}

function stubActiveSession(session) {
  server.use(
    http.get("*/api/channels/claudio/sessions/active", () => {
      if (!session) return new HttpResponse(null, { status: 204 });
      return HttpResponse.json({ session });
    })
  );
}

const LOBBY_STREAMER_VIEW = {
  phase: "lobby",
  players: [
    { id: "streamer:u1", nickname: "Claudio", playerType: "physical", role: "streamer", order: 0, handSize: 0, commTokenUsed: false, commCard: null, hand: [] },
  ],
  commanderId: null,
  trick: { leaderId: null, ledSuit: null, plays: [] },
  tricks: [],
  currentTurnId: null,
  reservedByStreamer: [],
};

describe("StreamerDashboard", () => {
  beforeEach(seedStreamer);

  it("with no active session: shows Create button; on click creates + navigates", async () => {
    stubActiveSession(null);
    server.use(
      http.post("*/api/channels/claudio/sessions", () =>
        HttpResponse.json({ session: { _id: "sess-1", channel: "ch-1", gameId: "the-crew", status: "lobby", seats: [], version: 0 } })
      ),
      http.get("*/api/sessions/sess-1", () =>
        HttpResponse.json({
          session: { _id: "sess-1", gameId: "the-crew", status: "lobby", version: 0 },
          view: LOBBY_STREAMER_VIEW,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });

    // Wait for the check-active query to resolve so the "Create" button appears.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /crear una nueva sesión/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /crear una nueva sesión/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });

  it("with an active session: shows the card with Continue + Cancel; Continue navigates", async () => {
    stubActiveSession({ _id: "sess-existing", status: "lobby" });
    server.use(
      http.get("*/api/sessions/sess-existing", () =>
        HttpResponse.json({
          session: { _id: "sess-existing", gameId: "the-crew", status: "lobby", version: 3 },
          view: LOBBY_STREAMER_VIEW,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });

    await waitFor(() => {
      expect(screen.getByText(/tenés una sesión abierta/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /continuar sesión/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar y empezar una nueva/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continuar sesión/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });

  it("with active: Cancel-and-create abandons then creates + navigates", async () => {
    stubActiveSession({ _id: "sess-old", status: "in_progress" });
    let abandonCalled = null;
    server.use(
      http.post("*/api/sessions/sess-old/abandon", ({ request }) => {
        abandonCalled = request.url;
        return HttpResponse.json({ session: { _id: "sess-old", status: "abandoned" } });
      }),
      http.post("*/api/channels/claudio/sessions", () =>
        HttpResponse.json({ session: { _id: "sess-new", channel: "ch-1", gameId: "the-crew", status: "lobby", seats: [], version: 0 } })
      ),
      http.get("*/api/sessions/sess-new", () =>
        HttpResponse.json({
          session: { _id: "sess-new", gameId: "the-crew", status: "lobby", version: 0 },
          view: LOBBY_STREAMER_VIEW,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancelar y empezar una nueva/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /cancelar y empezar una nueva/i }));
    await waitFor(() => {
      expect(abandonCalled).toContain("/api/sessions/sess-old/abandon");
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });

  it("no-active + create returns 409 → follows the returned sessionId", async () => {
    stubActiveSession(null); // initial view says no active
    server.use(
      http.post("*/api/channels/claudio/sessions", () =>
        HttpResponse.json(
          {
            message: "Ya tenés una sesión activa en este canal",
            code: "active_session_exists",
            sessionId: "sess-race",
          },
          { status: 409 }
        )
      ),
      http.get("*/api/sessions/sess-race", () =>
        HttpResponse.json({
          session: { _id: "sess-race", gameId: "the-crew", status: "lobby", version: 2 },
          view: LOBBY_STREAMER_VIEW,
        })
      )
    );
    const user = userEvent.setup();
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /crear una nueva sesión/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /crear una nueva sesión/i }));
    // Should navigate to sess-race (the existing one) even though we tried to create.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /panel de operador/i })).toBeInTheDocument();
    });
  });
});
