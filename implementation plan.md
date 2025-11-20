# Time Capsule Implementation Plan

## 1. Objectives

- Provide a minimal-but-extensible time capsule web app where users can submit messages ("capsules") to be revealed now or in the future.
- Persist capsules indefinitely via JSON stored in Amazon S3 so the solution works on serverless platforms without local disk.
- Require a per-capsule passphrase whenever the creator supplies one; otherwise capsules are public once their reveal date passes.
- Keep the stack lightweight (Node.js + Express) while leaving room to bolt on richer auth or database layers later.

## 2. High-Level Architecture

1. **Client**: React single-page app (Vite) styled with Tailwind CSS + DaisyUI components, served from the same Express app (or separately via CDN) that handles capsule creation (POST) and listing (GET).
2. **API Layer**: Express wrapped with `serverless-http` and deployed to AWS Lambda + API Gateway (or compatible serverless host). The API exposes `/api/capsules` endpoints.
3. **Persistence**: A dedicated S3 bucket (e.g., `time-capsule-prod`) storing JSON documents. Each capsule writes as `capsules/{id}.json`; an index file (e.g., `capsules/index.json`) caches metadata for fast listings.
4. **Secrets & Config**: Environment variables managed by the serverless platform (Lambda environment, Render secrets) for bucket name, AWS credentials, bcrypt cost, optional admin override key, etc.

```text
Client (fetch) -> API Gateway -> Lambda (Express) -> S3 (JSON storage)
```

## 3. Backend Implementation (Node + Express)

### 3.1 Dependencies

#### Backend runtime

- `express` for routing.
- `serverless-http` to run Express on Lambda.
- `@aws-sdk/client-s3` for S3 access without bundling the entire v2 SDK.
- `uuid` for capsule IDs.
- `bcryptjs` for passphrase hashing and comparison.
- `zod` (or similar) for validating payloads.
- `dotenv` for local development configuration.
- `cors` and `helmet` for request hardening when the React SPA is hosted separately.

#### Backend dev & test

- `nodemon` (or `tsx`) for hot-reload during local development.
- `vitest` + `supertest` for unit/integration coverage of routes and services.

#### Frontend runtime

- `react` and `react-dom` for the SPA.
- `react-router-dom` for navigation between capsule views, gallery, and settings pages.
- `@tanstack/react-query` to cache capsule fetches, unlock attempts, and background refreshes.

#### Frontend tooling & styling

- `vite` for fast dev/build pipelines.
- `tailwindcss`, `postcss`, and `autoprefixer` for utility-first styling.
- `daisyui` piggybacking on Tailwind for prebuilt components/themes aligned with the capsule aesthetic.

### 3.2 Application Structure

```text
/time-capsule
├─ server/
│  ├─ index.js           # Express app + Lambda handler export
│  ├─ routes/
│  │  └─ capsuleRoutes.js
│  ├─ controllers/
│  │  └─ capsuleController.js
│  ├─ services/
│  │  ├─ capsuleService.js   # business logic
│  │  └─ storageService.js   # S3 helpers
│  ├─ middleware/
│  │  └─ passphraseGuard.js
│  └─ utils/
│     ├─ validation.js
│     └─ logger.js
├─ data/                  # local dev JSON cache (optional)
├─ public/                # static site
└─ implementation plan.md
```

### 3.3 Core Request Flow

1. Client submits capsule payload (message, revealAt ISO date, optional passphrase).
2. Controller validates payload; service hashes passphrase if provided.
3. Service writes capsule JSON to S3 and updates metadata index.
4. For GET requests, service reads index, filters for capsules whose reveal date has passed (or belongs to caller if they possess passphrase), and fetches full capsule documents as needed.

### 3.4 API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/capsules` | Create a new capsule (validates body, stores hashed passphrase, returns capsule metadata). |
| `GET` | `/api/capsules` | List all capsules whose `revealAt <= now` OR ones locked but requested with correct passphrase (handled via query/body + middleware). |
| `GET` | `/api/capsules/:id` | Retrieve a specific capsule; enforces passphrase if capsule is locked or reveal date is in the future. |
| `POST` | `/api/capsules/:id/unlock` | Dedicated endpoint to submit passphrase and receive capsule content, useful for future enhancements (optional but recommended for clarity). |

All responses should include `createdAt`, `revealAt`, `isLocked`, and omit the hashed passphrase.

## 4. Data & Storage Strategy

### 4.1 Capsule Schema (stored JSON)

```json
{
  "id": "uuidv4",
  "title": "string",
  "message": "string",
  "author": "string | null",
  "createdAt": "ISO timestamp",
  "revealAt": "ISO timestamp",
  "isLocked": true,
  "passphraseHash": "$2a$10$..." | null
}
```

### 4.2 S3 Layout

```text
s3://time-capsule-prod/
├─ capsules/
│  ├─ {id}.json
│  └─ index.json          # array of capsule metadata (without content or hashes)
└─ logs/                  # optional request or audit logs
```
 
- `index.json` includes cached metadata (`id`, `title`, `createdAt`, `revealAt`, `isLocked`). Lambda updates this file after each mutation to keep listing fast.
- Use S3 object versioning for safety and to support rollback.
- Apply `.keep indefinitely` policy by disabling lifecycle expiration; optionally enable Glacier tiering for cost savings on older versions.

### 4.3 Local Development

- Provide a fallback JSON file under `/data/capsules-dev.json` so the API works without AWS credentials.
- Storage service decides target via `NODE_ENV` and environment toggles.

## 5. Passphrase & Authorization Model

