import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { setAuth, clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

describe("Route guards", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("PrivateRoute redirects unauthenticated visits to /login", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/"] }) });
    expect(screen.getByRole("heading", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("PublicRoute redirects authenticated visits to /", () => {
    store.dispatch(setAuth({
      token: "jwt-x",
      user: { displayName: "Claudio" },
      channel: { slug: "claudio" },
    }));
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/login"] }) });
    expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
  });

  it("unknown paths fall back to /", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/definitely-not-a-page"] }) });
    // Unauthenticated → PrivateRoute at / kicks back to /login.
    expect(screen.getByRole("heading", { name: /iniciar sesión/i })).toBeInTheDocument();
  });
});
