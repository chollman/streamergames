import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

async function fillLoginAndSubmit(user, { email = "s@x.com", password = "hunter22x" } = {}) {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/contraseña/i), password);
  await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));
}

describe("Login page", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("renders the login form", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/login"] }) });
    expect(screen.getByRole("heading", { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("on successful login, sets auth and lands on Home", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json({
          user: { displayName: "Claudio", email: "s@x.com" },
          token: "jwt-x",
          channel: { slug: "claudio" },
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/login"] }) });
    await fillLoginAndSubmit(user);
    await waitFor(() => {
      expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
    });
    expect(store.getState().auth.token).toBe("jwt-x");
  });

  it("on 401 invalid_credentials, shows the error message in-place", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json(
          { message: "Email o contraseña incorrectos", code: "invalid_credentials" },
          { status: 401 }
        )
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/login"] }) });
    await fillLoginAndSubmit(user);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/email o contraseña incorrectos/i);
    });
    expect(store.getState().auth.token).toBeNull();
  });

  it("on 403 email_not_verified, redirects to /verificar-email with the email", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json(
          {
            message: "Verificá tu email para iniciar sesión",
            code: "email_not_verified",
            email: "s@x.com",
          },
          { status: 403 }
        )
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/login"] }) });
    await fillLoginAndSubmit(user);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /verificá tu email/i })).toBeInTheDocument();
    });
    // The email field on the verify page is pre-filled from the query param.
    expect(screen.getByLabelText(/email/i)).toHaveValue("s@x.com");
  });
});
