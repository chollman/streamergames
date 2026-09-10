import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { store } from "../store/store";
import { clearAuth } from "../store/slices/authSlice";
import { register, verifyEmail, login, logout } from "./auth";

describe("queries/auth", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("register returns the server payload; does NOT set auth (no token yet)", async () => {
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json({ email: "s@x.com", message: "Te enviamos un código", devCode: "123456" })
      )
    );
    const res = await register({ email: "s@x.com", password: "hunter22x", displayName: "S" });
    expect(res).toMatchObject({ email: "s@x.com", devCode: "123456" });
    expect(store.getState().auth.token).toBeNull();
  });

  it("verifyEmail sets auth (token + user + channel) in the store", async () => {
    server.use(
      http.post("*/api/auth/verify-email", () =>
        HttpResponse.json({
          user: { email: "s@x.com" },
          token: "jwt-xyz",
          channel: { slug: "streamer" },
        })
      )
    );
    await verifyEmail({ email: "s@x.com", code: "123456" });
    const a = store.getState().auth;
    expect(a.token).toBe("jwt-xyz");
    expect(a.user).toEqual({ email: "s@x.com" });
    expect(a.channel).toEqual({ slug: "streamer" });
  });

  it("login sets auth on success", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json({
          user: { email: "s@x.com" },
          token: "jwt-login",
          channel: { slug: "streamer" },
        })
      )
    );
    await login({ email: "s@x.com", password: "hunter22x" });
    expect(store.getState().auth.token).toBe("jwt-login");
  });

  it("login failure propagates the 401 body", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json({ message: "Invalid email or password", code: "invalid_credentials" }, { status: 401 })
      )
    );
    let error;
    try {
      await login({ email: "s@x.com", password: "wrong" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.response.status).toBe(401);
    expect(error.response.data.code).toBe("invalid_credentials");
    expect(store.getState().auth.token).toBeNull();
  });

  it("logout clears auth", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json({ user: { x: 1 }, token: "t", channel: { y: 2 } })
      )
    );
    await login({ email: "s@x.com", password: "hunter22x" });
    expect(store.getState().auth.token).toBe("t");
    logout();
    expect(store.getState().auth.token).toBeNull();
  });
});
