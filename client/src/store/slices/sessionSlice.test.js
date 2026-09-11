import { describe, it, expect } from "vitest";
import sessionReducer, {
  reset,
  setSession,
  setConnected,
  applyEnvelope,
  clearGap,
  markSessionEnded,
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
  gapDetected: false,
  ended: null,
};

describe("sessionSlice", () => {
  it("setSession scopes to a session + role and clears prior view state", () => {
    const populated = { ...initial, view: { foo: 1 }, version: 7, myPlayerId: "p1", gapDetected: true };
    const next = sessionReducer(populated, setSession({ sessionId: "s1", role: "digital" }));
    expect(next.sessionId).toBe("s1");
    expect(next.role).toBe("digital");
    expect(next.version).toBe(0);
    expect(next.view).toBeNull();
    expect(next.myPlayerId).toBeNull();
    expect(next.gapDetected).toBe(false);
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
    // Adjacent versions — no gap.
    expect(next.gapDetected).toBe(false);
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

  it("applyEnvelope sets gapDetected when the version jumps past state.version + 1", () => {
    const s = { ...initial, version: 3 };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:action-accepted",
      envelope: { version: 7, view: { any: true } },
    }));
    // The current envelope is still applied — it's the freshest state.
    expect(next.version).toBe(7);
    expect(next.view).toEqual({ any: true });
    // But the gap flag is set so useSocket can request a resync.
    expect(next.gapDetected).toBe(true);
  });

  it("applyEnvelope does NOT set gapDetected for the very first envelope (version 0 → N)", () => {
    // A fresh slice has version 0. The first envelope could be version 1
    // or higher (e.g. the client reconnects mid-game and gets a snapshot
    // at version 42). Neither is a gap for our purposes — we had no
    // history to miss.
    const s = { ...initial };
    const next = sessionReducer(s, applyEnvelope({
      eventName: "session:state",
      envelope: { version: 42, view: { any: true } },
    }));
    expect(next.version).toBe(42);
    expect(next.gapDetected).toBe(false);
  });

  it("clearGap flips the flag back to false", () => {
    const s = { ...initial, gapDetected: true };
    expect(sessionReducer(s, clearGap()).gapDetected).toBe(false);
  });

  it("markSessionEnded stores { reason, channelSlug } on ended", () => {
    const s = { ...initial };
    const next = sessionReducer(s, markSessionEnded({
      reason: "abandoned",
      channelSlug: "claudio",
    }));
    expect(next.ended).toEqual({ reason: "abandoned", channelSlug: "claudio" });
  });

  it("markSessionEnded defaults reason to 'abandoned' when missing", () => {
    const s = { ...initial };
    const next = sessionReducer(s, markSessionEnded({ channelSlug: "claudio" }));
    expect(next.ended).toEqual({ reason: "abandoned", channelSlug: "claudio" });
  });

  it("setSession clears ended so navigating to a new session isn't stuck on the ended screen", () => {
    const s = { ...initial, ended: { reason: "abandoned", channelSlug: "claudio" } };
    const next = sessionReducer(s, setSession({ sessionId: "new-sess", role: null }));
    expect(next.ended).toBeNull();
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
