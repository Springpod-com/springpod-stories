# Acceptance report: Work Experience Stories

Checked against PRD section 20 at the end of milestone 8, 15 October 2026. Decisions behind each result are in `docs/build-plan.md` (milestone log); copy still needed is in `docs/copy-gaps.md`.

## Summary

| # | Criterion | Result |
|---|---|---|
| 1 | Every screen matches the prototype at 390px, using design system components | Pass, with the differences listed below |
| 2 | One question config drives the flow | Pass |
| 3 | Under 14 can't submit; 14 to 17 can't be approved until a parent approves | Pass |
| 4 | Nothing pre-ticked | Pass |
| 5 | Browser media checks match PRD 7.1 | Pass |
| 6 | 200 MB portrait video on throttled 4G survives a dropped connection and resumes | Pass in an emulated test; real phone test still to do |
| 7 | Server checks, transcript and converted media in the admin within 2 minutes of upload | Pass (119 seconds, worst case), with the fake transcriber |
| 8 | Approve disabled while parent consent is pending, safeguarding is open or a check is unticked | Pass |
| 9 | Interviewer never asks for surname, school or contact details over 30 red team runs; signposts on harm | Not run: needs an API key (Q22) |
| 10 | Content pack only has assets for the agreed channels | Pass |
| 11 | Quote card never clips at 18px with a 160-character quote | Pass |
| 12 | Emails, remove links and withdrawal end to end; retention deletes withdrawn media | Pass, with the console email adapter |
| 13 | No em dashes; build passes; design system drift audit passes | Pass |
| 14 | Lighthouse mobile: Performance 85+, Accessibility 95+ | Pass |

Checks run for this report: `pnpm lint` clean (ESLint, TypeScript, em dash check); `pnpm test` 162 tests pass (unit and integration); `pnpm test:e2e` 89 Playwright tests pass at 360, 390 and 1440 pixels; `pnpm test:upload` passes (opt-in, about 6 minutes); `pnpm lighthouse` passes; `pnpm build` passes; `npx springpod-audit src --json` reports no drift.

## Detail

### 1. Screens match the prototype

Every screen in `design/screens/` exists. `tests/e2e/a11y.spec.ts` walks all of them (01 to 27, the stop screen, the email link pages, the admin queue and story) at 360, 390 and 1440 pixels, checking each with axe and for sideways scrolling; with `SCREENSHOT_DIR` set it saves a screenshot of each, which were compared with `design/screens/` for this report. Structure, copy and order match. Known differences, each decided earlier:

- No rocket anywhere: not on the quote card or as the interviewer's picture (M1.19, your decision). The Springpod logo is unchanged.
- The capture screen (15) has a full-width "Film now" button and the design system's upload area, where the prototype shows two tiles side by side (one primary button per screen, `CLAUDE.md`).
- Copy the prototype doesn't have is shown as marked placeholders (`docs/copy-gaps.md`).

### 2. One question config

`src/flow/questions.ts` is the only place the flow is defined. `src/flow/engine.test.ts`: "changes the flow when a `when` condition changes, with no other code change (acceptance criterion 2)".

### 3. Age rules

- Under 14: the stop screen, and nothing is saved (`tests/e2e/flow.spec.ts`: "nothing is saved for under 14s", "under 14s see the stop screen and can change their age"; the server refuses too).
- 14 to 17: the parent or carer link flow end to end (`flow.spec.ts`: "14 to 17 year olds give a parent or carer email, who then approves the story"); Approve refused until the parent decides (`src/lib/server/review.int.test.ts`, `tests/e2e/admin.spec.ts`).

### 4. Nothing pre-ticked

`flow.spec.ts`: "nothing is pre-ticked on the sharing and confirm screens (acceptance criterion 4)".

### 5. Browser media checks

`src/lib/media/checks.test.ts`: one test per PRD 7.1 row, including an undecodable file giving a tip, not a fail (15 tests). A 200 MB file is too big to decode its sound in the browser, so sound becomes a tip and the server checks it (M8.9).

### 6. 200 MB upload on throttled 4G

`tests/e2e/large-upload.spec.ts`, run with `bash scripts/make-large-video.sh && pnpm test:upload`. A 90 second 1080 × 1920 video of 203 MB, uploaded in 20 parts over an emulated 4G connection (20 Mbps down, 8 Mbps up, 70 ms). The connection is cut for 20 seconds a third of the way through. The upload waits, carries on when it comes back, and the parts stored before the cut are not sent again (in the last run, 3 parts in flight at the cut were sent again).

Still to do: the same on real phones over mobile data (`docs/device-tests.md`, Q32).

### 7. Results in the admin within 2 minutes

Same test: the server checks, the transcript and the converted video were all in the admin 119 seconds after the upload finished; the person had their transcript after 20 seconds. The test video is the hardest kind to convert (pure noise at 1080 × 1920) and ran on 4 cores shared with the browser. To get there the worker now saves the checks and starts the transcript before converting, and converts in a separate job alongside (M8.6). Notes:

- Transcription used the fake adapter. Once a provider is chosen (PRD 21), re-run `pnpm test:upload` with it; the transcript runs alongside conversion, so it only adds time if it takes longer than about 80 seconds.
- The worker needs at least 4 vCPUs (M8.7).

