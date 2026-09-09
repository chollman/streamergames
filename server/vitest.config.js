const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    // Constitution §5-adjacent: Vitest 2.x cannot be require()'d from
    // CommonJS. Enabling globals lets test files use describe / it /
    // expect / vi / beforeAll / afterAll / beforeEach / afterEach without
    // importing them, which is the officially supported workaround.
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
