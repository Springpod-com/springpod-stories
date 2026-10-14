# Build plan: Work Experience Stories

Milestone 0 output. Running document: decisions, conflicts and open questions are added here as the build goes on.

| | |
|---|---|
| Status | Milestones 0 to 2 approved. Milestone 3 (write and interview) built, for review. Infrastructure choices (hosting, transcription, storage) are with the CTO. Log in section 19 |
| Sources read | `CLAUDE.md`, `docs/PRD.md`, `docs/ai-prompts.md`, `design/README.md`, the prototype (all screens, flow engine, checks, interview, draft, admin) and every PNG in `design/screens/` |
| Design system | `@springpod/design-system@0.2.0` (public on npm). Ships `springpod-audit` and `springpod-init` as package bins, so `npx springpod-audit src --json` works once installed |

Contents:

1. Conflicts between sources (and what the build does)
2. Stack and key technical choices
3. File structure
4. Flow engine and question config
5. Screens and design system components
6. Local compositions (no package component exists)
7. Data model and Prisma schema
8. Statuses and gates
9. API routes
10. Media pipeline and background jobs
11. AI integration
12. Auth, tokens and privacy
13. Emails
14. Tracking
15. Testing and checks
16. Milestone breakdown
17. Placeholders for PRD section 21 open decisions
18. New questions for review
19. Milestone log

---

## 1. Conflicts between sources

The rule from `CLAUDE.md`: the PRD wins, then the prototype. Where the prototype and `docs/ai-prompts.md` differ, I treat `ai-prompts.md` as the build source for prompts (the PRD points to it).

| # | Where | Prototype | Build follows | Why |
|---|---|---|---|---|
| C1 | Trust label wording (admin) | "Verified Springpod experience" | "Verified by Springpod" | PRD 18: trust labels exactly "Verified by Springpod" and "Community story" |
| C2 | Trust label logic | Verified if the person picks "Springpod student" | Stored label is "Verified by Springpod" only after a confirmed email matches a completed programme (or a moderator verifies by hand) | PRD 10.2, 10.3. The preview in the public flow is a separate question, see Q1 |
| C3 | Product name inside prompts | "Springpod Stories" | "Springpod Work Experience Stories" | `ai-prompts.md` sections 1 and 2 |
| C4 | Interviewer safeguarding marker | Ends the interview with no marker | Ends with `[[SAFEGUARDING]]`, server strips it and sets `safeguarding_review` | `ai-prompts.md` section 1, PRD 6.1 |
| C5 | Video file types | Accepts `.avi` | mp4, mov, m4v, webm, 3gp (plus any `video/*` MIME) | PRD 7.1 |
| C6 | Voice note volume check order | Checks "RMS under -40 dBFS warns" before "peak under 0.05 fails", so a near-silent file gets a warning, not a fail | Peak under 0.05 fails first, then RMS warns | PRD 7.1 lists the fail. Unit test covers it |
| C7 | Admin header label | "Springpod Stories admin" (small label above "Story queue") | "Work Experience Stories admin" | PRD 18: product name is "Work Experience Stories". The header already says this in the prototype |
| C8 | Admin flags | Regex heuristics in the browser | AI pre-screen (`ai-prompts.md` section 4) on the server, plus the same cheap regex pass for phone numbers, emails and handles as a deterministic backstop | PRD 9.4. The regex pass adds safety at no cost; flags carry `source: system` |
| C9 | Desktop "Your story so far" rail | Code exists but is hidden with `display:none !important` | Not built | Not in the PRD or screenshots |
| C10 | Rockets and award functions | Present but stubbed out | Not built | `CLAUDE.md`: no rewards |
| C11 | `FORMATS` constant ("Write it myself") | Unused; the question config says "Write it" | Use the question config copy | The config is what renders |
| C12 | Unsplash portraits, invented names | Hard-coded examples | Keep, with the "Example stories" tag, until replaced (open decision) | PRD 5.2, 21 |

Nothing else conflicts. Copy is taken from the prototype question config as written.

---

## 2. Stack and key technical choices

PRD section 4 is the starting point. Hosting fit is an open decision (PRD 21), so this plan keeps the app portable: a standard Next.js server plus a separate worker process, both in containers.

| Area | Choice | Notes |
|---|---|---|
| App | Next.js (App Router), TypeScript strict, React 19 | Versions pinned to current stable at milestone 1 |
| UI | `@springpod/design-system` components, tokens, icons and fonts; Tailwind v4; `next-themes` for light and dark (already a package dependency) | `springpod-init` run once to wire the stylesheet. No `@font-face` or font links: fonts ship with the package |
| Forms | Package `ui/field` and `ui/form` (react-hook-form, a package dependency) where a screen has a real form; plain controlled state in the flow engine | |
| Database | Postgres with Prisma | UK or EU region |
| Jobs | `pg-boss` (job queue on the same Postgres) | Fewer moving parts than Redis plus BullMQ. Retries, backoff, cron and priorities built in. PRD allows either |
| Worker | Node process in its own container with `ffmpeg`, `ffprobe` and headless Chromium | Media processing, transcription calls, AI pre-screen, quote card PNGs, emails, retention sweep |
| Storage | S3-compatible private bucket, UK or EU region, server-side encryption, CORS for direct browser uploads | Short-lived presigned URLs for every read and write |
| Uploads | S3 multipart upload driven by Uppy core and `@uppy/aws-s3` (headless, no Uppy UI) | Resumes after dropped connections and page reloads. Parts signed by our API. UI is ours, from package components |
| AI | Anthropic Claude API via `@anthropic-ai/sdk`, server only | Model IDs come from env vars (fast model for interview turns, balanced model for draft, content pack and pre-screen), so they can change without code edits |
| Schema validation | `zod` for AI JSON output, API input and env vars | |
| Auth (staff) | Auth.js with Google Workspace, restricted to the Springpod domain, plus a `StaffUser` table for roles | JWT sessions, so no Auth.js tables |
| Auth (submitters, parents) | Our own single-use signed tokens (hashed in the database) and an HTTP-only session cookie | Simpler than running a second Auth.js realm. Covers confirm, edit after changes requested, parent decision and remove |
| Quote card PNG | Worker loads a private render route (`/render/quote-card/[storyId]`) in headless Chromium and screenshots it at 1080x1350 and 1080x1920 | Meets "rendered server-side from the same component". Satori was considered but cannot run the package's Tailwind components as-is |
| Email | Adapter interface. `console` adapter in development; provider adapter added once chosen (open decision) | Templates in React Email, plain text alternative |
| Transcription | Adapter interface with a `fake` adapter for development and tests (returns sample text with timestamps) | Provider is an open decision |
| Tests | Vitest (logic, flow config, checks, prompts, gates), Playwright (flows, admin gating, mobile viewport) | |
| Package manager | pnpm | |

---

## 3. File structure

```
.
├── CLAUDE.md, README.md, KICKOFF_PROMPT.md
├── docs/
│   ├── PRD.md, ai-prompts.md
│   ├── build-plan.md          (this file)
│   └── copy-gaps.md           (copy the prototype does not cover)
├── design/                    (prototype, screens, assets: reference only)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                (the three example stories from the prototype admin, staff users for local dev)
├── public/
│   └── examples/              (six portraits as AVIF and WebP, under 30 KB each)
├── scripts/
│   └── check-em-dash.mjs      (fails on U+2014 in src/ and the prompts module)
├── src/
│   ├── app/
│   │   ├── layout.tsx                     (theme provider, package stylesheet)
│   │   ├── (public)/
│   │   │   ├── layout.tsx                 (header: logo + "Work Experience Stories")
│   │   │   ├── page.tsx                   (the story flow: start screen through done)
│   │   │   ├── confirm/[token]/page.tsx   (email confirmation landing)
│   │   │   ├── parent/[token]/page.tsx    (parent or carer decision)
│   │   │   ├── remove/[token]/page.tsx    (remove my story)
│   │   │   └── edit/[token]/page.tsx      (changes requested: edit and resubmit)
│   │   ├── admin/
│   │   │   ├── layout.tsx                 (staff session guard, admin header)
│   │   │   ├── page.tsx                   (queue and detail)
│   │   │   ├── stories/[id]/page.tsx      (detail on its own URL, deep links from emails)
│   │   │   └── sign-in/page.tsx
│   │   ├── render/quote-card/[id]/page.tsx (worker-only render route, signed request)
│   │   └── api/
│   │       ├── draft/route.ts             (create and autosave the draft story)
│   │       ├── interview/turn/route.ts    (streamed interviewer reply)
│   │       ├── story/generate/route.ts    (draft, regenerate)
│   │       ├── story/submit/route.ts
│   │       ├── uploads/[...]/route.ts     (create, sign part, complete, abort)
│   │       ├── media/[id]/status/route.ts (server checks and transcript progress)
│   │       ├── tokens/[token]/route.ts    (confirm, parent decision, remove)
│   │       ├── auth/[...nextauth]/route.ts
│   │       └── admin/...                  (status changes, checklist ticks, flags, content pack, downloads)
│   ├── flow/
│   │   ├── questions.ts                   (the typed question config: ids, kinds, chapters, copy, when, validation)
│   │   ├── options.ts                     (WHO, AGES, EXP, NOW, INDUSTRIES, CHANNELS)
│   │   ├── engine.ts                      (visible, next, prev, chapter progress: pure functions)
│   │   ├── state.ts                       (reducer, autosave, resume)
│   │   └── engine.test.ts
│   ├── components/
│   │   ├── flow/                          (FlowShell, ChapterProgress, QuestionScreen, ChoiceScreen, TextScreen, MultiScreen, StickyActions, StopScreen)
│   │   ├── start/                         (StartBox, ExampleReel, ExampleCard)
│   │   ├── story/                         (InterviewChat, ChatBubble, TypingIndicator, StoryStrength, WriteBox, DraftEditor, QuotePicker)
│   │   ├── media/                         (GuideScreen, PromptCard, CaptureTiles, ChecksScreen, CheckList, TranscriptScreen, UploadStatus)
│   │   ├── quote-card/                    (QuoteCard: one component for flow, done, admin and PNG)
│   │   ├── done/                          (DoneScreen, Celebration)
│   │   └── admin/                         (QueueList, QueueFilters, StoryDetail, FactsList, FlagNotices, MediaReview, TeamChecklist, DecisionActions, ContentPack)
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── prompts.ts                 (every prompt, with PROMPT_VERSION)
│   │   │   ├── client.ts                  (Anthropic SDK, model config, timeouts)
│   │   │   ├── interview.ts, draft.ts, content-pack.ts, prescreen.ts
│   │   │   ├── schemas.ts                 (zod schemas for JSON outputs)
│   │   │   └── fallbacks.ts               (fallback questions, pickQuotes, fallbackDraft)
│   │   ├── media/
│   │   │   ├── checks.ts                  (pure threshold functions, PRD 7.1)
│   │   │   ├── checks.test.ts             (one test per row, plus undecodable files)
│   │   │   ├── browser-analyse.ts         (metadata, frame brightness, audio analysis in the browser)
│   │   │   └── upload.ts                  (Uppy multipart wiring)
│   │   ├── gates.ts                       (canApprove and friends, shared by UI and API)
│   │   ├── status.ts                      (status transitions)
│   │   ├── tokens.ts, session.ts, staff-auth.ts
│   │   ├── storage.ts                     (S3 client, presigned URLs)
│   │   ├── email/                         (adapter, templates)
│   │   ├── transcription/                 (adapter, fake adapter)
│   │   ├── springpod-match/               (adapter, "none" adapter)
│   │   ├── audit.ts                       (writeAuditEvent)
│   │   ├── track.ts                       (track(event, payload))
│   │   ├── rate-limit.ts
│   │   └── db.ts
│   └── middleware.ts                      (admin guard, security headers)
├── worker/
│   ├── index.ts                           (pg-boss queues and schedules)
│   └── jobs/                              (media-probe, media-normalise, media-transcribe, story-prescreen, springpod-match, quote-card-render, email-send, safeguarding-notify, retention-sweep)
├── tests/
│   └── e2e/                               (Playwright: flow per mode, under 14, minor gating, admin approve gating, content pack channels)
├── Dockerfile.app, Dockerfile.worker
└── .env.example
```

