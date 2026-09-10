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

  it("carries extra data alongside code via err.data", () => {
    const err = httpError(409, "conflict", {
      code: "active_session_exists",
      sessionId: "abc123",
    });
    expect(err.code).toBe("active_session_exists");
    expect(err.data).toEqual({ sessionId: "abc123" });
  });

  it("leaves err.data undefined when only code is provided", () => {
    const err = httpError(400, "bad", { code: "x" });
    expect(err.data).toBeUndefined();
  });
});
