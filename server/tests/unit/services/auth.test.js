const {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  generateVerificationCode,
  makeVerificationSnapshot,
  CODE_TTL_MS,
} = require("../../../services/auth");

describe("services/auth — password hashing", () => {
  it("hashPassword produces a bcrypt hash that comparePassword accepts", async () => {
    const hash = await hashPassword("hunter2xx");
    expect(hash).not.toBe("hunter2xx");
    expect(await comparePassword("hunter2xx", hash)).toBe(true);
  });

  it("comparePassword rejects wrong passwords", async () => {
    const hash = await hashPassword("hunter2xx");
    expect(await comparePassword("wrongpass", hash)).toBe(false);
  });

  it("comparePassword returns false when hash is missing", async () => {
    expect(await comparePassword("anything", null)).toBe(false);
    expect(await comparePassword("anything", undefined)).toBe(false);
  });
});

describe("services/auth — JWT", () => {
  it("signToken → verifyToken round-trips the userId", () => {
    const token = signToken("507f1f77bcf86cd799439011");
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe("507f1f77bcf86cd799439011");
  });

  it("verifyToken rejects tampered tokens", () => {
    const token = signToken("507f1f77bcf86cd799439011");
    const tampered = token.slice(0, -3) + "xxx";
    expect(() => verifyToken(tampered)).toThrow();
  });
});

describe("services/auth — verification code", () => {
  it("generateVerificationCode is 6 digits", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("makeVerificationSnapshot has a code, an expiry in the future, and 0 attempts", () => {
    const before = Date.now();
    const snap = makeVerificationSnapshot();
    expect(snap.code).toMatch(/^\d{6}$/);
    expect(snap.attempts).toBe(0);
    expect(snap.expiresAt.getTime()).toBeGreaterThan(before);
    expect(snap.expiresAt.getTime()).toBeLessThanOrEqual(before + CODE_TTL_MS + 1000);
  });
});
