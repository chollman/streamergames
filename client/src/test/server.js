import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Default handlers — override per test with `server.use(http.post(...))`.
// Anything not matched surfaces as a warning during the test (see setup.js).
const defaultHandlers = [
  http.get("*/api/auth/me", () =>
    HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
  ),
];

export const server = setupServer(...defaultHandlers);
