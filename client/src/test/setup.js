import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react auto-registers this only when `globals: true` is set
// in the vitest config. Since we keep globals off for explicit ESM imports in
// tests, we wire cleanup manually. Without it, each test's rendered tree
// stays in the DOM and later `getByText` finds multiple matches.
afterEach(() => {
  cleanup();
});
