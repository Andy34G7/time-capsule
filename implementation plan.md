# Time Capsule Implementation Plan

## 1. Objectives

- Provide a minimal-but-extensible time capsule web app where users can submit messages ("capsules") to be revealed now or in the future.
- Persist capsules indefinitely in Turso (serverless SQLite) so the solution works on serverless platforms without local disk while supporting relational queries.
- Require a per-capsule passphrase whenever the creator supplies one; otherwise capsules are public once their reveal date passes.
- Keep the stack lightweight (Node.js + Express) while leaving room to bolt on richer auth or database layers later, including OAuth-based login so capsules remain visible only to their owners when desired.

## 2. High-Level Architecture

1. **Client**: React single-page app (Vite) styled with Tailwind CSS + DaisyUI components, served from the same Express app (or separately via CDN) that handles capsule creation (POST) and listing (GET).
2. **API Layer**: Express wrapped with `serverless-http` and deployed to AWS Lambda + API Gateway (or compatible serverless host). The API exposes `/api/capsules` endpoints.
3. **Persistence**: Turso database (libSQL over HTTP) hosting a normalized `capsules` table. Every request executes SQL through the shared driver, and indexes handle reveal-time lookups without loading entire datasets.
4. **Secrets & Config**: Environment variables managed by the serverless platform (Lambda environment, Render secrets) for `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, bcrypt cost, optional admin override key, etc.

```text
Client (fetch) -> API Gateway -> Lambda (Express) -> Turso (serverless SQLite)
```

## 3. Backend Implementation (Node + Express)

### 3.1 Dependencies

#### Backend runtime

- `express` for routing.
- `serverless-http` to run Express on Lambda.
- `@libsql/client` for Turso/libSQL queries (HTTP-friendly and works in serverless runtimes).
- `uuid` for capsule IDs.
- `bcryptjs` for passphrase hashing and comparison.
- `zod` (or similar) for validating payloads.
- `dotenv` for local development configuration.
- `cors` and `helmet` for request hardening when the React SPA is hosted separately.
- Turso-aware migration tooling (e.g., Turso CLI or drizzle-kit) to apply schema changes alongside deploys.

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
│  │  └─ storageService.js   # Turso persistence helpers
│  ├─ middleware/
│  │  └─ passphraseGuard.js
│  └─ utils/
│     ├─ validation.js
│     └─ logger.js
├─ data/                  # local dev SQLite file + seed data
├─ public/                # static site
└─ implementation plan.md
```

### 3.3 Core Request Flow

1. Client submits capsule payload (message, revealAt ISO date, optional passphrase).
2. Controller validates payload; service hashes passphrase if provided.
3. Service writes the capsule row to Turso inside a single `INSERT`, letting the DB enforce uniqueness and durability.
4. For GET requests, service issues parameterized `SELECT` queries scoped by reveal thresholds or capsule ID rather than loading every record into memory.

### 3.4 API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/capsules` | Create a new capsule (validates body, stores hashed passphrase, returns capsule metadata). |
| `GET` | `/api/capsules` | List all capsules whose `revealAt <= now` OR ones locked but requested with correct passphrase (handled via query/body + middleware). |
| `GET` | `/api/capsules/:id` | Retrieve a specific capsule; enforces passphrase if capsule is locked or reveal date is in the future. |
| `POST` | `/api/capsules/:id/unlock` | Dedicated endpoint to submit passphrase and receive capsule content, useful for future enhancements (optional but recommended for clarity). |

All responses should include `createdAt`, `revealAt`, `isLocked`, and omit the hashed passphrase.

## 4. Data & Storage Strategy

### 4.1 Capsule Schema (Turso SQL)

```sql
CREATE TABLE IF NOT EXISTS capsules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT,
  owner_id TEXT,
  created_at TEXT NOT NULL,
  reveal_at TEXT NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  passphrase_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_capsules_reveal ON capsules (reveal_at);
CREATE INDEX IF NOT EXISTS idx_capsules_locked ON capsules (is_locked);
```

