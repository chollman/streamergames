import { describe, it, expect, beforeEach } from "vitest";
import authReducer, { setAuth, setChannel, clearAuth } from "./authSlice";

const initial = { token: null, user: null, channel: null };

describe("authSlice", () => {
  beforeEach(() => {
    // The slice's initial value pulls from localStorage; clear so tests are
    // deterministic regardless of previous suites.
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("setAuth stores token, user, channel from payload", () => {
    const next = authReducer(initial, setAuth({
      token: "jwt-x",
      user: { email: "s@x.com" },
      channel: { slug: "streamer" },
    }));
    expect(next.token).toBe("jwt-x");
    expect(next.user).toEqual({ email: "s@x.com" });
    expect(next.channel).toEqual({ slug: "streamer" });
  });

  it("setAuth with empty payload clears each field", () => {
    const populated = { token: "t", user: { x: 1 }, channel: { y: 2 } };
    const next = authReducer(populated, setAuth({}));
    expect(next).toEqual(initial);
  });

  it("setChannel updates only the channel", () => {
    const populated = { token: "t", user: { x: 1 }, channel: null };
    const next = authReducer(populated, setChannel({ slug: "new" }));
    expect(next.token).toBe("t");
    expect(next.user).toEqual({ x: 1 });
    expect(next.channel).toEqual({ slug: "new" });
  });

  it("clearAuth wipes everything", () => {
    const populated = { token: "t", user: { x: 1 }, channel: { y: 2 } };
    expect(authReducer(populated, clearAuth())).toEqual(initial);
  });
});
