# CLAUDE.md: Springpod Work Experience Stories

Standing rules for this repo.

## Sources of truth

1. `docs/PRD.md` for what to build.
2. `design/prototype/springpod-work-experience-stories.html` and `design/screens/` for screens, order and copy.
3. `docs/ai-prompts.md` for every AI prompt.
4. `@springpod/design-system` for every UI component and token.

If they disagree, the PRD wins, then the prototype. Note any conflict in `docs/build-plan.md`.

## How to work

- Work milestone by milestone (PRD section 19). At the end of each, run tests, lint and the design system drift audit, show what changed and wait for approval.
- Don't start a milestone without approval. Don't resolve the open decisions in PRD section 21; leave a visible placeholder and list it.
- Keep a running `docs/build-plan.md` with decisions and questions.

## UI

- Search the design system before writing any UI. Building a component the package already ships is a defect.
- Never hard-code colours, spacing, radii, font sizes or shadows. Use tokens.
- Mobile first. Design at 390px, check 360px and 1440px.
- One question per screen. One primary button per screen, full width only for the primary.
- Respect `prefers-reduced-motion`.

## Copy

- British English: organise, colour, programme, centre.
- No em dashes anywhere (UI, prompts, emails, code comments that render). The lint fails on U+2014.
- Use the prototype copy as written. Don't write new marketing copy; list gaps in `docs/copy-gaps.md`.
- No rewards (rockets, points, badges) anywhere in this product.

## Safety and privacy

- All AI calls are server-side. Never expose keys.
- Never collect surnames, schools or addresses. Never show submitter or parent emails in the content queue or exports.
- No pre-ticked consent. Under-18 stories cannot be approved without parent approval. Nothing publishes automatically.
- Media is private by default and served through signed URLs.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`
- `npx springpod-audit src --json` before each milestone sign-off
