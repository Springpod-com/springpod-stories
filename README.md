# Work Experience Stories

Springpod Work Experience Stories: a mobile-first web app where students and the public share a work experience story (AI interview, voice note, video or written), plus a team backend to review, check and turn stories into content.

This repo starts as the build pack: everything Claude Code needs to build the product. To begin, open Claude Code in the repo and paste `KICKOFF_PROMPT.md` as the first message.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # ESLint, TypeScript and the em dash check
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # flow tests (Playwright)
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
