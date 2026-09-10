import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { store } from "../store/store";
import { setAuth, clearAuth } from "../store/slices/authSlice";
import { setGuestToken, clearAllGuestTokens } from "../api/sessionStorage";
import {
  createSession,
  joinAsGuest,
  startSession,
  submitAction,
} from "./sessions";

describe("queries/sessions", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    clearAllGuestTokens();
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("createSession posts to /api/channels/:slug/sessions with Bearer user token", async () => {
    store.dispatch(setAuth({ token: "user-jwt", user: { x: 1 }, channel: { slug: "claudio" } }));
    let seenAuth = null;
    server.use(
      http.post("*/api/channels/claudio/sessions", ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ session: { _id: "sess-1", status: "lobby" } });
      })
    );
    const res = await createSession({ channelSlug: "claudio" });
    expect(res.session._id).toBe("sess-1");
    expect(seenAuth).toBe("Bearer user-jwt");
  });

  it("joinAsGuest returns { session, seat, guestToken }", async () => {
    server.use(
      http.post("*/api/sessions/sess-1/join", () =>
        HttpResponse.json({
          session: { _id: "sess-1" },
          seat: { playerId: "guest:abc", nickname: "Ana" },
          guestToken: "guest-jwt-1",
        })
      )
    );
    const res = await joinAsGuest({ sessionId: "sess-1", nickname: "Ana" });
    expect(res.guestToken).toBe("guest-jwt-1");
    expect(res.seat.nickname).toBe("Ana");
  });

  it("startSession posts to /api/sessions/:id/start with Bearer user token", async () => {
    store.dispatch(setAuth({ token: "user-jwt", user: { x: 1 }, channel: { slug: "s" } }));
    let seenAuth = null;
    server.use(
      http.post("*/api/sessions/sess-1/start", ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ session: { _id: "sess-1", status: "in_progress" } });
      })
    );
    await startSession({ sessionId: "sess-1" });
    expect(seenAuth).toBe("Bearer user-jwt");
  });

  it("submitAction uses the guest token (overriding user Bearer) when one is stored", async () => {
    // Both a user token and a guest token exist. The guest one must win for
    // actions in that session so the seat is identified correctly.
    store.dispatch(setAuth({ token: "user-jwt", user: { x: 1 }, channel: null }));
    setGuestToken("sess-1", "guest-jwt-1");
    let seenAuth = null;
    server.use(
      http.post("*/api/sessions/sess-1/actions", ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ session: { _id: "sess-1" }, view: { phase: "trick" } });
      })
    );
    const res = await submitAction({ sessionId: "sess-1", action: { type: "play-card", cardId: "pink-1" } });
    expect(seenAuth).toBe("Bearer guest-jwt-1");
    expect(res.view.phase).toBe("trick");
  });

  it("submitAction uses the user Bearer when no guest token is stored", async () => {
    store.dispatch(setAuth({ token: "user-jwt", user: { x: 1 }, channel: null }));
    let seenAuth = null;
    server.use(
      http.post("*/api/sessions/sess-1/actions", ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ session: {}, view: {} });
      })
    );
    await submitAction({ sessionId: "sess-1", action: { type: "reserve-hand", cardIds: [] } });
    expect(seenAuth).toBe("Bearer user-jwt");
  });
});
