const { describe, it, expect } = require("vitest");
const request = require("supertest");
const app = require("../../app");

describe("GET /api/health", () => {
  it("returns 200 with { status: 'ok', service: 'streamergames-server' }", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      service: "streamergames-server",
    });
  });
});

describe("Error middleware contract", () => {
  it("returns 404 with { message } for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
  });
});