### 8. Approve gating

`tests/e2e/admin.spec.ts`: "approve stays disabled until every video check is ticked (acceptance criterion 8)" and "approve stays disabled while parent consent is pending"; the safeguarding hold in `review.int.test.ts`.

### 9. Interviewer red team

Not run. `pnpm test:ai` runs the 30 red team scenarios against the real model and checks for questions about surname, school or contact details and for signposting on the harm scenario. It needs `ANTHROPIC_API_KEY` (Q22). Without a key, the interview uses its fixed fallback questions, which are covered by `src/lib/server/interview.int.test.ts`.

### 10. Content pack channels

`src/lib/server/content-pack.int.test.ts`: "only makes and shows assets for the channels the person agreed to (acceptance criterion 10)"; `tests/e2e/content.spec.ts` shows only the snippet and tags for a story shared on Springpod only.

### 11. Quote card at 18px

`tests/e2e/draft.spec.ts`: "a 160-character quote sets at 18px and never clips (acceptance criterion 11)" at 360, 390 and 1440 pixels; `content.spec.ts` checks both exported images (1080 × 1350 and 1080 × 1920) with the same quote.

### 12. Emails, remove links, withdrawal and retention

`content-pack.int.test.ts`: every email to the person has a working remove link; publishing emails the link and the quote card, and the card link stops working once removed; withdrawn media is deleted by the retention sweep after 30 days. `content.spec.ts` runs publishing and removal through the browser. Emails go to the console adapter until the provider is chosen (PRD 21).

### 13. Copy and build

`pnpm lint` includes the em dash check (U+2014) over the code, prompts and docs; `pnpm build` passes with no type or lint errors; `npx springpod-audit src --json` reports 0 findings. All run in CI.

### 14. Lighthouse mobile

`pnpm lighthouse` against a production build, with Lighthouse 13.5's mobile settings (emulated phone, simulated slow 4G, slowed CPU), median of 3 runs:

| Page | Performance | Accessibility | Best practices |
|---|---|---|---|
| Start screen | 88 | 100 | 96 |
| A link that doesn't work | 97 | 98 | 100 |
| Staff sign-in | 96 | 100 | 100 |

Question screens can't be opened directly by URL (a reload goes back to the start), so Lighthouse can't reach them; they are covered by the axe checks in criterion 1. Start screen images are AVIF or WebP and under 30 KB each (`tests/e2e/images.spec.ts`).

## Accessibility (PRD 17)

- axe (WCAG 2.2 AA) passes on every screen at 360, 390 and 1440 pixels, except one design system colour pair (below).
- Tap targets are at least 44px on touch screens; with a mouse, at least 24px, links in a sentence excepted, as WCAG allows.
- Answer groups follow the keyboard model (`flow.spec.ts`), and focus moves to each new question's heading.
- Live regions announce the chat, checks and errors.
- With reduced motion, the reel doesn't move on by itself and there is no celebration animation (`a11y.spec.ts`).

Design system issues to raise with that team (M8.4):

- The warning colours (`warning-foreground` on `warning`) measure 4.49:1, just under 4.5:1. They appear on the "In review" badge in the admin, the development sign-in notice and the "Good to go" tip banner.
- `FileUpload` puts its hidden file input inside the dropzone as a second, unlabelled control. It is made inert here, and the dropzone still opens the file picker.
- `AlertTitle` renders an `h5`, which skips heading levels.

## Needs a person before launch

- Real phone tests: `docs/device-tests.md` (Q32).
- The red team run with an API key (criterion 9, Q22).
- `pnpm test:upload` again with the chosen transcription provider (criterion 7).
- Cookie consent for GA4 (Q31).
- Open questions in `docs/build-plan.md`: Q20 to Q24 and Q26 to Q32.

## PRD section 21 open decisions

Not resolved in the build. Each has a placeholder:

| Open decision | Placeholder in the build |
|---|---|
| Hosting and stack fit | Two containers (app, worker), Postgres and an S3-compatible bucket; nothing provider-specific. Proposal with the CTO: AWS London |
| Transcription provider | `Transcriber` interface; a fake adapter in development and tests, and an AWS Transcribe adapter ready if AWS is chosen |
| Email provider | `EmailProvider` interface; the console adapter logs each email |
| Springpod account matching API | No match until the API exists; moderators verify by hand in the admin |
| Industry list (11 options) | The prototype's list in `src/flow/options.ts`, marked as a placeholder |
| Retention periods and DPIA | Placeholder periods in `src/lib/retention.ts` (30 days for rejected, withdrawn and abandoned; 12-month review not automated) |
| Designated safeguarding lead | `SAFEGUARDING_LEAD_EMAIL`; without it the admin shows a warning and flags still hold the story (Q27) |
| Partner approval for named employers | The named organisation is flagged for the team; approval is manual |
| In-browser recording with teleprompter (phase 2) | Not built |
| Face, logo and screen detection (phase 2) | Not built |
| Voice answers in the interview | Not built; text only |
| Real stories on the start screen | Prototype examples kept, tagged "Example stories" |
| Stock photo licence | Credits in `design/assets/CREDITS.md` |
