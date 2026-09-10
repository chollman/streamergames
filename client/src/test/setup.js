import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";

// Mock socket.io-client globally so useSocket doesn't create real WebSocket
// connections during tests. jsdom's WebSocket implementation can leave
// dangling handles that crash Vitest workers ("Worker exited unexpectedly").
// Real socket flow is validated by the server-side socket integration tests.
vi.mock("socket.io-client", () => {
  const noop = () => {};
  return {
    io: () => ({
      on: noop,
      off: noop,
      once: noop,
      emit: noop,
      connect: noop,
      disconnect: noop,
      close: noop,
    }),
  };
});

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
