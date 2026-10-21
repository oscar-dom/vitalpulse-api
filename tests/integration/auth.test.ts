import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../../src/app.js";
import { UserModel } from "../../src/models/user.model.js";
import { ensureAdmin } from "../../src/services/admin.service.js";
import { useTestDatabase } from "./helpers/db.js";

useTestDatabase();

const ada = { name: "Ada Lovelace", email: "ada@example.com", password: "plain-secret-123" };

const register = (body: object) => request(app).post("/auth/register").send(body);
const login = (body: object) => request(app).post("/auth/login").send(body);

describe("POST /auth/register", () => {
  it("creates a clinician, hashes the password and returns a token", async () => {
    const res = await register({ ...ada, email: "  ADA@Example.com " });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ada@example.com", role: "clinician" });
    expect(res.body.user).not.toHaveProperty("password");
    expect(typeof res.body.token).toBe("string");

    const stored = await UserModel.findOne({ email: "ada@example.com" }).select("+password");
    expect(stored?.password).not.toBe(ada.password);
    expect(await bcrypt.compare(ada.password, stored!.password)).toBe(true);
  });

  it("does not let a client choose its role", async () => {
    const res = await register({ ...ada, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.issue[0]).toMatchObject({ code: "structure", expression: ["role"] });
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("responds 409 duplicate when the email is taken", async () => {
    await register(ada);
    const res = await register(ada);

    expect(res.status).toBe(409);
    expect(res.body.issue[0]).toMatchObject({ code: "duplicate", expression: ["email"] });
  });

  it("lists every invalid field", async () => {
    const res = await register({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    const expressions = res.body.issue.flatMap(
      (issue: { expression: string[] }) => issue.expression,
    );
    expect(expressions).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await UserModel.create(ada);
  });

  it("returns a token whose subject is the user", async () => {
    const res = await login({ email: ada.email, password: ada.password });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.sub).toBe(res.body.user.id);
  });

  it("responds 401 with the same outcome for a wrong password or unknown email", async () => {
    const wrongPassword = await login({ email: ada.email, password: "wrong-password" });
    const unknownEmail = await login({ email: "nobody@example.com", password: ada.password });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toBe("Bearer");
      expect(res.body).toEqual({
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "login", diagnostics: "Invalid email or password." }],
      });
    }
  });
});

describe("GET /auth/me", () => {
  it("returns the user behind the token", async () => {
    const { body } = await register(ada);
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ada.email);
  });

  it("responds 401 login without a token", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.issue[0].code).toBe("login");
  });

  it("responds 401 security for a forged token", async () => {
    const forged = jwt.sign(
      { sub: "507f1f77bcf86cd799439011" },
      "another-secret-of-32-characters!!",
    );
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.issue[0].code).toBe("security");
  });

  it("responds 401 expired for an expired token", async () => {
    const { body } = await register(ada);
    const expired = jwt.sign(
      { sub: body.user.id, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET!,
    );
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.issue[0].code).toBe("expired");
  });

  it("responds 401 when the user of the token was deleted", async () => {
    const { body } = await register(ada);
    await UserModel.deleteMany({});
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${body.token}`);

    expect(res.status).toBe(401);
  });
});

describe("ensureAdmin (npm run seed:admin)", () => {
  it("creates the admin once and never overwrites an existing account", async () => {
    const first = await ensureAdmin({ ...ada, email: "root@example.com" });
    const second = await ensureAdmin({ ...ada, email: "root@example.com", name: "Changed" });

    expect(first.created).toBe(true);
    expect(first.user.role).toBe("admin");
    expect(second.created).toBe(false);
    expect(second.user.name).toBe(ada.name);
  });
});