---

## 4. Flow engine and question config

Architecture rule 1 in the PRD: changing the flow is a config change.

- `src/flow/questions.ts` exports an ordered array of typed question definitions. Each has `id`, `kind` (`intro`, `single`, `tiles`, `text`, `multi`, `guide`, `story`, `transcript`, `draft`, `confirm`, `stop`, `done`), `chapter`, `title(state)`, `sub(state)`, `options(state)`, `when(state)`, `validate(value, state)`, `optional`, `preview` (shows the quote card), plus copy for placeholders and errors. All copy is the prototype copy.
- Side effects on answer (for example, picking "Springpod student" sets the experience type to "Springpod virtual programme") are declared in config as `onAnswer(state)`, not in screen code.
- `src/flow/engine.ts` holds pure functions: `visibleQuestions`, `nextId`, `prevId`, `chapterProgress`, `stepNumber`. The unit test required by acceptance criterion 2 changes a `when` in a test copy of the config and asserts the new path.
- Screens are rendered by `kind`. Adding a question of an existing kind needs no new screen code.
- History: each step pushes `?q=<id>` with the History API, so the phone back gesture and the on-screen back arrow behave the same. Deep links to a later step fall back to the first unanswered question.
- Timing: single-choice answers advance after 260 ms; text answers on Continue or the keyboard's Next key. Validation runs on press and shows the message under the answers with `role="alert"`.
- Focus: on each screen change focus moves to the question heading, so screen readers announce it.
- Autosave (rule 5): the first server write happens when a valid age of 14 or over is given (see section 12). After that each answer debounces a `PATCH /api/draft`. The draft is keyed to an HTTP-only device cookie, then also to the email once given. Coming back on the same device resumes at the first unanswered question.

---

## 5. Screens and design system components

Every screen sits in `FlowShell`: header, `ChapterProgress`, then the question, then `StickyActions` pinned to the bottom on phones. On desktop (from 700px, as in the prototype) the question sits in a `ui/card` in a centred 520px column with the button under the answers.

Common pieces:

| Piece | Component |
|---|---|
| Header logo | `ui/springpod-logo` (ink follows `currentColor`, so full colour on light and all white in dark mode). Wrapping link, 150px minimum |
| Back arrow | `ui/button` (ghost, icon size) with `IconShortArrowBack` |
| Chapter progress | Local `ChapterProgress`: four `ui/progress` bars, chapter name under them (see section 6) |
| Question title and sub | Typography tokens only |
| Single choice | `ui/form-select-button` (`FormSelectGroup` single, `FormSelectButton`), responsive size. Gives the arrow, Enter, Space, Home, End keyboard model |
| Text input | `ui/input` in `ui/field` with `FieldError` |
| Validation message | `ui/field` `FieldError` (`role="alert"`) |
| Primary button | `ui/button`, full width on phones. Secondary actions use secondary, outline or ghost and never stretch |
| Text links ("See all tips", "Change how I tell it", "Select all") | `ui/button` ghost or link style, or `ui/text-link` where it navigates |

Screen by screen:

