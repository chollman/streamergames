const { describe, it, expect } = require("vitest");
const httpError = require("../../utils/httpError");

describe("httpError", () => {
  it("returns an Error with the given status and message", () => {
    const err = httpError(404, "not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe("not found");
  });

  it("attaches a code when provided", () => {
    const err = httpError(403, "banned", { code: "banned" });
    expect(err.code).toBe("banned");
  });

  it("omits code when not provided", () => {
    const err = httpError(400, "bad");
    expect(err.code).toBeUndefined();
  });
});
