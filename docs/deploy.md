# Deploying Work Experience Stories

How to run the product anywhere that runs containers. Nothing here is tied to one provider: the hosting decision is still with the CTO (PRD 21; the proposal is AWS London, sketched at the end).

## Before launch: blockers

These need a decision or a person before real people use the product:

| Blocker | Why | Where |
|---|---|---|
| **Email provider** | Only the console provider exists. It prints every email, links included, to the logs and sends nothing, so confirmations, parent requests and remove links never arrive | PRD 21; `src/lib/server/email/index.ts` takes a new provider behind `EmailProvider` |
| **Transcription provider** | `TRANSCRIBE_PROVIDER` must be `aws` (Amazon Transcribe) or a new adapter; the sample transcriber is refused in production | PRD 21; `src/lib/server/transcribe/` |
| **Google sign-in for staff** | Staff can only sign in with Google in production (Q26) | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| **Safeguarding lead** | Flags still hold stories without it, but nobody is emailed (Q27) | `SAFEGUARDING_LEAD_EMAIL` |
| **Retention periods** | The DPO confirms or changes the placeholders | `src/lib/retention.ts` |
| **Cookie consent** | Before setting `NEXT_PUBLIC_GA4_ID` (Q31) | |
| **Real phone tests and the red team run** | `docs/device-tests.md`; `pnpm test:ai` with an API key (Q22, Q32) | |

## What runs

| Part | Image | How many | Size it at | Notes |
|---|---|---|---|---|
| Web | `docker build --target app` | 2 or more, behind a load balancer | 1 vCPU, 1 GB | Public flow, admin and API. Health check: `GET /api/health` (200 when it can reach the database) |
| Worker | `docker build --target worker` | 1 (2 for resilience) | **4 vCPU, 8 GB**, at least 10 GB of temporary disk | Media checks and conversion (ffmpeg), transcripts, pre-screen, quote card images (Chromium), the nightly retention sweep. Needs 4 vCPUs to meet the 2-minute target (acceptance criterion 7). No port; it logs one JSON line per job |
| Migrate | `docker build --target migrate` | Once per release | | Applies database migrations, then exits |
| Postgres | Managed, 16 or later | 1 | | In the UK or EU. Also holds the job queue (pg-boss, its own `pgboss` schema) |
| Bucket | Any S3-compatible storage | 1 | | Private. In the UK or EU. Set up as below |

Large uploads go from the browser straight to the bucket, never through the web servers.

## Release steps

1. Build the three images from the same commit (CI builds them on every pull request).
2. Run the migrate image with the production `DATABASE_URL`. Stop if it fails.
3. Roll out the web image, then the worker image.
4. First release only: add the first staff members with the migrate image:
   `node_modules/.bin/tsx --conditions=react-server scripts/add-staff.mts name@springpod.com moderator "Their Name"` (roles: `moderator`, `content`).

Keep migrations additive (new tables and columns, nothing renamed or dropped in the same release) so the previous release keeps working while web and worker roll one at a time. Both migrations so far are.

## Settings

Set as environment variables or secrets. **Secret** means keep it in a secret store, never in the image or the repository.