- Store all datetimes as ISO-8601 strings so comparisons sort lexicographically.
- `is_locked` stays `1` even after reveal to enforce passphrase unlocking.
- `owner_id` remains nullable until OAuth launches, then stores the external user identifier to scope listings.
- Future columns (attachments, template references) can be appended via migrations.

### 4.2 Query & Access Patterns

- `listCapsuleSummaries`: `SELECT ... ORDER BY reveal_at LIMIT ? OFFSET ?` to support pagination instead of scanning the whole table.
- `getCapsuleStatus`: parameterized lookup by `id`, with reveal gating handled in application code after fetching.
- `unlockCapsule`: fetch the hash by `id` and compare via bcrypt before returning the message payload.
- Rely on Turso's MVCC to handle concurrent writes; no need for homegrown file locking.

### 4.3 Local Development

- Default to an on-disk SQLite file using the libSQL driver (`file:server/data/capsules.db`) when `TURSO_DATABASE_URL` is unset.
- Provide a seed script to load sample capsules via SQL so developers mimic production behavior.
- Use `.env` to set the Turso URL/token only when remote access is required.

### 4.4 Media Storage (Backblaze B2)

- Store binary assets (images, audio, video) in a private Backblaze B2 bucket while Turso retains only metadata and permissions. Bucket prefixes such as `capsules/images/{ownerId}` keep objects namespaced per user.
- Enforce high-compression uploads: images are transcoded to WebP/AVIF with quality ~70 and max resolution caps; videos are re-encoded to H.265/AV1 with capped bitrates (e.g., 5 Mbps 1080p) before being marked ready in Turso.
- Reject raw uploads above 2 MB (configurable via `MEDIA_MAX_IMAGE_BYTES`) so uncompressed assets never exhaust bandwidth or storage before the conversion step.
- Leverage worker functions (Lambda, OCI Functions, or a lightweight VM process) to perform compression immediately after upload, updating Turso rows with final object keys, sizes, and checksums.
- Apply B2 lifecycle rules to auto-transition cold data to the lowest-cost class while leaving metadata live in Turso.

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

## 7. Deployment Strategy (Serverless + Turso)

### 7.1 AWS Lambda via Serverless Framework

1. Initialize `serverless.yml` with HTTP events, environment variables for Turso credentials, and least-privilege IAM (no object-storage permissions required).
2. Package Express with `serverless-http`; ensure the Turso client is instantiated lazily so Lambda cold starts stay fast.
3. Provision Backblaze B2 application keys (separate read/write scopes) and store them as encrypted environment variables so the API can mint upload URLs and clean up unused uploads.
4. Store `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MEDIA_BUCKET`, `MEDIA_MAX_IMAGE_RES`, `MEDIA_MAX_VIDEO_BITRATE`, and the B2 credentials in Parameter Store or Secrets Manager; inject them as environment variables.
5. Run migrations (SQL files or drizzle-kit) as part of deployment before the new Lambda version goes live.

### 7.2 Alternative Hosts (Render/Fly/Containers)

- Long-running hosts can reuse the same Express app; just set the Turso credentials as environment variables and allow outbound HTTPS to Turso.
- Keep a health check that pings `/health` and optionally runs a lightweight Turso query to confirm connectivity.

### 7.3 CI/CD

- GitHub Actions workflow should lint, run tests, execute migrations against the Turso staging database, and then deploy via `serverless deploy` or container pushes.
- Store Turso admin tokens as repo secrets and scope them to staging/prod DBs separately.

## 8. Testing & Observability

1. **Unit Tests**: Cover validation, storage service Turso queries (mocked via an in-memory libSQL client), and passphrase guard logic using `vitest` or `jest`.
2. **Integration Tests**: Use `supertest` to hit the Express router with in-memory storage.
3. **Smoke Test Script**: CLI that creates a temp capsule, fetches listings, unlocks it, and cleans up.
4. **Monitoring**: Enable CloudWatch logs for Lambda; configure alarms on error rates, Turso connection failures, or slow SQL queries.
5. **Tracing**: Optional X-Ray instrumentation to watch outbound Turso calls and measure query latency.

## 9. Future Enhancements

