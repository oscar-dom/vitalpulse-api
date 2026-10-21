# VitalPulse API

[HL7 FHIR R4](https://hl7.org/fhir/R4/) server for vital signs. Admins keep a catalog of
`Patient` resources; clinicians record heart rate, respiratory rate, body temperature and
oxygen saturation as `Observation` resources, and the **server interprets every value**
against its reference range (normal, low, high, critical).

- FHIR RESTful API on `/fhir`: create, read, vread, update, delete and search, in
  `application/fhir+json`.
- `Patient` and `Observation` (vital signs profile, LOINC codes, UCUM units).
- Searches return a `searchset` `Bundle` with `total` and paging links. Filters, sorting
  and paging combine in one query; `_include` brings the patients along.
- Versioned resources: `meta.versionId`, `ETag`, `If-Match` (optimistic locking) and
  `_history/{vid}`.
- Every error, FHIR or not, is an `OperationOutcome` that points at the element at fault.
- `CapabilityStatement` at `/fhir/metadata`, kept in sync with the code by a test.
- Sign up and log in with JWT; passwords hashed with bcrypt; `admin` and `clinician` roles.
- Security headers (helmet), CORS, rate limiting and structured logs (pino).
- Interactive OpenAPI documentation and integration tests.

## Tech stack

Node.js 22 · TypeScript · Express 5 · MongoDB Atlas + Mongoose · Zod · JWT · bcrypt ·
helmet · cors · express-rate-limit · pino · Swagger UI · Vitest + Supertest ·
[`@types/fhir`](https://www.npmjs.com/package/@types/fhir)

## Getting started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 22 or later (includes npm). Works on Windows, macOS and Linux.
- A free MongoDB Atlas account (next step). No local database is needed.

### 2. Create a MongoDB Atlas database

1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) and
   create a project.
2. **Create a cluster:** choose the free **M0** tier, any provider (e.g. AWS) and a region
   close to you.
3. **Create a database user:** in *Database Access*, add a user with a username and
   password, and the *Read and write to any database* role. Keep the password.
4. **Allow your IP:** in *Network Access*, add your current IP address
   (or `0.0.0.0/0` to allow any IP, for testing only).
5. **Get the connection string:** in *Clusters*, click **Connect** → **Drivers** and copy
   the URI. It looks like:

   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```

   Replace `<user>` and `<password>`, and add the database name `vitalpulse` before the
   `?`:

   ```
   mongodb+srv://ada:s3cret@cluster0.abcde.mongodb.net/vitalpulse?retryWrites=true&w=majority
   ```

   The database and its collections are created automatically on first use.

### 3. Install and configure

```bash
git clone https://github.com/oscar-dom/vitalpulse-api.git
cd vitalpulse-api
npm install
cp .env.example .env        # Windows (cmd): copy .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `MONGODB_URI` | The Atlas connection string from step 2 |
| `JWT_SECRET` | Random string of 32+ characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1h` (default) |
| `FHIR_BASE_URL` | Public URL of the FHIR endpoint, `http://localhost:3000/fhir` by default. Used for `Location`, `fullUrl` and paging links: change it if the API is served elsewhere |
| `PORT` | HTTP port, `3000` by default |
| `NODE_ENV` | `development` (default), `test` or `production`. Only in `development` do 500 responses include the stack trace: use `production` when deploying |
| `CORS_ORIGIN` | Origin of the web client allowed to call the API, `http://localhost:5173` by default |
| `LOG_LEVEL` | Minimum log level: `fatal`, `error`, `warn`, `info` (default), `debug`, `trace` or `silent` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account, used only by `npm run seed:admin` |

If a variable is missing or invalid, the server stops at startup and says which one.

### 4. Create the first admin and start

```bash
npm run seed:admin   # creates the admin from ADMIN_* (safe to rerun)
npm run dev          # starts the API with auto-reload
```

You should see `MongoDB connected: ...` and
`VitalPulse API listening on http://localhost:3000`. Check it with
`curl http://localhost:3000/health`, and ask the FHIR server what it supports with
`curl http://localhost:3000/fhir/metadata`.

For a production-like run: `npm run build` and then `npm start`.

## Trying the API

### Interactive documentation

Open **http://localhost:3000/docs** (Swagger UI). Every endpoint is described with its
body, parameters, headers and possible responses, with real examples, and can be tried
from the browser:

1. `POST /auth/login` with the admin email and password from `.env` → copy the `token`.
2. Click **Authorize**, paste the token and confirm.
3. Try `POST /fhir/Patient`, then `POST /fhir/Observation` and `GET /fhir/Observation`.

The raw spec is at `/docs/openapi.json`.

### REST Client file

[`docs/api.http`](docs/api.http) has ready-to-send requests for every interaction, in
the order of a typical session: sign up, log in (tokens are saved automatically), create
and update a patient, record normal, high and critical observations, correct one, and
search. Open it in VS Code with the
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
extension and click **Send Request** above each request. Set `@adminEmail` and
`@adminPassword` at the top of the file to the `ADMIN_*` values of your `.env`.

### A typical flow

1. **Sign up** (`POST /auth/register`). New accounts are always `clinician` and the
   response already has a token. Send it as `Authorization: Bearer <token>`.
2. An **admin** creates a patient:

   ```http
   POST /fhir/Patient
   Content-Type: application/fhir+json

   {
     "resourceType": "Patient",
     "identifier": [{ "system": "https://hospital.example.org/mrn", "value": "MRN-0042" }],
     "name": [{ "family": "Lovelace", "given": ["Ada"] }],
     "gender": "female",
     "birthDate": "1985-12-10"
   }
   ```

3. A **clinician** records a heart rate. Unit, reference range and interpretation are
   added by the server:

   ```http
   POST /fhir/Observation
   Content-Type: application/fhir+json

   {
     "resourceType": "Observation",
     "status": "final",
     "code": { "coding": [{ "system": "http://loinc.org", "code": "8867-4" }] },
     "subject": { "reference": "Patient/<id>" },
     "effectiveDateTime": "2026-10-21T08:30:00+02:00",
     "valueQuantity": { "value": 118 }
   }
   ```

   → `201` with `"interpretation": [{ "coding": [{ "code": "H", "display": "High" }] }]`.

4. Anyone signed in **searches**, combining filters, sorting and paging:

   ```
   GET /fhir/Observation?patient=Patient/<id>&code=8867-4&interpretation=H,HH&date=ge2026-10-01&_sort=-date&_count=10&_include=Observation:patient
   ```

   and follows the `next` link of the Bundle to get the following page.

## FHIR conformance

| | |
|---|---|
| FHIR version | R4 (4.0.1), JSON only |
| Base URL | `/fhir` |
| Media types | `application/fhir+json` (also accepts `application/json`); other bodies → `415` |
| Resources | `Patient`, `Observation` (profile `vitalsigns`) |
| Vital signs (LOINC) | `8867-4` heart rate `/min` · `9279-1` respiratory rate `/min` · `8310-5` body temperature `Cel` · `2708-6` oxygen saturation `%` |
| Interpretation | `N`, `L`, `H`, `LL`, `HH` from `v3-ObservationInterpretation`; a value equal to a limit stays on the inner side |
| Versioning | `meta.versionId`, weak `ETag`, `If-Match` → `412` when stale, vread at `/_history/{vid}` |
| Ids | Always assigned by the server; `PUT` of an unknown id → `405` |
| Delete | `Patient` only, kept as deleted: reads answer `410`. Not allowed while it has observations (`409`). Observations are corrected with a new version (`amended`, `entered-in-error`), never deleted |
| Unknown elements | Rejected with `400`, never silently dropped |
| Unknown search parameters | Ignored; `Prefer: handling=strict` turns them into `400` |

## Endpoints

| Method | Path | Access | Interaction |
|---|---|---|---|
| GET | `/health` | Public | Service status |
| POST | `/auth/register` | Public | Sign up (clinician), returns a JWT |
| POST | `/auth/login` | Public | Log in, returns a JWT |
| GET | `/auth/me` | Signed in | Current user |
| GET | `/fhir/metadata` | Public | `capabilities` (CapabilityStatement) |
| GET | `/fhir/Patient` | Signed in | `search-type`: `_id`, `identifier`, `name`, `family`, `gender`, `active` |
| POST | `/fhir/Patient` | Admin | `create` |
| GET | `/fhir/Patient/{id}` | Signed in | `read` |
| PUT | `/fhir/Patient/{id}` | Admin | `update` |
| DELETE | `/fhir/Patient/{id}` | Admin | `delete` |
| GET | `/fhir/Patient/{id}/_history/{vid}` | Signed in | `vread` |
| GET | `/fhir/Observation` | Signed in | `search-type`: `patient`, `subject`, `code`, `interpretation`, `status`, `category`, `date`, `_include` |
| POST | `/fhir/Observation` | Signed in | `create` |
| GET | `/fhir/Observation/{id}` | Signed in | `read` |
| PUT | `/fhir/Observation/{id}` | Signed in | `update` (correction) |
| GET | `/fhir/Observation/{id}/_history/{vid}` | Signed in | `vread` |

All searches accept `_count` (default 10, max 50, `0` for the total only), `_page` and
`_sort` (`-` for descending).

### Errors

Every error is an `OperationOutcome`:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "business-rule",
      "diagnostics": "Body temperature is measured in \"Cel\", not \"[degF]\".",
      "expression": ["Observation.valueQuantity.code"]
    }
  ]
}
```

| Status | Issue code | When |
|---|---|---|
| `400` | `invalid`, `structure` | Malformed JSON or a resource / parameter that does not fit the schema |
| `401` | `login`, `security`, `expired` | No token, a forged one or an expired one (with `WWW-Authenticate: Bearer`) |
| `403` | `forbidden` | Signed in, but the role is not allowed |
| `404` | `not-found`, `not-supported` | Unknown resource, or a resource type the server does not implement |
| `405` | `not-supported` | Method not supported on that path (with `Allow`), or update of an unknown id |
| `409` | `duplicate`, `conflict` | Email or identifier taken; patient with observations |
| `410` | `deleted` | The patient was deleted |
| `412` | `conflict` | `If-Match` is not the current version |
| `415` | `not-supported` | The body is not JSON |
| `422` | `business-rule` | Unsupported vital sign, wrong unit, impossible value, unknown or inactive patient |
| `429` | `throttled` | More than 100 requests per IP in 15 minutes |

## Tests

```bash
npm test
```

Integration tests with Vitest and Supertest run against an in-memory MongoDB
([mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server)), so they
need no Atlas connection and never touch real data. The first run downloads a MongoDB
binary, which can take a minute. CI runs type checking, linting, formatting, tests and
the build on every pull request.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the server in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run seed:admin` | Create the first admin account from `.env` (safe to rerun) |
| `npm test` | Run the test suite |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format code with Prettier |

