import { describe, it, expect } from "vitest";
import sessionReducer, {
  reset,
  setSession,
  setConnected,
  applyEnvelope,
  setError,
} from "./sessionSlice";

const initial = {
  sessionId: null,
  role: null,
  version: 0,
  view: null,
  myPlayerId: null,
  connected: false,
  lastEventName: null,
  lastAction: null,
  error: null,
};

describe("sessionSlice", () => {
  it("setSession scopes to a session + role and clears prior view state", () => {
    const populated = { ...initial, view: { foo: 1 }, version: 7, myPlayerId: "p1" };
    const next = sessionReducer(populated, setSession({ sessionId: "s1", role: "digital" }));
    expect(next.sessionId).toBe("s1");
    expect(next.role).toBe("digital");
    expect(next.version).toBe(0);
    expect(next.view).toBeNull();
    expect(next.myPlayerId).toBeNull();
  });

  it("applyEnvelope with newer version updates version + view + myPlayerId", () => {
    const s = { ...initial, version: 3 };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:you-are",
      envelope: {
        sessionId: "s1",
        version: 4,
        timestamp: "t",
        view: { myPlayerId: "guest:abc", myHand: ["pink-1"] },
      },
    }));
    expect(next.version).toBe(4);
    expect(next.view).toEqual({ myPlayerId: "guest:abc", myHand: ["pink-1"] });
    expect(next.myPlayerId).toBe("guest:abc");
    expect(next.lastEventName).toBe("session:you-are");
  });

  it("applyEnvelope with strictly older version is discarded (out-of-order guard)", () => {
    const s = { ...initial, version: 10, view: { existing: true } };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:state",
      envelope: { version: 3, view: { stale: true } },
    }));
    expect(next.version).toBe(10);
    expect(next.view).toEqual({ existing: true });
  });

  it("applyEnvelope with equal version is applied (idempotent overwrite)", () => {
    const s = { ...initial, version: 5, view: null };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:state",
      envelope: { version: 5, view: { fresh: true } },
    }));
    expect(next.version).toBe(5);
    expect(next.view).toEqual({ fresh: true });
  });

  it("applyEnvelope records lastAction when the envelope carries one", () => {
    const s = { ...initial };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:action-accepted",
      envelope: {
        version: 1,
        action: { type: "play-card", playerId: "p1" },
        view: null,
      },
    }));
    expect(next.lastAction).toEqual({ type: "play-card", playerId: "p1" });
  });

  it("setConnected toggles the flag", () => {
    expect(sessionReducer(initial, setConnected(true)).connected).toBe(true);
    expect(sessionReducer({ ...initial, connected: true }, setConnected(false)).connected).toBe(false);
  });

  it("setError stores the message; null clears it", () => {
    const s = sessionReducer(initial, setError("boom"));
    expect(s.error).toBe("boom");
    expect(sessionReducer(s, setError(null)).error).toBeNull();
  });

  it("reset returns to initial state", () => {
    const populated = { ...initial, sessionId: "s1", version: 7, view: { any: true } };
    expect(sessionReducer(populated, reset())).toEqual(initial);
  });
});