- Email reminders when a capsule becomes available (Resend, SES, or any transactional email provider).
- User accounts powered by OAuth so capsules can be tied to `owner_id` and only visible to the authenticated creator unless explicitly shared.
- Full-text search using Turso full-text virtual tables or an external search service (Typesense, OpenSearch).
- Export/import capsules as encrypted bundles for offline archiving.

This plan provides the necessary runway to implement and deploy a secure, serverless time capsule service with Turso-backed storage and per-capsule passphrase protection.

## 10. Feature Roadmap

### 10.1 Milestone Steps

#### Phase 1 – Text Capsules (MVP) (Done)

- Deliver the core text-only flow already described in sections 3–6.
- Ensure the Turso schema anticipates future media metadata (e.g., optional `attachments` table or JSON column) to avoid disruptive migrations.

#### Phase 2 – Image Attachments

- Extend the API with a pre-signed upload endpoint (`POST /api/uploads/images`) returning Backblaze B2 upload URLs scoped to `capsules/images/{ownerId}` prefixes, and a companion endpoint (`POST /api/uploads/images/compress`) that accepts a raw upload, converts it to WebP via `sharp`, enforces `MEDIA_MAX_IMAGE_RES`, and then stores the compressed result in B2.
- Store attachment metadata (object key, mime type, size, compression level) in Turso, keyed by capsule ID; render via signed GET URLs when revealed.
- Add a compression job (Lambda or AWS Step Functions) that converts uploads to WebP/AVIF, downscales oversized images, and updates Turso once complete.
- Add client-side previews and upload size validation (soft limit ~10 MB per raw image to keep Lambda memory low).

#### Phase 3 – Video Capsules

- Reuse the pre-signed upload flow but enforce chunked uploads to B2 and stricter size caps (e.g., 100 MB) with a transcoding job (AWS MediaConvert, Mux, or B2-compatible worker) for future quality control.
- Apply high-compression presets (e.g., H.265 1080p @ 4 Mbps + adaptive bitrate ladder) during transcoding; update Turso metadata with rendition keys and bitrates.
- Store transcoding status/state machine fields in Turso so reveal logic only returns signed URLs once the compressed outputs exist.

#### Phase 4 – Template Library & Submissions

- Define a `templates` table in Turso describing structured prompts (fields, validation rules).
- The UI allows choosing a template to pre-fill the capsule form; creators can submit new templates for moderation via `/api/templates`.
- Implement a simple moderation queue (admin override key + status field) before templates go live.

#### Phase 5 – Mini Games + High Scores

- Treat mini games as capsule-linked experiences: each game stores score snapshots inside the capsule record under `gameStates`.
- Build lightweight Canvas or JS games (e.g., quiz, memory) hosted under `/public/games` with the ability to save scores via `/api/capsules/:id/game-state`.
- On reveal, display historical scores/leaderboards to revisit.

#### Phase 6 – OAuth Login & Private Capsules (Done)

- Integrate OAuth (Auth0, Cognito, Supabase, or custom OpenID Connect) to issue JWTs containing a stable `sub` claim stored as `owner_id` in Turso.
- Expand capsule routes to require authentication for creation/listing when `owner_id` is enabled, ensuring each account only sees its own future-dated capsules while still allowing public capsules with `owner_id = NULL`.
- Provide migration to backfill existing capsules with optional owners or keep them public; update the client to store tokens securely and include them in API requests.
- Add admin tooling to reassign or anonymize capsules if a user deletes their account.

### 10.2 Experience Enhancers

- **Calendar Invites with Unlock Timers**: After capsule creation, generate an `.ics` invite containing the reveal timestamp and a deep link to `/capsules/{id}`. Embed instructions to open the link when the timer expires, mitigating email deliverability issues. Consider optional SMS/web push reminders later.
- **OAuth for Trusted Users**: Layer optional OAuth (Auth0, Cognito, or Supabase) ahead of capsule creation once multi-device identity is needed. Start with social providers (Google/Microsoft) to avoid password storage, map authenticated users to `ownerId`, and relax passphrase requirements for signed-in sessions.
