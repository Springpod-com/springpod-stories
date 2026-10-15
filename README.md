# Work Experience Stories

Springpod Work Experience Stories: a mobile-first web app where students and the public share a work experience story (AI interview, voice note, video or written), plus a team backend to review, check and turn stories into content.

This repo starts as the build pack: everything Claude Code needs to build the product. To begin, open Claude Code in the repo and paste `KICKOFF_PROMPT.md` as the first message.

## Develop

```bash
cp .env.example .env
docker compose up -d   # local Postgres and S3 stand-in (or point DATABASE_URL and S3_* at your own)
pnpm install
pnpm db:migrate        # create the tables
pnpm storage:dev       # create the local media bucket
pnpm dev          # http://localhost:3000
pnpm worker       # background jobs: media, pre-screen, quote card images, nightly retention (needs ffmpeg and Chromium)
pnpm staff:add you@springpod.com moderator "Your Name"   # let someone into /admin
pnpm lint         # ESLint, TypeScript and the em dash check
pnpm test         # unit, database and storage tests (Vitest; needs TEST_DATABASE_URL, S3_ENDPOINT and ffmpeg)
pnpm test:e2e     # flow, accessibility and layout tests (Playwright; starts the app and the worker)
bash scripts/make-large-video.sh && pnpm test:upload   # 200 MB upload over throttled 4G (about 6 minutes)
pnpm lighthouse http://localhost:3000   # Lighthouse mobile scores, against `pnpm build && pnpm start`
pnpm audit:ds     # design system drift audit
pnpm demo:seed    # demo stories in every state, for reviewers (local or staging only)
```

## Containers

`Dockerfile` builds the web app, the worker and the migration step; `docker compose --profile stack up --build -d` runs them all together locally, and `pnpm demo:seed:stack` adds the demo stories. Deploying, settings and launch blockers: `docs/deploy.md`.

Build progress, decisions and open questions are in `docs/build-plan.md`. The acceptance report is `docs/acceptance.md`, and the real phone tests still to run are in `docs/device-tests.md`.

## Build pack

| Path | What it is |
|---|---|
| `CLAUDE.md` | Standing rules for Claude Code |
| `KICKOFF_PROMPT.md` | First message for Claude Code |
| `docs/PRD.md` | Product requirements |
| `docs/ai-prompts.md` | All AI prompts |
| `design/` | Working prototype, screenshots of every screen, logos and image credits |

Owner: Ollie Fisher. Version 1.0, 14 October 2026.
