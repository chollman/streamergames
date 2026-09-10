import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";

// MSW lifecycle: start once, reset handlers between tests, close at the end.
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));

// @testing-library/react auto-registers this only when globals: true is set;
// we keep globals off for explicit ESM imports, so wire cleanup + msw reset
// manually. Without cleanup each render leaks into the next test.
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
