import { describe, it, expect, beforeEach } from "vitest";
import {
  getGuestToken,
  setGuestToken,
  clearGuestToken,
  clearAllGuestTokens,
} from "./sessionStorage";

describe("sessionStorage — guest tokens", () => {
  beforeEach(() => {
    clearAllGuestTokens();
  });

  it("get on unknown session returns null", () => {
    expect(getGuestToken("s1")).toBeNull();
  });

  it("set + get roundtrips", () => {
    setGuestToken("s1", "token-a");
    expect(getGuestToken("s1")).toBe("token-a");
  });

  it("set on a second session does not overwrite the first", () => {
    setGuestToken("s1", "token-a");
    setGuestToken("s2", "token-b");
    expect(getGuestToken("s1")).toBe("token-a");
    expect(getGuestToken("s2")).toBe("token-b");
  });

  it("clearGuestToken removes only the named session", () => {
    setGuestToken("s1", "token-a");
    setGuestToken("s2", "token-b");
    clearGuestToken("s1");
    expect(getGuestToken("s1")).toBeNull();
    expect(getGuestToken("s2")).toBe("token-b");
  });

  it("clearAllGuestTokens removes all", () => {
    setGuestToken("s1", "token-a");
    setGuestToken("s2", "token-b");
    clearAllGuestTokens();
    expect(getGuestToken("s1")).toBeNull();
    expect(getGuestToken("s2")).toBeNull();
  });

  it("get/set with falsy sessionId no-ops safely", () => {
    setGuestToken("", "x");
    expect(getGuestToken("")).toBeNull();
    expect(getGuestToken(null)).toBeNull();
  });
});
