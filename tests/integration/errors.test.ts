import express from "express";
import request from "supertest";
import { z } from "zod";
import { app } from "../../src/app.js";
import { AppError } from "../../src/errors/app.error.js";
import { ACCEPTED_BODY_TYPES } from "../../src/middlewares/content-type.middleware.js";
import { globalErrorHandler } from "../../src/middlewares/error.middleware.js";
import {
  toExpression,
  validateBody,
  validateQuery,
} from "../../src/middlewares/validate.middleware.js";

const FHIR_JSON = /application\/fhir\+json/;

// A small app that only exercises the error and validation middlewares.
const testApp = express();
testApp.use(express.json({ type: ACCEPTED_BODY_TYPES }));
testApp.post(
  "/patients",
  validateBody(
    z.object({ name: z.array(z.object({ family: z.string("family must be a string") })) }),
    "Patient",
  ),
  (req, res) => {
    res.json(req.body);
  },
);
testApp.get(
  "/search",
  validateQuery(z.object({ _count: z.coerce.number().int() })),
  (_req, res) => {
    res.json({ ok: true });
  },
);
testApp.get("/boom", () => {
  throw new Error("database exploded");
});
testApp.get("/conflict", () => {
  throw new AppError("Already exists.", 409);
});
testApp.use(globalErrorHandler);

describe("Errors as OperationOutcome", () => {
  it("answers an unknown route with 404 not-found", async () => {
    const res = await request(app).get("/nowhere");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(FHIR_JSON);
    expect(res.body).toEqual({
      resourceType: "OperationOutcome",
      issue: [
        { severity: "error", code: "not-found", diagnostics: "Route not found: GET /nowhere" },
      ],
    });
  });

  it("answers malformed JSON with 400 structure", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/fhir+json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.issue[0]).toMatchObject({ code: "structure" });
  });

  it("answers a body that is not JSON with 415", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/xml")
      .send("<Patient/>");

    expect(res.status).toBe(415);
    expect(res.body.issue[0].code).toBe("not-supported");
    expect(res.body.issue[0].diagnostics).toContain("application/fhir+json");
  });

  it("maps an AppError status to its issue code", async () => {
    const res = await request(testApp).get("/conflict");

    expect(res.status).toBe(409);
    expect(res.body.issue[0]).toEqual({
      severity: "error",
      code: "conflict",
      diagnostics: "Already exists.",
    });
  });

  it("hides internals of an unexpected error", async () => {
    const res = await request(testApp).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.issue[0].code).toBe("exception");
    expect(res.body.issue[0].diagnostics).toBe("An unexpected error occurred.");
  });
});

describe("Validation", () => {
  it("reports each invalid element with its FHIRPath expression", async () => {
    const res = await request(testApp)
      .post("/patients")
      .set("Content-Type", "application/fhir+json")
      .send({ name: [{ family: "Doe" }, { family: 7 }] });

    expect(res.status).toBe(400);
    expect(res.body.issue).toEqual([
      {
        severity: "error",
        code: "invalid",
        diagnostics: "Patient.name[1].family: family must be a string",
        expression: ["Patient.name[1].family"],
      },
    ]);
  });

  it("names the wrong query parameter", async () => {
    const res = await request(testApp).get("/search?_count=abc");

    expect(res.status).toBe(400);
    expect(res.body.issue[0].diagnostics).toMatch(/^Parameter "_count":/);
  });

  it("builds FHIRPath expressions from Zod paths", () => {
    expect(toExpression(["name", 0, "given", 1], "Patient")).toBe("Patient.name[0].given[1]");
    expect(toExpression(["status"])).toBe("status");
    expect(toExpression([], "Observation")).toBe("Observation");
  });
});
