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
pnpm worker       # background jobs: media checks and transcripts, story pre-screen (needs ffmpeg)
pnpm staff:add you@springpod.com moderator "Your Name"   # let someone into /admin
pnpm lint         # ESLint, TypeScript and the em dash check
pnpm test         # unit, database and storage tests (Vitest; needs TEST_DATABASE_URL, S3_ENDPOINT and ffmpeg)
pnpm test:e2e     # flow tests (Playwright; starts the app and the worker)
pnpm audit:ds     # design system drift audit
```

Build progress, decisions and open questions are in `docs/build-plan.md`.

## Build pack

| Path | What it is |
|---|---|
| `CLAUDE.md` | Standing rules for Claude Code |
| `KICKOFF_PROMPT.md` | First message for Claude Code |
| `docs/PRD.md` | Product requirements |
| `docs/ai-prompts.md` | All AI prompts |
| `design/` | Working prototype, screenshots of every screen, logos and image credits |

Owner: Ollie Fisher. Version 1.0, 14 October 2026.
