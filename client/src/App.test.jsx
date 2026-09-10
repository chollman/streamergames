import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllProviders, makeWrapper } from "./test/wrappers/AllProviders";
import { store } from "./store/store";
import { setAuth, clearAuth } from "./store/slices/authSlice";
import App from "./App";

describe("App shell", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("unauthenticated visitor lands on Login", () => {
    render(<App />, { wrapper: AllProviders });
    expect(screen.getByRole("heading", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("authenticated visitor lands on Home", () => {
    store.dispatch(setAuth({
      token: "jwt-x",
      user: { displayName: "Claudio" },
      channel: { slug: "claudio" },
    }));
    render(<App />, { wrapper: AllProviders });
    expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
    expect(screen.getByText(/tu canal: claudio/i)).toBeInTheDocument();
  });

  it("the register page renders at /registro", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/registro"] }) });
    expect(screen.getByRole("heading", { name: /crear cuenta/i })).toBeInTheDocument();
  });
});