| Variable | Web | Worker | Example | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | `postgresql://…` | Secret |
| `APP_URL` | ✓ | ✓ | `https://stories.springpod.com` | The public address; used in email links and the cross-site check |
| `AUTH_SECRET` | ✓ | ✓ | 32 random bytes, base64 | Secret. Signs staff sessions; also signs the quote card links unless `RENDER_SECRET` is set |
| `RENDER_SECRET` | ✓ | ✓ | 32 random bytes, base64 | Secret. Optional, recommended so the two can be rotated apart |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | ✓ | | | Secret. Google Workspace OAuth client, redirect `https://<APP_URL host>/api/auth/callback/google` |
| `STAFF_EMAIL_DOMAIN` | ✓ | | `springpod.com` | Only this domain can sign in, and only people on the staff list |
| `S3_BUCKET`, `S3_REGION` | ✓ | ✓ | `wes-media`, `eu-west-2` | |
| `S3_ENDPOINT` | ✓ | ✓ | | Only for non-AWS storage |
| `S3_PUBLIC_ENDPOINT` | ✓ | | | Only if browsers reach storage at a different address from the servers |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | ✓ | ✓ | | Secret. Better: a role on the service |
| `TRANSCRIBE_PROVIDER`, `TRANSCRIBE_REGION` | | ✓ | `aws`, `eu-west-2` | |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | | Secret. Interview, draft and content pack (web); pre-screen (worker). Without it, each falls back as described in the build plan |
| `AI_MODEL_FAST`, `AI_MODEL_BALANCED` | ✓ | ✓ | | Optional overrides of the models in `src/lib/ai/client.ts` |
| `EMAIL_PROVIDER` | ✓ | ✓ | | See blockers |
| `SAFEGUARDING_LEAD_EMAIL` | ✓ | ✓ | | See blockers |
| `RENDER_BASE_URL` | | ✓ | `http://web.internal:3000` | How the worker reaches the web servers for quote card images. Over plain HTTP, don't use a host ending in `.app` or `.dev` (or one named `app`): Chromium forces HTTPS for those |
| `WORKER_CONCURRENCY` | | ✓ | `2` | Jobs at a time per queue |
| `NEXT_PUBLIC_GA4_ID` | build | | | Baked in when the web image is built: `docker build --build-arg NEXT_PUBLIC_GA4_ID=G-…`. See blockers |
| `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | ✓ | ✓ | | Secret (the API secret). Server-side events |

Never set in production: `ADMIN_DEV_LOGIN` (development sign-in; it also refuses anything but localhost), `EMAIL_OUTBOX_DIR`, `JOBS_MODE`, `SUBMIT_RATE_LIMIT` or `MEDIA_RATE_LIMIT` overrides (tests only).

## The bucket

- **Private**: block all public access. Media is only ever read through short-lived signed links.
- **CORS**, for uploads straight from the browser:

  ```json
  [{ "AllowedOrigins": ["https://stories.springpod.com"], "AllowedMethods": ["PUT", "GET", "HEAD"],
     "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
  ```

  `ExposeHeaders: ETag` matters: without it uploads can't finish.
- **Lifecycle**: abort incomplete multipart uploads after 1 day.
- **Versioning off**, or set to delete old versions within days: the retention sweep's deletions have to be real (PRD 9.3).
- Encryption at rest on.

## Security

- Every page sends `Referrer-Policy: strict-origin-when-cross-origin` (links carry single-use tokens), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a restrictive `Permissions-Policy` and HSTS (`next.config.ts`). A content security policy is still to do.
- Writes check that the request comes from this site (`Origin` against the requested host and `APP_URL`).
- Terminate TLS at the load balancer and forward `Host` (or `X-Forwarded-Host`).
- Back up Postgres with point-in-time recovery. We suggest not backing up media separately: people can be asked to record again, and fewer copies make deletion simpler.

## Rehearse locally

The same images, wired together with Compose:

```bash
docker compose --profile stack up --build -d   # Postgres, S3 stand-in, migrate, web, worker
pnpm demo:seed:stack                           # demo stories in every state, run inside the stack
open http://localhost:3000                     # admin: /admin, development sign-in as demo.moderator@springpod.com
```

`demo:seed:stack` runs the demo script inside Docker, next to the stack's database. Running `pnpm demo:seed` from the Mac instead reaches whatever answers on `localhost:5432`, which is a different database if Postgres is already installed there (the error is `role "wes" does not exist`).

Emails sent by the website and worker appear in `docker compose logs web worker`; the demo script's own emails don't.

To run the Playwright tests against the stack: add `-f tests/stack/compose.yml` to the `up` command (it writes emails to the test outbox), then `pnpm test:stack`.

## Proposal: AWS London (pending the CTO)

One way to map the above, if AWS is confirmed:

| Part | Service |
|---|---|
| Web and worker | ECS on Fargate in `eu-west-2`, web behind an Application Load Balancer; worker 4 vCPU and 8 GB with 20 GB ephemeral storage |
| Migrate | An ECS task run by the deploy pipeline before the services update |
| Postgres | RDS for PostgreSQL 16, Multi-AZ, point-in-time recovery |
| Bucket | S3 in `eu-west-2`, set up as above; access by task role |
| Transcription | Amazon Transcribe in `eu-west-2` (`TRANSCRIBE_PROVIDER=aws`) |
| Secrets | Secrets Manager, injected into the tasks |
| Images | ECR, built by CI from `main` |
| Email | Springpod's existing transactional provider (PRD 21) |
