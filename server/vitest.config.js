const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    globals: false,
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});