1. **Creation**: If the user provides a passphrase, hash it with bcrypt before persisting. Store only the hash.
2. **Retrieval**: For locked capsules, require the caller to supply the passphrase in the request body or `Authorization: CapsulePass {base64}` header. `passphraseGuard` middleware compares against the stored hash.
3. **Admin Override (optional)**: Allow an environment variable `ADMIN_OVERRIDE_KEY`. Requests with header `X-Admin-Key` matching this value can bypass passphrase checks for moderation purposes.
4. **Public Capsules**: If no passphrase is set, enforce reveal-time gating only; they become readable when `revealAt <= now`.
5. **Future Access**: Even after reveal time passes, keep `isLocked` true if a passphrase exists—unlocking still requires the secret.

## 6. Client Experience

- Build a React + Vite frontend hosted from `public/` (or its own static site) and styled with Tailwind CSS plus DaisyUI components for rapid theming.
- Sections:
  - Capsule creation form with fields: `title`, `message`, `author`, `revealAt`, optional `passphrase` + confirmation.
  - Capsule list that fetches `/api/capsules` every load; for locked capsules, display a “Unlock” button that opens a DaisyUI modal to submit the passphrase (calls `/api/capsules/:id/unlock`).
- Configure Tailwind with DaisyUI themes to offer light/dark palettes and capsule “mood” presets.
- Use React Query (or SWR) with Fetch API to handle JSON requests, cache responses, and surface error states (bad passphrase, validation errors) via DaisyUI alerts/toasts.
- Consider progressive enhancement by exposing a minimal HTML form fallback served alongside the SPA for non-JS environments.

## 7. Deployment Strategy (Serverless + S3)

### 7.1 AWS Lambda via Serverless Framework

1. Initialize `serverless.yml` with functions, IAM permissions (S3 read/write), environment variables, and HTTP events.
2. Package Express using `serverless-http` handler export.
3. Configure S3 bucket name via `CUSTOM_BUCKET` env var; set bucket policy to restrict access to the Lambda IAM role.
4. Provision CloudFront (optional) for caching static assets; otherwise host `public/` files via S3 static hosting or serve from Lambda at `/`.
5. Use AWS Systems Manager Parameter Store or Secrets Manager to store `ADMIN_OVERRIDE_KEY`, `BCRYPT_ROUNDS`, etc.

### 7.2 Render Free Tier (Fallback)

- If Render is needed, enable persistent disk or mount an S3-compatible storage (Render supports native S3 via IAM user). The same Express app can run as a long-lived service; only the storage service changes (still S3).

### 7.3 CI/CD

- Add GitHub Actions workflow that lints, runs tests, and deploys via `serverless deploy` (with OIDC or deploy key) on merges to `main`.

## 8. Testing & Observability

1. **Unit Tests**: Cover validation, storage service S3 interactions (mocked), and passphrase guard logic using `vitest` or `jest`.
2. **Integration Tests**: Use `supertest` to hit the Express router with in-memory storage.
3. **Smoke Test Script**: CLI that creates a temp capsule, fetches listings, unlocks it, and cleans up.
4. **Monitoring**: Enable CloudWatch logs for Lambda; configure alarms on error rates or duration spikes.
5. **Tracing**: Optional X-Ray instrumentation for debugging S3 latency.

## 9. Future Enhancements

- Email reminders when a capsule becomes available (SNS + SES).
- User accounts for managing personal capsules instead of passphrases.
- Full-text search using OpenSearch or DynamoDB secondary indexes.
- Export/import capsules as encrypted bundles for offline archiving.

This plan provides the necessary runway to implement and deploy a secure, serverless time capsule service with indefinite JSON storage in S3 and per-capsule passphrase protection.

## 10. Feature Roadmap

### 10.1 Milestone Steps

#### Phase 1 – Text Capsules (MVP)

- Deliver the core text-only flow already described in sections 3–6.
- Ensure the S3 schema accommodates future media fields (e.g., optional `attachments` array) to avoid migrations.

#### Phase 2 – Image Attachments

- Extend the API with a pre-signed upload endpoint (`POST /api/uploads/images`) returning temporary S3 URLs.
- Store attachment metadata (key, mime type, size) alongside the capsule; render via signed GET URLs when revealed.
- Add client-side previews and upload size validation (soft limit ~10 MB per image to keep Lambda memory low).

#### Phase 3 – Video Capsules

- Reuse the pre-signed upload flow but enforce chunked uploads and stricter size caps (e.g., 100 MB) with a transcoding job placeholder (AWS MediaConvert) for future quality control.
- Store transcoding status in capsule metadata; block reveal until processing completes.

#### Phase 4 – Template Library & Submissions

- Define a `templates` collection in S3 (or DynamoDB) describing structured prompts (fields, validation rules).
- The UI allows choosing a template to pre-fill the capsule form; creators can submit new templates for moderation via `/api/templates`.
- Implement a simple moderation queue (admin override key + status field) before templates go live.

#### Phase 5 – Mini Games + High Scores

- Treat mini games as capsule-linked experiences: each game stores score snapshots inside the capsule record under `gameStates`.
- Build lightweight Canvas or JS games (e.g., quiz, memory) hosted under `/public/games` with the ability to save scores via `/api/capsules/:id/game-state`.
- On reveal, display historical scores/leaderboards to revisit.

### 10.2 Experience Enhancers

- **Calendar Invites with Unlock Timers**: After capsule creation, generate an `.ics` invite containing the reveal timestamp and a deep link to `/capsules/{id}`. Embed instructions to open the link when the timer expires, mitigating email deliverability issues. Consider optional SMS/web push reminders later.
- **OAuth for Trusted Users**: Layer optional OAuth (Auth0, Cognito, or Supabase) ahead of capsule creation once multi-device identity is needed. Start with social providers (Google/Microsoft) to avoid password storage, map authenticated users to `ownerId`, and relax passphrase requirements for signed-in sessions.