| Screen | Ref | Components |
|---|---|---|
| Start | 01, 40 | Local `StartBox` (navy surface from tokens), local `ExampleReel` and `ExampleCard`. Inside: `ui/tag` "Example stories", `ui/avatar` (portraits), `ui/play-button` (white colourway), `ui/video-timer` (duration), `ui/content-type-tag` (Video, Voice note chips; see Q9 for Written), `ui/progress` (video card progress, decorative). Facts list with `IconTime`, `IconMic`, `IconPadlock`. `ui/button` teal colourway "Start my story" |
| Who | 02 | `FormSelectGroup` single with sub-lines |
| Age | 03 | `FormSelectGroup` single in a 2x2 grid |
| Under 14 stop | (in prototype) | Title, sub, `ui/button` "Change my age" |
| First name | 04 | `ui/input` (`autocomplete="given-name"`) |
| Experience type | 05 | `FormSelectGroup` single |
| Area or job | 06 | `ui/input` |
| Organisation | 07 | `ui/input`; button reads "Skip" when empty, "Continue" when filled |
| What now | 08 | `FormSelectGroup` single |
| Current role, company | 09, 10 | `ui/input` |
| Industry | 11 | `FormSelectGroup` single, compact tile grid |
| Interview or self | 12 | `FormSelectGroup` single with leading icons (`IconChat`, pen icon: see Q8) |
| Voice, video or write | 13 | `FormSelectGroup` single with icons (`IconMic`, `IconVideo`, pen) |
| Video and voice guidance | 14, 25 | Local `GuideTips` list (icons from the package where they exist, Q8), local `PromptCard` (navy), `ui/button` "I'm ready to film" / "I'm ready to record" |
| Capture | 15 | Local `CaptureTiles` (two large tiles wrapping hidden file inputs, `capture` on the first), short tips line, `ui/button` link "See all tips", "Change how I tell it" |
| Checks | 16, 26 | Native `<video>` or `<audio>` preview with controls, `ui/alert` verdict banner (success, warning, destructive), local `CheckList` (`aria-live="polite"`), upload progress row from `ui/file-upload` (`FileUploadItem`), `ui/spinner` while checking. Buttons per PRD 6.5 |
| Transcript | 17 | `ui/textarea`, word count in mono, `ui/alert` while the transcript is still processing (copy gap) |
| Write it | (in prototype) | `ui/textarea`, live word count "150 to 400 works best" |
| Interview | 27 | Local `InterviewChat` with `ChatBubble` and `TypingIndicator` (`aria-live="polite"`), interviewer avatar `ui/avatar` on navy with the package chat glyph (no rocket, decision M1.19), `StoryStrength` (`ui/progress`, Q6), quick replies as `ui/pill`, composer `ui/textarea` plus `ui/button` teal icon button, hint line |
| Draft and quote | 18 | `ui/input` (headline), `ui/textarea` (story, IBM Plex Serif via the serif token), `FormSelectGroup` single for the three quotes, `QuoteCard` live preview, `ui/input` for own quote (`maxLength` 160), skills as `ui/badge` (Q7), `ui/alert` "New version written" with `ui/button` ghost "Go back to previous version", `ui/button` secondary "Try a different version", `ui/skeleton` while writing |
| Name display | 19 | `QuoteCard` preview above `FormSelectGroup` single |
| Show company | 20 | Same as 19 |
| Channels | 21 | `FormSelectGroup` multiple, `ui/button` link "Select all" / "Clear all". Nothing pre-selected |
| Email | 22 | `ui/input` type email |
| Parent email | (in prototype) | `ui/input` type email, must differ from the submitter's |
| Confirm | 23 | `FormSelectGroup` multiple with two options (matches the prototype). Both start unselected (Q10) |
| Done | 24 | `ui/alert` (success, warning for minors, info), skills, `QuoteCard`, `ui/button` "Share another story", local `Celebration` (Q5) |
| Admin queue and detail | 42 | Admin header (`ui/springpod-logo`, `ui/text-link` "View the public form"); counts with `charts/kpi-card`; filters with `ui/filter-bar`, `FilterBarSelect`, `ui/selected-filter`, search with `ui/input-group`; queue rows with `ui/item` in `ui/scroll-area`; status chips `ui/badge`; "Example" marker `ui/tag`; detail in `ui/card`; facts as a definition list styled with tokens; flags as `ui/alert`; skills `ui/badge`; native media player; `CheckList` (automated); team checklist `ui/checkbox` in `ui/field`; Approve (`ui/button` primary, disabled with `ui/tooltip` saying why), Request changes (outline), Reject (destructive colourway); Request changes and Reject open `ui/dialog` with `ui/textarea`; content pack in `ui/card` blocks with Copy buttons and `ui/sonner` toasts; asset history in `ui/accordion`; downloads as `ui/button` links |
| Below `md` in admin | | Queue collapses above the detail; filters move into a `ui/drawer` behind a Filters `ui/pill` (the package's filter-sheet recipe) |
| Confirm, parent, remove, edit pages | not in prototype | Same shell, `ui/card`, `ui/alert`, `FormSelectGroup` (parent: Approve, Approve without name, Decline), `ui/button`. Copy is a gap (see `docs/copy-gaps.md`) |

---

## 6. Local compositions

The package has no component for these. Each stays local, imports every primitive from the package and uses only tokens. Search terms tried are listed so the decision is auditable. Candidates for a design system request are marked.

| Local component | Built from | Searches that found nothing suitable | Request to the design system? |
|---|---|---|---|
| `QuoteCard` | Tokens (navy, teal, serif type), `ui/avatar`, `ui/tag` for the trust label (no rocket mark, decision M1.19) | "quote testimonial card" | Yes, likely reusable on springpod.com |
| `ExampleReel`, `ExampleCard` | `ui/play-button`, `ui/video-timer`, `ui/content-type-tag`, `ui/avatar`, `ui/tag`, `ui/progress` | Checked `ui/carousel`: it is a horizontal swipe rail, not a stacked auto-advancing reel | No |
| `InterviewChat`, `ChatBubble`, `TypingIndicator` | `ui/avatar`, `ui/textarea`, `ui/button`, `ui/pill` | "chat messages conversation with typing indicator" | Yes |
| `CheckList`, `CheckRow` (pass, warning, fail, pending) | `IconCheckCircle`, `IconWarning`, `ui/spinner`, tokens for success, warning and destructive | "checklist of pass warning fail results" (`ui/contrast-tag` is AA contrast only) | Maybe |
| `ChapterProgress` | Four `ui/progress` bars in a labelled group | `ui/stepper` is numbered dots, not segment bars | No |
| `Waveform` (example voice card) | Tokens, decorative, `aria-hidden` | "audio player waveform voice note playback" | No |
| `GuideTips`, `PromptCard` | Tokens, package icons | n/a | No |
| `CaptureTiles` | `ui/card` surfaces wrapping file inputs, package icons | `ui/file-upload` is a dropzone list; used for the progress row only | No |
| `StickyActions` | Layout with spacing tokens and safe-area insets | n/a | No |
| `Celebration` (done) | Canvas, brand colour tokens, skipped for reduced motion | n/a | No |

---

## 7. Data model and Prisma schema

Follows PRD section 13. Additions are marked `// added:` with the reason.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum StoryStatus {
  draft
  submitted
  awaiting_email
  awaiting_parent
  in_review
  approved
  changes_requested
  rejected
  safeguarding_review
  withdrawn
}

enum Who {
  springpod
  student
  early
  pro
}

// Under 14 is never stored (PRD 9.1)
enum AgeBand {
  age_14_17
  age_18_24
  age_25_plus
}

enum NowStatus {
  school
  college
  uni
  apprentice
  working
  other
}

enum StoryMode {
  interview
  self
}

enum StoryFormat {
  interview
  write
  voice
  video
}

enum DisplayChoice {
  first
  initial
  anon
}

enum TrustLabel {
  verified
  community
}

enum Channel {
  platform
  website
  blog
  social
}

enum ParentStatus {
  not_needed
  pending
  approved
  approved_anonymous
  declined
}

enum MediaKind {
  voice
  video
}

enum MediaStatus {
  uploading
  uploaded
  processing
  ready
  failed
  deleted
}

enum FlagType {
  personal_data
  named_org
  named_person // added: pre-screen returns named_people
  safeguarding
  negative_named_org
  other // added: pre-screen other_concerns
}

enum FlagSource {
  ai
  team
  system // added: deterministic regex backstop (C8)
}

enum ReviewDecision {
  approved
  changes_requested
  rejected
}

enum AssetKind {
  linkedin
  instagram
  video_hook
  blog
  snippet
  tags
  quote_card_4x5
  quote_card_9x16
}

enum StaffRole {
  moderator
  content
}

enum ActorType {
  submitter
  parent
  staff
  system
}

enum TurnRole {
  assistant
  user
}

enum TokenPurpose {
  confirm_email
  edit_story
  parent_decision
  remove_story
}

model Submitter {
  id               String    @id @default(cuid())
  email            String    @unique // stored lower-cased
  emailConfirmedAt DateTime?
  springpodUserId  String?
  createdAt        DateTime  @default(now())
  stories          Story[]
  tokens           Token[]
}

model Story {
  id            String         @id @default(cuid())
  submitterId   String?        // null until the email step
  submitter     Submitter?     @relation(fields: [submitterId], references: [id])
  deviceIdHash  String?        // added: autosave and resume before an email is given (PRD rule 5)
  status        StoryStatus    @default(draft)

  who           Who?
  ageBand       AgeBand?
  firstName     String?
  displayChoice DisplayChoice?
  expType       String?
  area          String?
  organisation  String?
  nowStatus     NowStatus?
  nowRole       String?
  nowCompany    String?
  nowIndustry   String?
  showCompany   Boolean?

  mode          StoryMode?
  format        StoryFormat?
  writtenText   String?        // added: original written story, kept alongside the edited draft

  headline      String?
  story         String?
  pullQuote     String?
  quoteOptions  String[]
  skills        String[]
  advice        String?
  sector        String?
  previousDraft Json?          // added: one-step "Go back to previous version"

  trustLabel        TrustLabel @default(community)
  verifiedManuallyBy String?   // added: staff id when a moderator verifies by hand (PRD 10.3)
  promptVersion     String?    // added: ai-prompts.md asks for this on each story
  interviewEndedBy  String?    // added: "ai_end", "safeguarding", "user_done", "hard_stop"

  createdAt     DateTime       @default(now())
  submittedAt   DateTime?
  updatedAt     DateTime       @updatedAt

  consent        Consent?
  interviewTurns InterviewTurn[]
  media          Media[]
  flags          Flag[]
  review         Review?
  assets         Asset[]
  auditEvents    AuditEvent[]
  tokens         Token[]

  @@index([status, submittedAt])
  @@index([deviceIdHash])
}

model Consent {
  id              String       @id @default(cuid())
  storyId         String       @unique
  story           Story        @relation(fields: [storyId], references: [id], onDelete: Cascade)
  channels        Channel[]
  termsVersion    String
  acceptedAt      DateTime
  marketingOptIn  Boolean      @default(false)
  parentEmail     String?      // never selected in admin or export queries
  parentStatus    ParentStatus @default(not_needed)
  parentDecidedAt DateTime?
}

model InterviewTurn {
  id         String   @id @default(cuid())
  storyId    String
  story      Story    @relation(fields: [storyId], references: [id], onDelete: Cascade)
  role       TurnRole
  content    String
  quickReply Boolean  @default(false) // added: "Ask it differently", "Skip this one"
  createdAt  DateTime @default(now())

  @@index([storyId, createdAt])
}

model Media {
  id                   String      @id @default(cuid())
  storyId              String
  story                Story       @relation(fields: [storyId], references: [id], onDelete: Cascade)
  kind                 MediaKind
  storageKey           String
  uploadId             String?     // added: S3 multipart upload id, for resume and abort
  originalName         String
  mimeType             String?     // added
  sizeBytes            BigInt
  durationS            Float?
  width                Int?
  height               Int?
  browserChecks        Json?
  serverChecks         Json?
  transcriptRaw        String?
  transcriptEdited     String?
  transcriptConfidence Float?
  transcriptSegments   Json?       // added: timestamps, needed for the SRT download
  posterKey            String?
  normalisedKey        String?
  waveformKey          String?     // added: PRD 7.2 step 4 produces waveform JSON
  status               MediaStatus @default(uploading)
  current              Boolean     @default(true) // added: false once replaced by "Film again"
  deleteAfter          DateTime?   // added: retention sweep
  deletedAt            DateTime?
  createdAt            DateTime    @default(now())

  @@index([storyId, current])
  @@index([deleteAfter])
}

model Flag {
  id         String     @id @default(cuid())
  storyId    String
  story      Story      @relation(fields: [storyId], references: [id], onDelete: Cascade)
  type       FlagType
  detail     String
  source     FlagSource
  resolvedBy String?
  resolvedAt DateTime?
  createdAt  DateTime   @default(now())

  @@index([storyId, resolvedAt])
}

model Review {
  id         String          @id @default(cuid())
  storyId    String          @unique
  story      Story           @relation(fields: [storyId], references: [id], onDelete: Cascade)
  checklist  Json            @default("{}") // item id -> { by, at }
  decision   ReviewDecision?
  reason     String?
  decidedBy  String?
  decidedAt  DateTime?
  // Earlier decisions are kept in AuditEvent
}

model Asset {
  id          String    @id @default(cuid())
  storyId     String
  story       Story     @relation(fields: [storyId], references: [id], onDelete: Cascade)
  kind        AssetKind
  content     String?
  storageKey  String?
  createdBy   String
  createdAt   DateTime  @default(now())
  withdrawnAt DateTime? // added: PRD 9.3 marks assets withdrawn

  @@index([storyId, kind, createdAt])
}

model AuditEvent {
  id        String    @id @default(cuid())
  storyId   String?
  story     Story?    @relation(fields: [storyId], references: [id], onDelete: SetNull)
  actorType ActorType
  actorId   String?   // staff id; never an email
  action    String
  payload   Json?
  createdAt DateTime  @default(now())

  @@index([storyId, createdAt])
}

// added: staff roles behind Google SSO (PRD 11)
model StaffUser {
  id        String    @id @default(cuid())
  email     String    @unique
  name      String?
  role      StaffRole
  active    Boolean   @default(true)
  createdAt DateTime  @default(now())
}

// added: single-use links (confirm, edit, parent decision, remove)
model Token {
  id          String       @id @default(cuid())
  tokenHash   String       @unique
  purpose     TokenPurpose
  submitterId String?
  submitter   Submitter?   @relation(fields: [submitterId], references: [id], onDelete: Cascade)
  storyId     String?
  story       Story?       @relation(fields: [storyId], references: [id], onDelete: Cascade)
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime     @default(now())
}

// added: under 14 keeps only an anonymous count (PRD 9.1)
model BlockedCount {
  day   DateTime @id @db.Date
  count Int      @default(0)
}
```

Notes:

- Emails live only on `Submitter` and `Consent.parentEmail`. Admin and export queries go through typed selectors in `src/lib/admin-queries.ts` that never select those fields, and a test asserts no admin API response contains an `@`-shaped email field.
- `pg-boss` creates its own `pgboss` schema; nothing to add here.
- Remove-my-story links are permanent until used, so `remove_story` tokens get a long expiry (Q14).

---

## 8. Statuses and gates

The PRD lists `awaiting_parent` as a status, and also says Approve is disabled while parent consent is pending, which implies the team can review those stories. The build does both:

```
draft
  └─ submit ──> submitted ──(pre-screen job)──┬─> safeguarding_review   (any safeguarding concern, or [[SAFEGUARDING]] in the interview)
                                              └─> awaiting_email       (magic link sent)
awaiting_email ──(email confirmed)──┬─> awaiting_parent   (age 14 to 17 and parent pending)
                                    └─> in_review
awaiting_parent ──(parent approves or approves without name)──> in_review
awaiting_parent ──(parent declines)──> rejected (reason: parent declined; media deleted after 30 days)
in_review ──> approved | changes_requested | rejected
changes_requested ──(submitter edits and resubmits)──> submitted
any public status ──(remove link)──> withdrawn
```

- Stories in `awaiting_parent` appear in the queue (filterable). Moderators can read them and tick the checklist; Approve stays disabled.
- `safeguarding_review` stories are out of the normal queue and visible under a Safeguarding filter only.
- `src/lib/gates.ts` exports `approveBlockers(story)` returning a list of reasons (parent pending, open safeguarding review, unticked checklist items for stories with media). The UI disables Approve and shows the reasons in a tooltip; the API refuses the same call. Playwright covers acceptance criterion 8.
- If the parent chooses "Approve without name", `displayChoice` is forced to `anon` and logged.
- Every transition writes an `AuditEvent` in the same database transaction.

---

## 9. API routes

All mutating routes check origin, validate input with `zod` and are rate limited.

| Route | Who | Purpose |
|---|---|---|
| `POST /api/draft` | Public | Create the draft story once age is 14 or over; set device cookie |
| `PATCH /api/draft` | Public (device cookie) | Autosave answers |
| `POST /api/blocked` | Public | Increment the anonymous under-14 count; delete any draft for the device |
| `POST /api/interview/turn` | Public | Store the user turn, stream the next interviewer message, handle markers and the 9-answer hard stop, fall back to fixed questions |
| `POST /api/story/generate` | Public | Draft or regenerate (stores the previous draft) |
| `POST /api/uploads/create`, `/sign-part`, `/complete`, `/abort` | Public | S3 multipart; `complete` queues `media-probe` |
| `GET /api/media/[id]/status` | Public | Server check results, transcript readiness |
| `PATCH /api/media/[id]/transcript` | Public | Save the edited transcript |
| `POST /api/story/submit` | Public | Consent, email, parent email; status to `submitted`; queue pre-screen and emails |
| `GET /confirm/[token]`, `/parent/[token]`, `/remove/[token]`, `/edit/[token]` | Token holder | Pages backed by server actions |
| `/api/admin/*` | Staff | Status changes, checklist ticks, flag resolve, manual verify, content pack, signed media and asset downloads, publish email trigger |

---

## 10. Media pipeline and background jobs

### In the browser

1. Person picks a file (Film now opens the camera or recorder through a file input with `capture`; Upload a file uses the design system dropzone). `src/lib/media/analyse.ts` reads metadata, frames and audio; `src/lib/media/checks.ts` applies the PRD 7.1 thresholds. Undecodable files give warnings, never fails.
2. As soon as the file type and size pass, the multipart upload starts (`media.status = uploading`), so it runs while the other checks resolve and while the person reads them. If a later check fails, the upload is cancelled and the record removed.
3. "Use this video" moves on with the uploaded file. Choosing another file ("Film again", "Upload a different file") replaces the current one: the old record is marked `current = false`, `deleted`, and its files are deleted straight away.
4. The transcript screen shows upload progress, then polls `GET /api/media/[id]` every 2 seconds until the file is ready, then shows the transcript to correct. Corrections save as people type.

### Worker jobs (pg-boss queues)

| Job | Trigger | Steps | Notes |
|---|---|---|---|
| `media-process` | Upload complete | ffprobe (container, codecs, duration, displayed size after rotation, audio track); the same audio stats as the browser (loudness, peak, clipping, silence) from decoded audio; brightness of frames at 25% and 60%; EBU R128 loudness and true peak; blur score; the shared checks. If they pass: convert to H.264/AAC MP4 or AAC M4A (trimmed to the limit), poster frame, waveform JSON, 16 kHz mono WAV for speech to text; then queue `media-transcribe` | A file that fails the server checks isn't converted or transcribed. Built (M4.5) |
| `media-transcribe` | After `media-process` | Send the WAV to the transcription adapter; save raw transcript, timed segments and confidence; mark the file `ready` | Built (M4.6) |
| `story-prescreen` | Submit, resubmit | AI pre-screen on story, transcript and interview turns, plus the regex backstop; write `Flag` rows; route to `safeguarding_review` if needed | |
| `safeguarding-notify` | Safeguarding flag | Email the safeguarding lead with an admin link and no story content | |
| `springpod-match` | Email confirmed | Call the matching adapter; set `trustLabel` | Adapter is "none" until the API exists |
| `quote-card-render` | Content pack, approval | Headless Chromium screenshots the render route at both sizes; store PNGs as assets | |
| `email-send` | Any email | Render template, send through the adapter, audit the template name (never the address) | Retries with backoff |
| `retention-sweep` | Daily cron | Delete media and derived files past `deleteAfter`; mark assets withdrawn; delete expired tokens; delete abandoned drafts (Q12) | Acceptance criterion 12 |

Failed jobs retry three times with backoff. A failed `media-process` then marks the media `failed` and the person is asked for another file; a failed `media-transcribe` marks it `ready` with an empty transcript so the person can type what they said (M4.8). A 250 MB upload never touches the app server.

---

## 11. AI integration

- `src/lib/ai/prompts.ts` holds the four prompts from `docs/ai-prompts.md` verbatim, with `PROMPT_VERSION`. The version is saved on each story.
- Interview turns use the fast model with streaming (server-sent events to the browser). The server strips `[[END]]` and `[[SAFEGUARDING]]` before forwarding text, enforces the 9-answer hard stop and switches to the fallback questions on any API error or timeout.
- Draft, content pack and pre-screen use the balanced model with JSON output validated by `zod`. On invalid output: one retry, then the documented fallback (`pickQuotes` and `fallbackDraft` ported from the prototype for drafts; for the pre-screen, no fallback: the story is held and flagged for manual review rather than passed as clean).
- Content pack: only assets for agreed channels. Mapping, as in the prototype: social gives LinkedIn, Instagram and the video hook; blog gives blog title and intro; website or Springpod gives the website snippet; tags always (Q11).
- Red-team script (acceptance criterion 9): `tests/ai/interviewer-redteam.test.ts`, 30 scripted conversations run against the real API behind an env flag, asserting no question asks for surname, school or contact details, and that the harm scenario ends with signposting and `[[SAFEGUARDING]]`.
- Cost and abuse: per-device and per-IP limits on interview turns and regenerations (Q13).

---

## 12. Auth, tokens and privacy

- Staff: Google Workspace SSO through Auth.js, allowed only for the Springpod domain and an active `StaffUser` row. `content` role adds the content pack. `/admin` is guarded in middleware and again in every admin route.
- Submitters: no passwords. Submit sends a confirm link. Edit, parent decision and remove links are single-use tokens stored as SHA-256 hashes. Parent links expire after 14 days (PRD 14).
- Under 14: nothing is written to the server until a valid age is chosen. Picking "Under 14" sends only an anonymous increment; if a draft exists for the device (age changed later), it is deleted.
- Data minimisation: first name only; no surname, school or address fields anywhere. Pre-screen catches them in free text.
- Media private by default, presigned URLs only, short expiry (15 minutes for playback, longer for staff downloads).
- Security headers and a strict content security policy in middleware.

---

## 13. Emails

React Email templates, plain text versions, British English, no em dashes. All six triggers from PRD 14. Every submitter email has a "Remove my story" link. Copy is not in the prototype: drafts go in `docs/copy-gaps.md` for approval before milestone 7.

---

## 14. Tracking

`src/lib/track.ts` exposes `track(event, payload)`. Development logs to the console; production sends to GA4 (measurement ID from env). Events and payloads exactly as PRD 16. Free text is never sent: the helper takes a typed payload per event, so a free-text field cannot be passed. Funnel steps: start, each chapter, submit, confirmed, approved.

---

## 15. Testing and checks

Run at every milestone sign-off: `pnpm test`, `pnpm test:e2e`, `pnpm lint` (ESLint, TypeScript, em dash check), `pnpm build`, `npx springpod-audit src --json`.

| Acceptance criterion | Test |
|---|---|
| 1 Screens match prototype | Playwright screenshots at 390px for every screen, compared by eye against `design/screens/` at sign-off |
| 2 Config-driven flow | Vitest on `engine.ts` |
| 3 Age rules | Playwright (under 14 stop), Vitest on gates |
| 4 Nothing pre-ticked | Playwright asserts unselected state on channels, confirm and marketing |
| 5 Browser check thresholds | Vitest, one test per PRD 7.1 row plus undecodable input |
| 6 Resumable 200 MB upload on throttled 4G | Playwright with network throttling and a forced disconnect, plus a manual phone test |
| 7 Server results within 2 minutes | Worker integration test with a 90-second fixture video |
| 8 Approve gating | Playwright on admin |
| 9 Interviewer red team | AI test suite, behind a flag |
| 10 Content pack channels | Vitest on the channel mapping |
| 11 Quote card never clips | Playwright at 18px with a 160-character quote |
| 12 Emails and withdrawal | Integration test with the console email adapter and the retention job |
| 13 Build, lint, audit | CI |
| 14 Lighthouse | Lighthouse CI on the start screen and one question screen |

CI: a GitHub Actions workflow running lint, unit tests, build and the audit on every push (milestone 1).

---

## 16. Milestone breakdown

| # | Milestone | Main files | Notes |
|---|---|---|---|
| 1 | Foundation | Next.js app, package install and `springpod-init`, theme, header, `flow/*`, `FlowShell`, `ChapterProgress`, every question screen with placeholders for capture, start screen with the example reel, em dash check, CI | Click through every question, no server yet (local state only) |
| 2 | Data and accounts | Prisma schema and migrations, autosave, submit, tokens, confirm page, statuses, audit events, console email adapter | |
| 3 | Write and interview | Write mode, interview route with streaming, fallbacks, story strength, safeguarding end | Needs an Anthropic API key in the environment |
| 4 | Media | Guidance, capture, browser checks and tests, Uppy multipart, worker container with probe, normalise and transcribe (fake adapter), transcript screen | Needs a bucket and ffmpeg in the worker image |
| 5 | Draft, quote and consent | Draft route, quote picker, `QuoteCard`, sharing screens, parent flow, confirm, done | |
| 6 | Admin | SSO, roles, queue, filters, detail, flags, pre-screen job, checklist, gates, request changes, reject | Needs a Google OAuth client |
| 7 | Content pack and emails | Content pack, PNG render, video and SRT downloads, all emails | Needs the email provider (or stays on the console adapter) |
| 8 | Polish and acceptance | Responsive and accessibility pass, device tests, Lighthouse, tracking, acceptance report | Real-device camera tests need someone with phones |

---

## 17. Placeholders for PRD section 21 open decisions

Not resolved here. Each gets a visible placeholder in the build and appears in the final report.

| Open decision | Placeholder in the build |
|---|---|
| Hosting and stack fit | Two containers (app, worker), Postgres, S3-compatible bucket. Nothing provider-specific |
| Transcription provider | `TranscriptionProvider` interface; `fake` adapter returns the prototype sample transcript with timestamps |
| Email provider | `EmailProvider` interface; `console` adapter logs rendered emails |
| Springpod account matching API | `SpringpodMatcher` interface; `none` adapter always returns no match; moderators can verify by hand in the admin |
| Industry list | Prototype's 11 options in `src/flow/options.ts`, marked `PLACEHOLDER (PRD 21)` |
| Retention periods and DPIA | Constants in `src/lib/retention.ts` (30 days rejected or withdrawn; 12-month review flag), marked as placeholders |
| Designated safeguarding lead | `SAFEGUARDING_LEAD_EMAIL` env var; if unset, the admin shows a warning banner and flags still route to `safeguarding_review` |
| Partner approval process | Named organisation flag only, as the PRD says |
| In-browser recording (phase 2) | Not built |
| Face, logo and screen detection (phase 2) | Not built; `serverChecks` schema leaves room for it |
| Voice answers in the interview | Not built; text only |
| Real stories on the start screen | Prototype examples kept, with the "Example stories" tag |
| Stock photo licence | Credits kept in `design/assets/CREDITS.md`; portraits re-encoded to AVIF and WebP |

---

## 18. New questions for review

None of these block milestone 1 except Q1 to Q3. My proposed default is in brackets. I'll use it unless you say otherwise.

1. **Trust label in the public flow.** The quote card preview shows a trust label before the email is matched. Show "Verified by Springpod" in the preview for people who pick "Springpod student" (as the prototype does), knowing the stored label may end up "Community story" if there's no match? Or show "Community story" to everyone until matched? (Default: follow the prototype in the preview only; stored and published label follows the match.)
2. **Hosting for milestone 1.** I need somewhere to run Postgres and, from milestone 4, a bucket and a worker. For local development I'll use Docker Compose (Postgres, MinIO for S3). Is there a Springpod preview environment to deploy to, or is local enough until the stack decision? (Default: local only.)
3. **Design system access.** The npm package is public, good. Is there a Figma file or a newer package version than 0.2.0 I should build against? (Default: 0.2.0, upgrade when a new version ships.)
4. **Next.js versus the PRD's other stack choices.** Fine to start milestone 1 on Next.js before the platform team confirms (PRD 21 says confirm before milestone 1)? (Default: start; the flow engine and components move to any React stack.)
5. **Celebration on the done screen.** The prototype fires confetti on submit (skipped for reduced motion). It isn't a reward, but `CLAUDE.md` says no rewards. Keep it? (Default: keep, reduced-motion safe.)
6. **Story strength colour.** The prototype bar is blue (the package's learning-progress look), but the package says `ui/learning-progress` is for learning surfaces only. Use `ui/progress` (navy or teal fill) instead? (Default: `ui/progress`.)
7. **Skill chips.** The prototype shows teal chips. The package options are `ui/badge` (status), `ui/tag` (uppercase category) and `ui/pill` (interactive). (Default: `ui/badge`, with a design system request if no colourway fits.)
8. **Missing icons.** The package has mic, video, chat, time, padlock, warning, check-circle, rocket and arrows, but no pen, upload, sun, eye, hand or shield. Use `lucide-react` (already a package dependency) for the gaps, or wait for the design system? (Default: lucide for the gaps, listed for a design system request.)
9. **"Written" type chip.** `ui/content-type-tag` covers video and audio but not written. (Default: compose a matching chip from `ui/tag` for Written.)
10. **Confirm screen controls.** The prototype uses the answer-button style with a square mark for the two consent boxes; the PRD calls them checkboxes. (Default: `FormSelectGroup` multiple, as the prototype, since it already exposes pressed state to screen readers.)
11. **Tags in the content pack.** Tags are generated whatever the channels. They are internal SEO tags, not published copy. OK? (Default: yes.)
12. **Abandoned drafts.** The PRD doesn't say how long unsubmitted drafts are kept. (Default: delete after 30 days, flagged for the DPO with the other retention items.)
13. **Bot and cost protection.** The interview and draft routes call Claude for anonymous visitors. Rate limits are planned. Add a challenge (for example Cloudflare Turnstile) on Start? (Default: rate limits only for now.)
14. **Remove link lifetime.** The "Remove my story" link in emails. (Default: valid until used, never expires; a used link shows the removed state.)
15. **Parent declines.** Story goes to `rejected` with reason "Parent declined", and media is deleted after 30 days. Should the submitter be emailed? (Default: no email, to avoid friction at home; flagged for safeguarding input.)
16. **Edit after changes requested.** The prototype has no screen for this. (Default: the edit link opens the draft screen with the team's message in a `ui/alert`, then confirm and resubmit.)
17. **Transcript wait.** If the transcript isn't ready when the person reaches the transcript screen, they wait on a progress state (copy gap). Acceptable, or let them carry on and edit later? (Default: wait; the 90-second target makes this short.)

---

## 19. Milestone log

### Milestone 1: Foundation

What's built: Next.js app with the design system theme, header, the question-config flow engine, chapter progress, back (on-screen and browser), validation on press, start screen with the example reel, every question screen, video and voice guidance, the quote card, and the done screen. Interview, writing, media capture, transcript and drafting are clearly marked placeholders (`Build placeholder (milestone n)`), so the whole flow can be clicked through.

Versions: Next.js 16.4, React 19.3, Tailwind CSS 4.3, `@springpod/design-system` 0.2.0, pnpm 10, Node 22.

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M1.1 | Section 18 defaults accepted ("go") | Your approval |
| M1.2 | Imported `@springpod/design-system/styles.css` by hand rather than running `springpod-init` | `springpod-init` also writes agent instructions, MCP config and a pre-commit hook. `CLAUDE.md` already holds the rules and CI runs the audit. Say if you want the pre-commit hook |
| M1.3 | Answer buttons pinned to the package's `mobile` size at every width | The flow is a fixed 520px column, where the package allows pinning. The responsive default switches to 24px light labels on desktop, which is larger than the prototype and wraps the industry tiles badly |
| M1.4 | Quote sizes 24px, 21px and 18px (IBM Plex Serif, regular) | The type scale has no 26px step; 24px (`text-h5`) is the nearest token. 21px and 18px match `text-content-h3` and `text-content-h4` |
| M1.5 | The quote card grows using a 4:5 spacer in a one-cell grid, not `aspect-ratio` alone | Found in testing: as a flex item, an `aspect-ratio` box takes the ratio height as its minimum, so long "now" lines spilled out of the card on the done screen. Playwright now checks every element of the card sits inside its edges |
| M1.6 | Skill chips use `ui/tag` (teal-light), not `ui/badge` (changes Q7 default) | `ui/badge` is a semantic status label with a hover effect; `ui/tag` is the static category chip and matches the prototype's teal-on-teal colours. It is uppercase, as the package designs it |
| M1.7 | Example card type chips use `ui/tag` for all three kinds (answers Q9) | `ui/content-type-tag` has fixed labels ("Voice call", "Briefing audio", "Video") with no "Voice note" or "Written" |
| M1.8 | Icons: package glyphs for mic, video, chat, time, padlock, phone, light mode, eye, mute, security and back arrow; `lucide-react` only for pen and hand (Q8) | No pen or hand glyph in the package. Both listed for a design system request |
| M1.9 | Back arrow is the package's `short-arrow-back` glyph, not the prototype's chevron | Nearest shipped glyph |
| M1.10 | Optional text questions read "Skip" when empty and "Continue" once filled | The prototype switches to "OK" while typing. PRD 18: buttons start with a verb (conflict C13) |
| M1.11 | Switching "Which best describes you?" away from Springpod student or Working professional clears the experience type it set | The prototype kept the stale value, so the experience screen showed nothing selected but a Continue button (conflict C14) |
| M1.12 | Superseded by M1.19 | |
| M1.13 | Each step is in the URL (`?q=role`). A reload or shared link starts at the start screen | Nothing is stored until milestone 2, which adds resume |
| M1.14 | The example reel pauses while hovered or focused, and tap, Enter or Space shows the next card | WCAG 2.2.2 may need a visible pause control for content that moves on its own for more than 5 seconds. Flagged for the milestone 8 accessibility pass |
| M1.15 | Two `springpod-audit-allow` comments, both for `env(safe-area-inset-*)` padding | Keeps the header and pinned button clear of the notch and home bar. These are device insets, not spacing values |
| M1.16 | ESLint 9 with `eslint-config-next` 16 | ESLint 10 is out but untested with the Next config |
| M1.17 | Playwright reads `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when set | Cloud sessions ship a pre-installed Chromium. CI installs its own |
| M1.18 | `pickQuotes` and the fallback draft are ported now (with a test) | The draft placeholder uses them so the sharing screens show a real quote card |

Checks at sign-off: `pnpm lint` (ESLint, TypeScript, em dash check) clean; `pnpm test` 25 unit tests pass; `pnpm test:e2e` 19 Playwright tests pass at 390px, 360px and 1440px; `pnpm build` passes; `npx springpod-audit src --json` reports no drift.

New questions:

18. **Pre-commit hook.** Answered: no. CI runs the audit (M1.20).
19. **Rocket mark.** Answered: remove the rocket completely (M1.19).

Answers recorded after milestone 1 review:

| # | Decision | Why |
|---|---|---|
| M1.19 | No rocket anywhere in the product. Removed from the quote card footer. The interviewer avatar (milestone 3) will use the package chat glyph on navy instead | Owner decision (Q19). Overrides PRD 5.4 ("white rocket mark" in the card footer) and PRD 6.1 ("interviewer avatar is the white rocket on navy"). The Springpod logo in the header is unchanged: it is the brand mark, and the logo rules say never recompose it |
| M1.20 | No drift-audit pre-commit hook | Owner decision (Q18). CI runs `springpod-audit` on every pull request |

### Milestone 2: Data and accounts

What's built: the Prisma schema from section 7 and its first migration; autosave of answers to Postgres once an age is given; resume on the same device; the under-14 rule (nothing stored, any draft deleted, an anonymous daily count); submit with consent; single-use, hashed magic links; the confirm page; the status state machine; and audit events for every state change. Email goes to a console adapter until a provider is chosen.

Versions added: Prisma 7.10 with the `pg` driver adapter, zod 4.

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M2.1 | Infrastructure stays provider-neutral until the CTO confirms. Proposal on the table: AWS London (Transcribe, S3, ECS Fargate, RDS Postgres) | Milestone 2 needs only Postgres, which any of the options provide |
| M2.2 | Autosave stores story answers only. Email, parent or carer email, channels and the consent boxes go to the server once, at submit | Keeps unconfirmed contact details and half-made consent choices out of the database. On resume people re-answer the sharing screens, which also keeps every consent choice fresh and unticked |
| M2.3 | Drafts are keyed to an HTTP-only device cookie (30 days), stored as a hash. Not yet keyed to email | PRD 4 rule 5 also says "and, once given, the email". Resuming on another device by email needs a sign-in link and a screen the prototype doesn't have. Question 20 |
| M2.4 | Confirm links last 7 days and work more than once until then | The PRD gives no expiry for confirm links. Re-use is harmless and stops email scanners that open links first from locking people out |
| M2.5 | Every story needs its own email confirmation, even from an address confirmed before | Confirming proves the person sending this story controls the inbox |
| M2.6 | Rate limits are in memory: autosave 120 a minute per device and 600 a minute per connection; submit 10 an hour per connection and 5 an hour per email address | Enough for one app instance. Moves to a shared store when the app runs on several instances |
| M2.7 | The AI pre-screen step is a marked placeholder: submit moves straight from `submitted` to `awaiting_email` and logs `prescreen_skipped` | The pre-screen arrives in milestone 6 |
| M2.8 | `TERMS_VERSION` is `draft-2026-10`, a placeholder | The terms text is copy gap G16 |
| M2.9 | Resume lands on the first question still needing an answer. Optional questions left empty count as answered | An empty optional answer and a skipped one look the same |
| M2.10 | The database client connects on first use, not on import | The production build loads route modules and must not need a database |
| M2.11 | The console email provider masks addresses in logs and can write emails to a folder for tests (`EMAIL_OUTBOX_DIR`) | Keeps full addresses out of logs, and lets the browser tests follow real confirm links |
| M2.12 | Consent records store the channels, terms version and time, marketing choice, and parent email and status (PRD 9.2). Name display and show-company choices sit on the story itself, as in PRD 13 | As specified |

Checks at sign-off: `pnpm lint` clean; `pnpm test` 50 tests pass (39 unit, 11 integration against Postgres); `pnpm test:e2e` 23 Playwright tests pass, including submit, the confirm link, resume after reload, start again and under 14; `pnpm build` passes with and without a database URL; `npx springpod-audit src --json` reports no drift.

New questions:

20. **Resume on another device.** Should people be able to pick up a draft on a different device, using their email? It needs a "send me a link" screen the prototype doesn't have. (Default: same device only for now.)
21. **Confirm link lifetime.** 7 days (M2.4)? (Default: 7 days.)

### Milestone 3: Write and interview

What's built: the "Write it" screen (live word count, at least 40 words); the AI interview with streamed replies, quick replies, the "I'm done, write it up" option after three answers, the story strength meter, fixed fallback questions, a hard stop after nine answers, and the safeguarding ending; every turn stored so the interview resumes; the prompts module copied from `docs/ai-prompts.md` with a version number; and the red-team script for acceptance criterion 9.

Versions added: `@anthropic-ai/sdk` 0.133.

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M3.1 | Interview turns use `claude-haiku-5-5` at effort `low`; drafting and the rest will use `claude-sonnet-5-5`. Both set by `AI_MODEL_FAST` and `AI_MODEL_BALANCED` | `docs/ai-prompts.md` asks for a fast Haiku-class model for interview turns and a balanced Sonnet-class model for the rest. Low effort keeps replies quick. No temperature or prefill: the current models reject both |
| M3.2 | Without `ANTHROPIC_API_KEY` the interview uses the fixed questions | The PRD's fallback path. It also means local development, CI and the browser tests need no key |
| M3.3 | The interviewer prompt is sent as the system prompt; the kickoff ("Start the interview now...") is the first user message | As `docs/ai-prompts.md` describes. The prototype put both in one user message |
| M3.4 | Replies stream as newline-delimited JSON events. The `[[END]]` and `[[SAFEGUARDING]]` markers are stripped on the server, including when a marker arrives split across chunks | Markers never reach the browser |
| M3.5 | If the model fails, times out (20 seconds) or declines part way through a reply, the half-shown reply is replaced with the next fixed question | Haiku-class models have no server-side fallback for declined requests |
| M3.6 | Quick replies are stored as user turns marked `quickReply`, and only the exact quick reply texts count as quick replies. They don't count towards the three-answer minimum | PRD 6.1 minimum is about real answers |
| M3.7 | The interview step is complete only once the interview has ended: by the interviewer, the hard stop, or "I'm done, write it up" (which the server allows after three answers) | Found in testing: counting three answers as complete made a reload skip past an unfinished interview |
| M3.8 | A safeguarding ending raises a `safeguarding` flag on the draft. At submit, a story with an open safeguarding flag goes to `safeguarding_review` instead of the normal queue | PRD 6.1 and 9.4. Notifying the safeguarding lead arrives with the admin in milestone 6 |
| M3.9 | The interviewer's picture is the chat glyph on navy | No rocket (M1.19) |
| M3.10 | The red-team script runs only with `pnpm test:ai` and an API key. 10 personas by 3 scripts: volunteering personal details, inviting contact questions, and a harm disclosure | Acceptance criterion 9. It calls the real model, so it stays out of every-push CI. **Not yet run: this environment has no API key** |
| M3.11 | The Send button stays enabled; pressing it with an empty box does nothing | PRD 5.1: validation on press, not by greying out buttons |
| M3.12 | Interview rate limits: 30 turns a minute per device, 300 per connection; answers up to 2,000 characters | Cost and abuse protection on an anonymous AI endpoint |

Checks at sign-off: `pnpm lint` clean; `pnpm test` 68 tests pass (unit and Postgres integration, including the interview service with a fake model); `pnpm test:e2e` 25 Playwright tests pass, including writing, the interview through to the draft, quick replies and resuming the interview; `pnpm build` passes; `npx springpod-audit src --json` reports no drift; `pnpm test:ai` has 30 red-team conversations ready to run.

New questions:

22. **API key for the red team run.** To sign off acceptance criterion 9, someone with an Anthropic key (or Bedrock, if chosen) needs to run `pnpm test:ai`. Can you add a key to the environment, or run it yourselves? (Default: you run it before launch.)

### Milestone 4: Media

What's built: the capture screen (Film now, Upload a file, See all tips, Change how I tell it); the instant browser checks from PRD 7.1 with the prototype's verdicts and fixes; uploads straight to a private bucket in 10 MB parts with retries; the media worker (server checks, conversion, poster frame, waveform, transcription) on pg-boss; and the transcript screen, which shows upload progress, waits for the checks and transcript, then lets the person correct it. Submitting a voice note or video now needs a usable file and a transcript of at least 20 words, checked again on the server.

Versions added: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` and `@aws-sdk/client-transcribe` 3.1151.0, `pg-boss` 12.38.0, `tsx` (dev). ffmpeg 6 must be on the worker's PATH.

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M4.1 | **Infrastructure is still to be confirmed with the CTO**, so storage and transcription are provider-neutral: any S3-compatible bucket (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`) and a `Transcriber` interface with `fake` and `aws` adapters. Locally and in CI, moto stands in for S3 | Nothing is tied to a provider until the decision is made. The `aws` adapter (Amazon Transcribe, en-GB, eu-west-2) is ready if AWS London is confirmed; its output parser is unit-tested but it has not been run against AWS |
| M4.2 | A small uploader of our own (fetch and XMLHttpRequest, three parts at a time, five tries per part with backoff, waits while offline, fresh signed link on a 403) instead of Uppy | About 150 lines against a whole library; the server already presigns each part, and the design system's `FileUpload` and `FileUploadItem` give the UI |
| M4.3 | File names are never stored. The record keeps only `video.mov` or `voice-note.m4a` | People name files after themselves ("Sam Smith story.mov"); we don't collect surnames |
| M4.4 | The server rejects an upload whose type or size fails the quick checks, and after completing checks the stored size matches what the browser declared | So the size check can't be bypassed |
| M4.5 | The worker uses the same check rules and the same audio and brightness maths as the browser (`src/lib/media/measure.ts`). Its results are stored as `serverChecks = { checks, metrics }`; metrics (codecs, rotation, LUFS, true peak, blur, trim) are for the admin in milestone 5. Blur is recorded but doesn't fail a file (PRD 7.1 sets no threshold) | PRD 7.2: server wins where they differ, so they should differ only when the browser couldn't read the file |
| M4.6 | Two jobs instead of the three planned: `media-process` and `media-transcribe` | Probe and convert share one download of the file, and the transcript can't start before the audio is extracted anyway |
| M4.7 | Videos between 90 and 120 seconds (voice notes between 3:00 and 3:15) are trimmed to the limit when converted, as the length check promises ("We'll use the first 1:30") | Prototype copy |
| M4.8 | If transcription keeps failing, the person can type what they said instead (copy gap G3) | They shouldn't be stuck because a provider is down |
| M4.9 | When the server checks fail a file the browser passed (or couldn't read), the transcript screen shows the server's checks with "Film again" | PRD 7.2 |
| M4.10 | On resume, a fully uploaded file that hasn't failed the server checks counts as chosen, and the corrected transcript comes back | Resume works the same on every step |
| M4.11 | "Start again", the under-14 path, and sending a story told another way all delete stored media | Media is personal data; nothing is kept that isn't needed |
| M4.12 | Signed playback links last 15 minutes; upload part links an hour. The bucket is private | `CLAUDE.md`: media is private and served through signed URLs |
| M4.13 | The worker runs as its own process (`pnpm worker`, tsx under the `react-server` condition so the app's server-only modules load) | PRD: two containers, app and worker |
| M4.14 | Test media (`tests/fixtures/media`) are WebM and Ogg, generated by `scripts/make-media-fixtures.sh` | Playwright's Chromium doesn't play H.264 or AAC |

Timing (acceptance criterion 7): a 90-second 1080 x 1920 video at 8 Mb/s (91 MB) took 43 seconds through `media-process` on 4 cores, with the fake transcriber. Real transcription adds the provider's time; Amazon Transcribe is typically well under a minute for 90 seconds of audio, but that needs measuring once the provider is confirmed.

Checks at sign-off: `pnpm lint` clean; `pnpm test` passes (unit and integration, including uploads against moto and the worker on real media files with ffmpeg); `pnpm test:e2e` passes, including filming, failing and replacing a file, voice notes, the transcript and resuming after a reload; `pnpm build` passes; `npx springpod-audit src --json` reports no drift.

New questions:

23. **A file that's uploaded but not chosen.** The upload starts before the person presses "Use this video". If they leave at that point and come back, the uploaded file counts as chosen. (Default: keep; they see it on the transcript screen and can film again.)
24. **Media from abandoned drafts.** Files from drafts that are never sent stay until the draft is deleted. This joins Q12 (abandoned drafts), with deletion by the retention sweep in milestone 7. (Default: 30 days, with the drafts.)

### Milestone 5: Draft, quote and consent

Milestone 4 approved on 14 October 2026.

What's built: the story draft written on the server (headline, story, three quote options, pull quote, skills, advice, sector), with the prototype's fallback when the AI can't be used; the draft screen (edit the headline and story, pick one of three quotes or write your own with the card updating live, "Try a different version" and "Go back to previous version"); and the parent or carer flow (email at submit, a page to see the story and decide, and the effect of each decision on the story). The name display, show company, channels, email, confirm and done screens from milestone 1 were checked against the PRD and the reference screens.

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M5.1 | The draft uses `claude-sonnet-5-5` (`AI_MODEL_BALANCED`) at effort `medium`, with structured outputs: the reply must match a schema, then it is tidied (em dashes removed, quotes no longer than 160 characters and without quote marks, at most four skills, the pull quote one of the options). Time limit 60 seconds | `docs/ai-prompts.md` asks for a balanced model and schema-checked JSON. **Not yet run against the real model: no API key here (Q22)** |
| M5.2 | The draft is written from what the server holds: the answers are saved first, then the interview turns, written story or corrected transcript are read back from the database | The browser can't send a different source from the one that is stored |
| M5.3 | If the model fails, times out, declines or replies with something unusable, the person's own words become the story and `pickQuotes` picks the quotes, with a placeholder notice (copy gap G6) | `docs/ai-prompts.md` section 2 fallback |
| M5.4 | "Try a different version" keeps the current draft, with the person's edits, as the previous version. It is saved with the draft, so "Go back to previous version" still works after a reload. "Looks good" and a fresh draft clear it | PRD 8: "restores the last one, including edits" |
| M5.5 | "Looks good" checks there is a headline, a story and a card quote. The three messages are placeholders (copy gap G19) | The prototype has no checks here, but a story can't go out without these |
| M5.6 | The parent or carer email goes at submit (PRD 14), except when the story is held for safeguarding: then the team decides first, and the email will be sent when the review is cleared (milestone 6). **Confirmed by the product owner, 14 October 2026** | A concern raised in the interview might involve home |
| M5.7 | Opening the parent link shows the story without using the link up; the decision is recorded once, and later answers are ignored. The page never shows an email address | Email scanners open links; PRD 9.3 |
| M5.8 | "Approve without name" sets the name display to "No name", so the card shows "Anonymous" | PRD 9.1 |
| M5.9 | A decline rejects the story (audit reason "Parent declined") and marks its media for deletion after 30 days, for the retention job in milestone 7. The young person isn't emailed (Q15 default) | PRD 9.3 |
| M5.10 | A parent can decide before the young person confirms their email; the story then goes to review once they confirm | Either order works |
| M5.11 | On the draft screen the headline and story boxes are named for screen readers only, as in the prototype | Matches `design/screens/18-draft-and-quote-picker.png` |
| M5.12 | Voice note and video transcripts go to the model labelled "Transcript of video:" or "Transcript of voice note:", as in the prototype. Prompt version is now `2026-10-14.2` | The model knows it is reading speech |
| M5.13 | "Start my story" now waits for the saved draft to finish loading | Found in testing: a quick tap could start over a saved draft |

Checks at sign-off: `pnpm lint` clean; `pnpm test` 126 tests pass (unit and integration, including drafting with a fake model and the whole parent flow); `pnpm test:e2e` 46 Playwright tests pass at 360, 390 and 1440 pixels, including editing the draft, picking and writing quotes, a different version and going back, and a 14 to 17 year old's story approved through the parent link; `pnpm build` passes; `npx springpod-audit src --json` reports no drift.

New questions:

25. **Parent link expiry.** The parent link works for 14 days. If nobody decides in time, the story stays private (`awaiting_parent`). Should the team be able to resend the parent email from the admin? (Default: yes, built with the admin in milestone 6.) **Answered: yes, 14 October 2026.**

### Milestone 6: Admin

Milestone 5 approved on 14 October 2026.

What's built: staff sign-in to `/admin` (Google Workspace through Auth.js, with a development sign-in for local testing); the story queue with counts, filters and search; the story detail as in `design/screens/42-admin-queue-video-checks.png` (facts, flags, story, skills, quote card, interview, media player, transcript, automated checks and the team checklist); Approve, Request changes and Reject with the approval rules enforced on the server; the AI pre-screen as a background job, with a pattern check that always runs; the safeguarding lead email; clearing a safeguarding review; resending the parent email; manual verification; and the edit page for stories sent back for changes.

Versions added: `next-auth` 5.0.0-beta.32 (the current Auth.js release for Next.js 16).

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M6.1 | Staff sign in with Google Workspace (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`), limited to `STAFF_EMAIL_DOMAIN` (default `springpod.com`) with a verified Google address, and to people on the staff list (`pnpm staff:add <email> <moderator|content> [name]`). Sessions are signed cookies lasting 8 hours. The proxy checks every `/admin` request and every admin page and action checks the staff list again, so removing someone takes effect at once | Build plan section 12. **The Google OAuth client is still to be set up by Springpod** |
| M6.2 | Until then, a development sign-in by email can be turned on with `ADMIN_DEV_LOGIN=1`. It only works when `APP_URL` is localhost, so it can't be switched on in a deployed environment by mistake | Lets the admin be built and tested now |
| M6.3 | Submitting a story now queues the pre-screen (`story-prescreen` job) instead of the milestone 2 placeholder. The story waits as "submitted" until it runs. If the email is confirmed meanwhile, the pre-screen moves it straight on | PRD 9.4: the pre-screen runs before the story enters the queue |
| M6.4 | The pre-screen reads the story, quote, advice, organisation, current role, transcript and the person's interview answers (not the interviewer's questions). It uses the balanced model at low effort with schema-checked output. A pattern check for email addresses, UK phone numbers, postcodes and social handles runs every time, whatever the model says | `docs/ai-prompts.md` section 4; build plan C8 |
| M6.5 | The organisation the person names in the flow always gets the prototype's partner approval flag ("Names ... Partner approval needed before use on their channels; check tone is fair."). Other findings become flags with placeholder wording (G12). If the model can't be used, a flag says the automated check didn't run, so nobody assumes it did | PRD 9.4 |
| M6.6 | A re-run (after a resubmit) replaces the earlier automated flags. The team's own flags, resolved flags and open safeguarding flags stay | Old findings shouldn't linger after an edit, but a safeguarding concern is only cleared by a person |
| M6.7 | A safeguarding concern holds the story and emails `SAFEGUARDING_LEAD_EMAIL` once, with only a link to the admin. Without a lead set, the admin shows a warning on every page (G13) | PRD 9.4, 14 |
| M6.8 | The parent or carer email now goes from the pre-screen job once the story is cleared, and when the team clears a safeguarding review. "Resend parent email" sends a fresh link and the old one stops working | M5.6 and Q25, as agreed |
| M6.9 | "To review" counts stories in review and in safeguarding review. "Total" counts every story that has been sent | PRD 11.1 |
| M6.10 | Approve is disabled, with the reason shown, while parent consent is pending, a safeguarding review is open, or a team check is unticked for a story with media. The server applies the same rules. Each tick is saved with the staff member's name and the time | PRD 11.2, acceptance criterion 8 |
| M6.11 | Staff names, never email addresses, go into checklist ticks, decisions and resolved flags. The queue and detail never select the submitter's or parent's email | PRD 9.3 |
| M6.12 | Request changes needs a message; it emails the submitter an edit link (14 days). The edit page shows the message and lets them edit the headline, story and quote, then resubmit. The story goes through the pre-screen again, and back to review once cleared | PRD 11.2, Q16 default |
| M6.13 | Reject needs a reason, which is recorded but not emailed. Media of a rejected story is marked for deletion after 30 days, for the retention job in milestone 7 | PRD 9.3 |
| M6.14 | Clearing a safeguarding review returns the story to where it would have been: waiting for the email, for the parent, or in review | Status rules extended with `emailPending` |
| M6.15 | The "approved" email to the submitter arrives with the other emails in milestone 7 | PRD 19 puts all section 14 emails in milestone 7 |
| M6.16 | Staff playback and poster links last an hour; the public's last 15 minutes | Build plan section 12 |
| M6.17 | In tests, background jobs can run inline (`JOBS_MODE=inline`) so a test sees the result straight away; the end-to-end tests use the real worker | Simple, realistic tests |

Checks at sign-off: `pnpm lint` clean; `pnpm test` 148 tests pass (unit and integration, including the pre-screen with a fake model, every review action and the approval rules, the edit and resubmit flow, and that no email address reaches the queue or detail); `pnpm test:e2e` 59 Playwright tests pass at 360, 390 and 1440 pixels, including staff sign-in, Approve disabled until every video check is ticked (acceptance criterion 8), Approve disabled while parent consent is pending, request changes through to resubmit, and reject; `pnpm build` passes; `npx springpod-audit src --json` reports no drift.

New questions:

26. **Google sign-in setup.** Springpod needs to create a Google OAuth client (Workspace, internal) with the redirect `https://<admin host>/api/auth/callback/google`, and set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_SECRET`. Who should own this? (Default: whoever owns the infrastructure decision.)
27. **Safeguarding lead.** Who is the designated safeguarding lead, and which address should `SAFEGUARDING_LEAD_EMAIL` use? (PRD 21, still open.)
28. **Content role.** The `content` role exists but adds nothing until the content pack in milestone 7. Should moderators also be able to generate content packs? (Default: no, `content` only, as the PRD says.)

### Milestone 7: Content pack and emails

Milestone 6 approved on 14 October 2026.

What's built: the content pack for the content team (only the assets for the channels the person agreed to, copy buttons, regenerate, earlier versions kept); quote card images at 1080 × 1350 and 1080 × 1920, drawn by the worker with headless Chromium from the same card component; downloads of the approved video or voice note, its captions as SRT and the poster frame; the "Approved" and "Published" emails; "Remove my story" on every email to the young person or parent, with a remove page that withdraws the story; and the nightly retention sweep.

Versions added: `playwright-core` 1.64.0 (headless Chromium for the worker).

Decisions made while building:

| # | Decision | Why |
|---|---|---|
| M7.1 | Only staff with the `content` role can make content packs; moderators see them (Q28 default, not yet confirmed) | PRD 11: `content` adds the content pack |
| M7.2 | Channel to asset: social gets the LinkedIn post, Instagram caption and video hook; the blog gets the title and intro; Springpod and springpod.com get the programme page snippet; tags are always made (Q11). The model is asked for the full pack as `docs/ai-prompts.md` writes it, and anything for a channel the person didn't choose is dropped before it is stored or shown | Acceptance criterion 10. Keeping the prompt as written avoids a second, untested version |
| M7.3 | Quote card images are made for every approved pack, whatever the channels | The card is the story's own image on every channel (PRD 5.4), not a social post |
| M7.4 | Without the model, the pack uses only the story's own words (the story, the quote, the headline and first paragraph, the skills as tags) with a notice, and leaves out the video hook | No new marketing copy (`CLAUDE.md`) |
| M7.5 | The worker opens a signed, two-minute render page at 360 pixels wide and three times the pixel density and screenshots the card: 1080 × 1350 and 1080 × 1920. The card grows rather than clips, so an unusually long quote could make a taller image; a 160-character quote fits (acceptance criterion 11, tested) | Same component as the flow and the admin |
| M7.6 | The worker needs Chromium: `CHROMIUM_PATH` (or Playwright's own install) in the worker container, and `RENDER_BASE_URL` if it reaches the app on an internal address | Build plan section 2: the worker container has headless Chromium |
| M7.7 | The "Approved" email goes when the team approves. "Published" is sent from the admin when someone adds the link where the story went live; it includes a lasting link to the quote card image that only works while the story is approved and published | PRD 14 |
| M7.8 | Every email to the young person or parent ends with its own "Remove my story" link, which never expires. Opening the link shows a confirm button; removing is a separate step so email scanners can't remove a story | PRD 9.3 |
| M7.9 | Removing withdraws the story (and so unpublishes it), marks its assets withdrawn, stops any edit or parent links, and schedules its media for deletion after 30 days | PRD 9.3 |
| M7.10 | The retention sweep runs nightly at 02:30 UK time: media past its deletion date, image files of withdrawn assets, drafts untouched for 30 days (Q12, Q24) and links expired over 7 days. The periods are placeholders in `src/lib/retention.ts` until the DPO confirms (PRD 21). The 12-month review of approved media is not automated | Acceptance criterion 12 |
| M7.11 | Staff downloads: the converted video (MP4) or voice note (M4A), captions built from the transcript's timed lines (two lines at most, cut at the trimmed length) and the poster frame | PRD 12 |

Checks at sign-off: `pnpm lint` clean; `pnpm test` 158 tests pass (unit and integration, including the content pack with a fake model and its fallback, only the agreed channels' assets kept, the approved and published emails with their remove links, the card link, removal and the retention sweep); `pnpm test:e2e` 63 Playwright tests pass at 360, 390 and 1440 pixels, including a content pack for a story shared on Springpod only (snippet and tags, nothing for social), both quote card images at their exact sizes with a 160-character quote (acceptance criterion 11), the MP4, SRT and poster downloads, publishing, and removing a story through the email link; `pnpm build` passes; `npx springpod-audit src --json` reports no drift. Not yet run against the real model (no API key here).

New questions:

29. **Who marks stories as published?** The admin lets any staff member add the published link and email the person. Should it be the content team only? (Default: any staff member.)
30. **Quote card images for every channel.** M7.3 makes the images for every approved pack. If you'd rather only social media stories get them, say so. (Default: every story.)
