const request = require("supertest");
const app = require("../../app");
const User = require("../../models/User");
const Channel = require("../../models/Channel");

async function register(overrides = {}) {
  const body = {
    email: "streamer@example.com",
    password: "supersecret",
    displayName: "Streamer One",
    ...overrides,
  };
  return request(app).post("/api/auth/register").send(body);
}

describe("POST /api/auth/register", () => {
  it("creates the user + auto-creates their channel + returns dev code", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("streamer@example.com");
    expect(res.body.devCode).toMatch(/^\d{6}$/);
    expect(res.body.token).toBeUndefined(); // No JWT before verification.

    const user = await User.findOne({ email: "streamer@example.com" });
    expect(user).toBeTruthy();
    expect(user.emailVerified).toBe(false);
    const channel = await Channel.findOne({ ownerUserId: user._id });
    expect(channel).toBeTruthy();
    expect(channel.slug).toBe("streamer-one");
  });

  it("rejects duplicate email with 409 + code=email_in_use", async () => {
    await register();
    const res = await register();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_in_use");
  });

  it("rejects password shorter than 8 characters", async () => {
    const res = await register({ password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("password_too_short");
  });

  it("rejects missing fields", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("missing_fields");
  });

  it("never returns password or verification in the response", async () => {
    const res = await register();
    expect(res.body.password).toBeUndefined();
    expect(res.body.verification).toBeUndefined();
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies with the correct code and returns { user, token, channel }", async () => {
    const reg = await register();
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: reg.body.devCode });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe("streamer@example.com");
    expect(res.body.user.emailVerified).toBe(true);
    expect(res.body.channel.slug).toBe("streamer-one");

    // Verification fields are wiped after success
    const user = await User.findOne({ email: "streamer@example.com" });
    expect(user.verification).toBeUndefined();
  });

  it("rejects wrong code and increments the attempts counter", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_code");
    const user = await User.findOne({ email: "streamer@example.com" });
    expect(user.verification.attempts).toBe(1);
  });

  it("locks after 5 attempts with too_many_attempts", async () => {
    await register();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/verify-email")
        .send({ email: "streamer@example.com", code: "000000" });
    }
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: "000000" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("too_many_attempts");
  });

  it("is idempotent for an already-verified user (returns token)", async () => {
    const reg = await register();
    await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: reg.body.devCode });
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: "whatever" });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});

describe("POST /api/auth/login", () => {
  it("returns { user, token, channel } for verified user with correct password", async () => {
    const reg = await register();
    await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: reg.body.devCode });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "streamer@example.com", password: "supersecret" });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.channel.slug).toBe("streamer-one");
  });

  it("rejects wrong password with 401 + invalid_credentials", async () => {
    const reg = await register();
    await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: reg.body.devCode });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "streamer@example.com", password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("rejects unknown email with 401 + invalid_credentials (no leak)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "anything" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("rejects unverified user with 403 + email_not_verified", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "streamer@example.com", password: "supersecret" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("email_not_verified");
  });
});

describe("GET /api/auth/me", () => {
  async function loggedIn() {
    const reg = await register();
    const ver = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "streamer@example.com", code: reg.body.devCode });
    return ver.body.token;
  }

  it("returns { user, channel } for a valid Bearer token", async () => {
    const token = await loggedIn();
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("streamer@example.com");
    expect(res.body.channel.slug).toBe("streamer-one");
  });

  it("rejects missing Authorization header with 401 + no_token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("no_token");
  });

  it("rejects invalid token with 401 + invalid_token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-valid-jwt");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_token");
  });
});