## Project structure

```
src/
├── app.ts          # Express app (middlewares, routes); does not start the server
├── server.ts       # connects to MongoDB and starts the server
├── seed-admin.ts   # creates the first admin (npm run seed:admin)
├── config/         # environment variables, database connection and logger
├── errors/         # AppError (→ OperationOutcome) and the authentication errors
├── fhir/           # FHIR layer: types, model ↔ resource mappers, Bundle, OperationOutcome,
│                   #   search parameter parsing, vital signs catalog, CapabilityStatement
├── schemas/        # Zod schemas: FHIR primitives, Patient, Observation, auth
├── middlewares/    # authentication, roles, validation, content type, 405, rate limit, errors
├── docs/           # OpenAPI specification (openapi.json, served at /docs)
├── routes/         # URL → middlewares → controller
├── controllers/    # HTTP in/out: read the request, send the resource
├── services/       # business logic: interpretation, searches, versions, rules
├── models/         # Mongoose schemas: User, Patient, Observation, ResourceVersion
└── types/          # type augmentations (req.user)
tests/
└── integration/    # Vitest + Supertest
docs/
└── api.http        # REST Client requests
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

> The reference ranges are orientative adult values used to demonstrate server-side
> interpretation. This project is not a medical device and must not be used for
> clinical decisions.
