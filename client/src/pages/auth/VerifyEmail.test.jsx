import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/server";
import { makeWrapper } from "../../test/wrappers/AllProviders";
import { store } from "../../store/store";
import { clearAuth } from "../../store/slices/authSlice";
import App from "../../App";

describe("VerifyEmail page", () => {
  beforeEach(() => {
    store.dispatch(clearAuth());
    try { localStorage.removeItem("streamergames_auth"); } catch { /* ignore */ }
  });

  it("reads email from the query string and pre-fills it as readonly", () => {
    render(<App />, {
      wrapper: makeWrapper({ initialEntries: ["/verificar-email?email=s%40x.com"] }),
    });
    expect(screen.getByRole("heading", { name: /verificá tu email/i })).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveValue("s@x.com");
    expect(emailInput).toHaveAttribute("readonly");
  });

  it("submit button stays disabled until 6 digits are entered", async () => {
    const user = userEvent.setup();
    render(<App />, {
      wrapper: makeWrapper({ initialEntries: ["/verificar-email?email=s%40x.com"] }),
    });
    const btn = screen.getByRole("button", { name: /verificar/i });
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText(/código/i), "123");
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText(/código/i), "456");
    expect(btn).toBeEnabled();
  });

  it("non-digit input to the code field is stripped", async () => {
    const user = userEvent.setup();
    render(<App />, {
      wrapper: makeWrapper({ initialEntries: ["/verificar-email?email=s%40x.com"] }),
    });
    await user.type(screen.getByLabelText(/código/i), "12a3b4c56");
    expect(screen.getByLabelText(/código/i)).toHaveValue("123456");
  });

  it("on success: sets auth from the response and lands on Home", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/verify-email", () =>
        HttpResponse.json({
          user: { displayName: "Claudio" },
          token: "jwt-verified",
          channel: { slug: "claudio" },
        })
      )
    );
    render(<App />, {
      wrapper: makeWrapper({ initialEntries: ["/verificar-email?email=s%40x.com"] }),
    });
    await user.type(screen.getByLabelText(/código/i), "123456");
    await user.click(screen.getByRole("button", { name: /verificar/i }));
    await waitFor(() => {
      expect(screen.getByText(/hola, claudio/i)).toBeInTheDocument();
    });
    expect(store.getState().auth.token).toBe("jwt-verified");
  });

  it("on 400 invalid_code, shows the error and stays on the page", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/auth/verify-email", () =>
        HttpResponse.json(
          { message: "Código inválido", code: "invalid_code" },
          { status: 400 }
        )
      )
    );
    render(<App />, {
      wrapper: makeWrapper({ initialEntries: ["/verificar-email?email=s%40x.com"] }),
    });
    await user.type(screen.getByLabelText(/código/i), "000000");
    await user.click(screen.getByRole("button", { name: /verificar/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/código inválido/i);
    });
    expect(screen.getByRole("heading", { name: /verificá tu email/i })).toBeInTheDocument();
  });
});
