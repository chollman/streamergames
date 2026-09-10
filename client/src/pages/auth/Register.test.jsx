import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

async function fillAndSubmit(user) {
  await user.type(screen.getByLabelText(/nombre a mostrar/i), "Claudio");
  await user.type(screen.getByLabelText(/email/i), "s@x.com");
  await user.type(screen.getByLabelText(/contraseña/i), "hunter22x");
  await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
}

describe("Register page", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("renders the register form", () => {
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/registro"] }) });
    expect(screen.getByRole("heading", { name: /crear cuenta/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre a mostrar/i)).toBeInTheDocument();
  });

  it("on successful register, redirects to /verificar-email with the email; does NOT set token", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json({
          email: "s@x.com",
          message: "Te enviamos un código",
          devCode: "123456",
        })
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/registro"] }) });
    await fillAndSubmit(user);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /verificá tu email/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email/i)).toHaveValue("s@x.com");
    expect(store.getState().auth.token).toBeNull();
  });

  it("on 409 email_in_use, shows the error message", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json(
          { message: "Ya hay una cuenta con ese email", code: "email_in_use" },
          { status: 409 }
        )
      )
    );
    render(<App />, { wrapper: makeWrapper({ initialEntries: ["/registro"] }) });
    await fillAndSubmit(user);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/ya hay una cuenta/i);
    });
  });
});
