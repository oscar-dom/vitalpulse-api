import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /health", () => {
  it("reports that the API is up", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });
});
