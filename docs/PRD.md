# Springpod Work Experience Stories: PRD for Claude Code

| | |
|---|---|
| Owner | Ollie Fisher, Chief Marketing and Product Officer |
| Version | 1.0, 14 October 2026 |
| Builder | Claude Code |
| Design source | `design/prototype/springpod-work-experience-stories.html` (working prototype, open in a browser) and `design/screens/` (every screen) |
| Design system | `@springpod/design-system` (Springpod Design System, springpod-design-system.replit.app). The prototype copies its styles by hand; the build must use the package |
| Status | Prototype signed off for build. Open decisions in section 21 |

---

## 1. Summary

Build Work Experience Stories: a mobile-first web app where Springpod students and members of the public share a story about their work experience, and a team backend where Springpod reviews, checks and turns those stories into content.

People tell their story in one of two ways:

1. **Interview me:** an AI interviewer asks 6 to 8 short questions in a chat and writes the story up.
2. **Tell it myself:** they record a voice note, film a video or write it.

Every story becomes a short written story, a pull quote and a branded quote card. The person chooses how their name appears and where the story can be shared. Under-18s need a parent or carer's consent before anything goes public.

The team backend shows a review queue with automated checks, a team checklist that must be complete before a story with media can be approved, and a content pack generator (LinkedIn, Instagram, short video hook, blog intro, website snippet).

The content feeds Springpod's social channels, blog, springpod.com and the Springpod platform.

---

## 2. Users and goals

| User | Who | What they need |
|---|---|---|
| Springpod student | Used a Springpod programme | Quick way to share; story labelled "Verified by Springpod" |
| Student | School, college or uni work experience elsewhere | Same flow; story labelled "Community story" |
| Apprentice or early career | First job or apprenticeship | Same flow, plus "what are you doing now" |
| Working professional | Telling their first job story | Same flow; often has a strong "then and now" angle |
| Parent or carer | Of a 14 to 17 year old | A clear email to approve or decline public use |
| Springpod content team | Marketing and moderators | A queue, checks they can trust, and ready-to-post assets |

Ages: open to 14 and over. Under 14 is blocked with a friendly message.

Success measures (to baseline after launch):

- Start to submit completion rate (target 40%+ on mobile).
- Share of submissions approved for at least one channel.
- Median time from submission to approval.
- Stories published per month by channel.

---

## 3. Scope

### In scope

- The public submission flow in section 5, one question per screen, mobile first.
- All four capture modes: AI interview, written, voice note, video (section 6).
- Client-side media checks and server-side media processing (section 7).
- AI drafting with three quote options and a quote card preview (section 8).
- Consent, parental consent and safeguarding (section 9).
- Passwordless email confirmation for submitters (magic link).
- Team backend at `/admin`: queue, detail, automated checks, team checklist, status workflow, content pack (sections 11 and 12).
- Transactional emails (section 14).
- Tracking events (section 16).

### Out of scope (this phase)

- Rewards. No rockets, points or badges anywhere in this product.
- Logged-in Springpod platform integration, beyond matching a Springpod student to a completed programme (section 10.3).
- Publishing directly to social platforms or the CMS. The backend produces assets to copy or download.
- Employer self-serve review portal (partner approval is tracked manually in this phase).
- Native mobile apps.
- Video editing, trimming in the browser or auto-generated clips.

---

## 4. Stack and architecture

Proposed; confirm against Springpod's current platform stack before milestone 1 (section 21).

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router), TypeScript strict | One app for public flow, API routes and admin |
| UI | `@springpod/design-system` components and tokens, Tailwind v4 | Source of truth for Springpod UI. Never hand-build a component the package ships |
| Database | Postgres with Prisma | Relational data, audit trail |
| File storage | S3-compatible bucket, private, UK or EU region | Video and audio are personal data |
| Uploads | Presigned, resumable uploads direct from the browser (tus or S3 multipart) | Phone videos are large and connections drop |
| Media worker | Background job queue (for example BullMQ on Redis, or a jobs table polled by a worker) running ffmpeg | Duration, loudness, frames, thumbnails, audio extraction |
| Transcription | Speech-to-text API with UK English and timestamps (choice in section 21) | Voice notes and videos |
| AI | Anthropic Claude API | Interview, drafting, quote options, content pack, pre-screen |
| Email | Transactional email provider (choice in section 21) | Magic links, parent consent, status updates |
| Auth | Submitters: magic link. Admin: Springpod staff single sign-on (Google Workspace) with role check | No passwords for the public |
| Tests | Vitest for logic, Playwright for flows | Acceptance criteria in section 20 are testable |
| Package manager | pnpm | |

Architecture rules:

1. The public flow is client-rendered screens driven by one question config (section 5.3). Adding, removing or reordering a question must be a config change, not new screen code.
2. All AI calls happen on the server. API keys never reach the browser.
3. Media never passes through the app server. Browser uploads to storage with a presigned URL, then the worker processes it.
4. Every state change on a story (submitted, consent received, checks run, status changed, asset generated) writes an audit event.
5. A draft submission is saved server-side after each answer (keyed to the device and, once given, the email) so people can resume.

---

## 5. The public flow

### 5.1 Layout

- Mobile first. One question per screen. Designed at 390px; works from 360px to 1440px.
- Header: Springpod logo (full colour on light, all-white in dark mode, 150px minimum width) and "Work Experience Stories".
- Top of each question: back arrow, progress bar split into four chapters (About you, Experience, Your story, Sharing), chapter name under it.
- One primary button, full width, pinned to the bottom of the screen within thumb reach. Secondary actions are smaller buttons or text links, never full width (design system rule).
- Single-choice answers advance on tap after a 260ms pause so the selection registers. Text answers advance on Continue or the keyboard's Next key.
- Validation on press, not by greying out the button. The message says what's missing ("Write at least 40 words (you have 22)").
- Desktop: a single centred column, max 520px. Questions sit in a white card sized to its content, with the button under the answers. Start screen is a centred navy box.

Screens: `design/screens/01` to `27` (phone), `40` and `41` (desktop). Full-length screenshots show sticky bars mid-page; that is the screenshot, not the layout.

### 5.2 Start screen (`01-start`)

One navy (Space Cadet) box containing, top to bottom:

1. A looping stack of example story cards, tagged "Example stories". A new card every 3.6 seconds; the next card peeks behind; dots show position; tap to skip. Three card types:
   - Video: portrait fills the card, play button, subtitle, progress bar, duration.
   - Voice note: avatar, animated waveform, play button, duration, quote.
   - Written: large quote, avatar, name and details.
2. Title "Share your work experience story".
3. Line "Your first taste of work could help someone else take theirs."
4. Three points with icons: About 5 minutes; Write it, record a voice note or film a video; You choose where it's shared.
5. Teal button "Start my story".

Rules: example cards use stock photos and invented names in the prototype. Keep the "Example stories" tag until they are replaced by real, approved, consented stories pulled from the database. Respect `prefers-reduced-motion` (show the first card, no loop).

### 5.3 Question config

Build the flow from a typed config: id, kind, chapter, title, sub, options, `when` (show condition), validation and copy. Order and conditions:

| # | id | Chapter | Kind | Question | Options or input | Shown when | Validation |
|---|---|---|---|---|---|---|---|
| 1 | who | About you | single | Which best describes you? | Springpod student; Student; Apprentice or early career; Working professional (each with a sub-line) | Always | Required |
| 2 | age | About you | single, 2x2 tiles | How old are you? | Under 14; 14 to 17; 18 to 24; 25 or over | Always | Under 14 goes to a stop screen |
| 3 | name | About you | text | What's your first name? | First name | Age 14+ | Required |
| 4 | exp | Experience | single | What kind of experience was it? | School work experience week; Internship; Apprenticeship; Part-time or Saturday job; Volunteering; Insight day or event; My first job | Not shown to Springpod students (set to Springpod virtual programme) or professionals (set to My first job) | Required |
| 5 | role | Experience | text | What area or job was it in? | Free text | Always | Required |
| 6 | org | Experience | text, optional | Which organisation was it with? | Free text, Skip allowed | Always | Optional |
| 7 | now | Experience | single | What are you doing now? | At school; At college or sixth form; At university; On an apprenticeship; Working; Something else | Always | Required |
| 8 | nowRole | Experience | text | What's your current role? / What's your apprenticeship? | Free text | now is Working or Apprenticeship | Required |
| 9 | nowCo | Experience | text, optional | Where do you work? | Free text | as 8 | Optional |
| 10 | nowInd | Experience | single, tiles | Which industry is that in? | 11 industries (section 21: confirm list) | as 8 | Required |
| 11 | mode | Your story | single | How do you want to tell your story? | Interview me; Tell it myself | Always | Required |
| 12 | format | Your story | single | How would you like to tell it? | Voice note; Video; Write it | mode is Tell it myself | Required |
| 13 | guide | Your story | guidance | How to film a great video / How to record a great voice note | Section 6.3 | format is voice or video | |
| 14 | story | Your story | capture | Interview chat, writing box, or record and checks | Section 6 | Always | Mode-specific |
| 15 | transcript | Your story | text | Check your transcript | Editable transcript | format is voice or video | 20 words minimum |
| 16 | draft | Your story | review | Here's your story. Does it sound like you? | Headline, story, quote picker, skills | Always | |
| 17 | display | Sharing | single + card preview | How should your name appear? | First name; First initial; No name | Always | Required |
| 18 | showCo | Sharing | single + card preview | Can we say you work at [company]? | Yes, show it; No, just my role | A company was given in 9 | Required |
| 19 | channels | Sharing | multi | Where can we share it? | On Springpod; On springpod.com; On our blog; On social media; Select all | Always | At least one. None pre-ticked |
| 20 | email | Sharing | email | What's your email? | Email | Always | Valid email |
| 21 | parent | Sharing | email | What's your parent or carer's email? | Email | Age 14 to 17 | Valid, different from 20 |
| 22 | confirm | Sharing | checkboxes | Almost done. Please confirm. | "This is my own experience..." (required); "Email me early careers opportunities" (optional, unticked) | Always | First box required |
| 23 | done | | result | Thanks, [name]. Your story is in. | What happens next, skills, quote card, Share another story | | |

The exact copy for every screen is in the prototype. Use it as written; flag any gaps in `docs/copy-gaps.md` rather than writing new marketing copy.

### 5.4 Quote card

The card appears in the draft, display and showCo screens and on the done screen. It is also a downloadable social asset in the backend.

- Space Cadet background with a soft teal glow, always navy in both themes.
- Top: teal quote mark; tag "Verified by Springpod" or "Community story".
- Quote in IBM Plex Serif. Size by length: 26px up to 70 characters, 21px up to 120, 18px above. Never clip; the card grows.
- Footer: initial avatar, display name, "then" line (experience and area), "Now [role] at [company]" in teal when given and allowed, white rocket mark.

---

## 6. Story capture

### 6.1 Interview me (`27-interview`)

- Messaging-style chat. Interviewer avatar is the white rocket on navy. Typing indicator while waiting.
- "Question n of about 6" and a story strength meter (Getting started, Good, Strong, Brilliant) that rewards length and specific answers.
- Quick replies above the input: "Ask it differently", "Skip this one", and after 3 answers "I'm done, write it up".
- The interviewer follows `docs/ai-prompts.md` section 1: one question at a time, 25 words or fewer, follows up on vague answers, never asks for surnames, schools or contact details, ends after 6 to 8 questions with `[[END]]`.
- Safeguarding: if an answer suggests harm or unsafe treatment, the interviewer responds kindly, signposts a trusted adult or the organiser, ends the interview, and the submission is flagged `safeguarding_review` (section 9.4).
- Minimum 3 answers to continue.
- Streaming responses. A fixed fallback question list (in the prototype) is used if the AI call fails.

### 6.2 Write it

- One large text box with a prompt line (what you did, one moment, what was hard, your advice).
- Live word count, "150 to 400 works best", minimum 40 words.

### 6.3 Voice note and video guidance (`14-video-guide`, `25-voice-guide`)

Shown before capture, with a "See all tips" link back to it from the capture screen.

Video tips: hold your phone upright; face a window; camera at eye level; find somewhere quiet; aim for 30 to 90 seconds; keep it safe to share (no other people's faces, no school uniform or logos, nothing confidential from the workplace like screens, documents or ID badges).

Voice note tips: find a quiet room; phone a hand's width (15 cm) away; aim for 1 to 3 minutes; speak a little slower than normal; keep it safe to share (first names only, no school or address, nothing confidential).

Prompt card (navy): What did you actually do? One moment that stood out. What was harder than you expected? Your advice for someone starting out. Plus a suggested opening line and "screenshot this card to use as prompts while you record".

### 6.4 Capture (`15-video-capture`)

Two large tiles:

- "Film now" / "Record now": `<input type="file" accept="video/*" capture="user">` or `accept="audio/*" capture`. Opens the phone camera or recorder.
- "Upload a file": the same input without `capture`.

Phase 2 option (section 21): in-browser recording with MediaRecorder, a countdown, a teleprompter of the four prompts and a 90-second timer. Not required for this phase.

### 6.5 Checks screen (`16-video-checks`, `26-voice-checks-fail`)

After a file is chosen: preview player, a verdict banner, and a list of checks that resolve one by one (pass, warning, fail, each with a plain fix).

- All pass: "Looks great." Primary "Use this video". Secondary "Film again".
- Warnings only: "Good to go." Same buttons.
- Any fail: "Let's try that again." Primary "Film again" / "Record again". Secondary "Upload a different file". Cannot continue.

Start the resumable upload as soon as the file is chosen and checks are not failing, so it runs while the person checks the transcript.

### 6.6 Transcript (`17-transcript`)

Show the server transcript, editable, with "Fix anything we misheard, especially names and places." Minimum 20 words. Keep the original transcript and the edited one.

---

## 7. Media checks

### 7.1 In the browser (instant feedback)

Implement as pure functions with unit tests. Thresholds:

| Check | Video | Voice note |
|---|---|---|
| File type | `video/*` or mp4, mov, m4v, webm, 3gp | `audio/*` or m4a, mp3, wav, aac, ogg, webm, caf, amr, 3gp |
| Length | Fail under 10s. Pass 10 to 90s. Warn 90 to 120s ("we'll use the first 1:30"). Fail over 120s | Fail under 20s. Pass 20s to 3:00. Warn to 3:15. Fail over 3:15 |
| File size | Fail over 250 MB | Fail over 25 MB |
| Orientation | Portrait or square pass; landscape warns | |
| Picture quality | Short side 720px+ pass; 480 to 719 warn; under 480 warn | |
| Lighting | Average brightness of frames at 25% and 60%: under 55 warns (too dark), over 225 warns (too bright) | |
| Sound | No audio track or silent: fail. RMS under -38 dBFS: warn quiet. Clipping over 0.2% of samples: warn | Volume: peak under 0.05 fail; RMS under -40 dBFS warn. Clarity: clipping warn. Talking time: over 60% silent half-second windows warns |

If the browser can't decode the file (some formats on some browsers), the check shows a warning "We'll check it after you send it", never a false fail. The server checks are authoritative.

### 7.2 On the server (authoritative)

The worker runs after upload:

1. ffprobe: container, codecs, duration, dimensions, rotation, audio track present.
2. Loudness (EBU R128) and clipping; silence ratio.
3. Brightness from sampled frames; blur score.
4. Normalise for playback: H.264/AAC MP4 (video), AAC M4A (audio); poster frame; waveform JSON.
5. Transcribe with timestamps; store transcript and confidence.
6. AI pre-screen of the transcript (section 9.4).
7. Phase 2 (section 21): face count per sampled frame to flag other people; logo and text detection to flag uniforms, badges and screens.

Store every result on the media record. The admin shows both browser and server results; server wins where they differ.

---

## 8. Draft and quote

- Generated on the server from the interview transcript, written story or media transcript using `docs/ai-prompts.md` section 2.
- Output: headline, story (180 to 280 words), three quote options, pull quote, up to four skills, advice line, sector.
- Quote options must be about a specific moment, feeling, surprise or lesson. Never a "what and when" summary. If AI fails, pick quotes with the scoring function in the prototype (`pickQuotes`).
- The person can edit the headline and story, choose one of three quotes (card preview updates live) or write their own (max 160 characters).
- "Try a different version" regenerates with a different angle; "Go back to previous version" restores the last one, including edits.

---

## 9. Consent, privacy and safeguarding

### 9.1 Age

- Under 14: blocked. No data saved beyond an anonymous count.
- 14 to 17: parent or carer email required. The story stays private (cannot be approved for any channel) until the parent approves through a signed link. Parent can approve, decline, or approve with "No name" only.
- 18+: their own consent.

### 9.2 Consent capture

Store per story: channels chosen, name display choice, show-company choice, terms text version and timestamp, marketing opt-in (separate, unticked by default), parent consent status and timestamp. Never pre-tick channels or marketing.

### 9.3 Data minimisation and rights

- Collect first name only. Never ask for surnames, schools or addresses.
- Emails are stored for the submitter account and the parent consent record only; they are never shown in the content queue or exported with assets.
- Withdrawal: every email has a "Remove my story" link. Removal unpublishes, deletes media within 30 days and marks assets withdrawn.
- Retention: rejected and withdrawn media deleted after 30 days; approved media kept while published, reviewed every 12 months (confirm with DPO, section 21).
- UK GDPR and the Children's Code apply. Run a DPIA before launch (section 21).

### 9.4 Safeguarding and moderation

- AI pre-screen on every transcript and story (`docs/ai-prompts.md` section 4): personal data (surnames, schools, phone numbers, addresses, handles), named third parties, harmful or concerning content, defamatory or negative claims about a named organisation.
- Any safeguarding concern sets `safeguarding_review`, removes the story from the normal queue, and notifies the designated safeguarding lead by email. No automated publishing ever.
- A named organisation triggers "Partner approval needed before use on their channels". Negative stories about a named organisation are anonymised or kept off brand channels.

---

## 10. Submission lifecycle

### 10.1 Statuses

`draft` (in progress) → `submitted` → `awaiting_email` (magic link not yet confirmed) → `awaiting_parent` (14 to 17) → `in_review` → `approved` | `changes_requested` | `rejected`. Plus `safeguarding_review` and `withdrawn`.

### 10.2 Trust label

- "Verified by Springpod" when the submitter's email matches a Springpod account with a completed programme (section 10.3).
- "Community story" otherwise. Shown on the card and in the queue.

### 10.3 Springpod match

Phase 1: a server-side lookup by confirmed email against the Springpod platform (API contract to agree, section 21). If no API is ready, the team can mark a story verified manually in the admin.

---

## 11. Team backend (`/admin`, `42-admin-queue-video-checks`)

Access: Springpod staff only, by SSO, with roles `moderator` (review, checklist, status) and `content` (also content pack). Not linked from the public site.

### 11.1 Queue

- List with status chip, headline, name shown, experience, format, date. Filters: status, format, trust label, age band, channel, has media, safeguarding. Search by headline or story text.
- Counts: to review, approved, total.

### 11.2 Story detail

- Trust label, status, headline.
- Facts: name shown, age band, experience, organisation, area, now (role, company with "(not public)" when hidden, industry), submitted as, channels, parent consent.
- Flags (section 9.4) as coloured notices.
- Story text, skills.
- Media: player, transcript, then "Video checks" or "Voice note checks" with the automated results (section 7) and a team checklist:
  - Video: no other people can be identified; no school uniform, badges or logos; nothing confidential on screen; audio clear enough for captions; content matches the written story; consent and age checks match.
  - Voice note: no other people named in full; no school or home address mentioned; nothing confidential about the workplace; audio clear enough to use as a clip; content matches the written story.
- Actions: Approve, Request changes (with a message emailed to the submitter), Reject (with a reason).
- **Approve is disabled** while parent consent is pending, while a safeguarding review is open, or until every team checklist item is ticked for stories with media. Each tick is saved with the user and time.

### 11.3 Content pack (section 12)

---

## 12. Content pack

- Generated on request from an approved or in-review story using `docs/ai-prompts.md` section 3.
- Assets only for the channels the person agreed to: LinkedIn post, Instagram caption, short video hook with four shots, blog title and intro, website snippet, five tags.
- Quote card as PNG in two sizes (1080x1350 and 1080x1920), rendered server-side from the same component.
- Copy buttons on every asset; "Regenerate"; asset history kept.
- Approved video: download the normalised MP4, the transcript as SRT for captions, and the poster frame.

---

## 13. Data model

| Entity | Key fields |
|---|---|
| Submitter | id, email (unique), email_confirmed_at, springpod_user_id (nullable), created_at |
| Story | id, submitter_id, status, who, age_band, first_name, display_choice, exp_type, area, organisation, now_status, now_role, now_company, now_industry, show_company, mode (interview, self), format (interview, write, voice, video), headline, story, pull_quote, quote_options[], skills[], advice, sector, trust_label, created_at, submitted_at, updated_at |
| Consent | story_id, channels[], terms_version, accepted_at, marketing_opt_in, parent_email, parent_status (not_needed, pending, approved, approved_anonymous, declined), parent_decided_at |
| InterviewTurn | story_id, role, content, created_at |
| Media | id, story_id, kind (voice, video), storage_key, original_name, size_bytes, duration_s, width, height, browser_checks (json), server_checks (json), transcript_raw, transcript_edited, transcript_confidence, poster_key, normalised_key, status |
| Flag | story_id, type (personal_data, named_org, safeguarding, negative_named_org), detail, source (ai, team), resolved_by, resolved_at |
| Review | story_id, checklist (json, item to {by, at}), decision, reason, decided_by, decided_at |
| Asset | id, story_id, kind (linkedin, instagram, video_hook, blog, snippet, tags, quote_card_4x5, quote_card_9x16), content or storage_key, created_by, created_at |
| AuditEvent | story_id, actor (submitter, parent, staff id, system), action, payload, created_at |

---

## 14. Emails

| Trigger | To | Content |
|---|---|---|
| Submit | Submitter | Confirm your email (magic link). What happens next |
| Submit, age 14 to 17 | Parent | Who submitted, the story text and quote card, channels chosen; Approve, Approve without name, Decline. Link valid 14 days |
| Approved | Submitter | Your story is approved; where it may appear; Remove my story link |
| Published (manual trigger from admin) | Submitter | Link to share, quote card download |
| Changes requested | Submitter | Team message, link to edit |
| Safeguarding flag | Safeguarding lead | Story link in admin, no story content in the email |

Plain, short, British English, no em dashes. Copy to write; list in `docs/copy-gaps.md`.

---

## 15. Design system and UI rules

- Use `@springpod/design-system`. Before writing any UI, search the package for the component that does the job. Relevant components: `ui/form-select-button` (answer options, single and multiple), `ui/button` (one primary per screen; teal colourway for send and start on navy), `ui/input`, `ui/progress` or `ui/stepper`, `ui/badge` and `ui/pill`, `ui/card`, `ui/alert` and `ui/info-banner`, `ui/avatar`, `ui/table` (admin), `ui/checkbox`.
- Never hard-code colours, spacing, radii or shadows; use tokens. Values used in the prototype, for reference: Space Cadet navy #16254c, teal #00a5ac, teal 800 #10707a, form select selected #0bb3b7 with navy text, unselected #e0e5ea with #43506f text, button radius 12px, form select radius 5px, card radius 24px.
- Fonts: Poppins for UI, IBM Plex Serif for story and quote text, IBM Plex Mono for durations and counts. Fonts ship with the package.
- Logo: full colour on light, all-white on navy or in dark mode, 150px minimum, never recoloured (files in `design/assets/`).
- Run the design system drift audit (`npx springpod-audit <dir> --json`) before each milestone sign-off.
- Light and dark themes. The quote card and start box stay navy in both.

---

## 16. Tracking

`track(event, payload)` helper, console in development, pointed at GA4 in production.

| Event | When | Payload |
|---|---|---|
| `story_start` | Start my story | entry source (utm) |
| `question_answered` | Each screen completed | question id, chapter, value for single-choice (never free text) |
| `story_blocked_under14` | Age under 14 | |
| `mode_selected` / `format_selected` | 11, 12 | value |
| `media_checks_result` | Checks finish | format, verdict, failed check ids |
| `media_retry` | Film or record again | format, reason |
| `draft_generated` / `draft_regenerated` | 16 | |
| `quote_selected` | 16 | option index or custom |
| `story_submitted` | Done | mode, format, age band, channels count |
| `email_confirmed` / `parent_decision` | Links | decision |
| `admin_status_changed`, `content_pack_generated` | Admin | status, asset kinds |

Funnel report: start, each chapter, submit, confirmed, approved.

---

## 17. Accessibility and performance

- WCAG 2.2 AA. Touch targets 44px+. Visible focus. Answer groups use the form select button keyboard model (arrow keys, Enter, Space, Home, End). `aria-live` for chat, checks and errors.
- Respect `prefers-reduced-motion`: no carousel loop, no confetti, no animated bars.
- Works on iOS Safari 16+ and Android Chrome. Test the camera and recorder inputs on real devices.
- Lighthouse mobile: Performance 85+, Accessibility 95+.
- Start screen images are optimised (AVIF/WebP, under 30 KB each).

---

## 18. Copy rules

- British English. No em dashes (lint fails the build on U+2014 in copy and prompts). No emojis in UI.
- Plain, specific, friendly. Buttons start with a verb.
- Never promise publication, a job or a reward.
- Product name: "Work Experience Stories". Trust labels exactly "Verified by Springpod" and "Community story".

---

## 19. Build order

Work in milestones. At the end of each, run the checks, show the result and wait for approval before starting the next.

| # | Milestone | Done when |
|---|---|---|
| 0 | Plan | You have read this PRD, `CLAUDE.md`, `docs/ai-prompts.md`, the prototype and screenshots, and written `docs/build-plan.md` (file structure, components from the design system, data model, open questions). No code |
| 1 | Foundation | App, design system installed, header, flow engine driven by the question config, progress, back, validation pattern, start screen with example reel. Clicking through every question works with no capture yet |
| 2 | Data and accounts | Prisma schema (section 13), draft autosave, submit, magic link, statuses, audit events |
| 3 | Write and interview | Write mode; interview chat with streaming Claude responses, fallback questions, story strength, safeguarding end |
| 4 | Media | Guidance, capture, browser checks with unit tests, resumable upload, worker (probe, loudness, frames, normalise, transcribe), transcript screen |
| 5 | Draft, quote and consent | Draft generation, three quotes, quote card component, display, showCo, channels, email, parent flow, confirm, done |
| 6 | Admin | SSO, roles, queue and filters, detail, flags, AI pre-screen, team checklist, approve gating, request changes, reject |
| 7 | Content pack and emails | Content pack, quote card PNG render, video and SRT downloads, all emails in section 14 |
| 8 | Polish and acceptance | Responsive and accessibility pass, real-device camera tests, Lighthouse, tracking, every criterion in section 20 checked and reported |

---

## 20. Acceptance criteria

1. Every screen in `design/screens/` exists and matches the prototype in structure, copy and order at 390px, using design system components.
2. The flow is driven by one question config; changing a `when` condition changes the flow with no other code change (unit test).
3. Under 14 cannot submit. 14 to 17 cannot be approved for any channel until a parent approves through the signed link.
4. No channel, marketing opt-in or consent box is pre-ticked.
5. Browser media checks match the thresholds in 7.1 (unit tests per row, including undecodable files giving a warning, not a fail).
6. A 200 MB portrait video uploads from a phone on a throttled 4G profile, survives a dropped connection, and resumes.
7. Server checks, transcript and normalised media appear in the admin within 2 minutes of upload for a 90-second video.
8. Approve is disabled while parent consent is pending, a safeguarding review is open, or any team checklist item is unticked for a story with media (Playwright).
9. The AI interviewer never asks for surname, school or contact details across a 30-run red-team script, and ends with signposting on a harm scenario.
10. Content pack only contains assets for channels the person agreed to.
11. Quote card text never clips at 18px for a 160-character quote.
12. Emails, emails' remove link, and withdrawal work end to end; withdrawn media is deleted by the retention job.
13. No em dashes in copy or prompts (lint). `pnpm build` passes with no type or lint errors. Design system drift audit passes.
14. Lighthouse mobile: Performance 85+, Accessibility 95+.

---

## 21. Open decisions

Do not resolve these in the build. Keep a placeholder and list them in the final report.

| Item | Proposal | Owner |
|---|---|---|
| Hosting and stack fit with the current Springpod platform | Next.js app as above unless platform team prefers otherwise | Product and engineering |
| Transcription provider | One with UK English, timestamps, and UK or EU data processing | Engineering |
| Email provider | Use Springpod's existing transactional provider | Engineering |
| Springpod account matching API for "Verified by Springpod" | Email lookup endpoint returning completed programmes | Engineering |
| Industry list (11 options) | Replace with Springpod's sector taxonomy if one exists | Product |
| Retention periods and DPIA | 30 days for rejected or withdrawn media; 12-month review of approved | DPO |
| Designated safeguarding lead and process | Named lead receives flags | Ops |
| Partner approval process for named employers | Manual in this phase; portal later | Partnerships |
| In-browser recording with teleprompter (phase 2) | MediaRecorder with prompts and timer | Product |
| Face, logo and screen detection on video (phase 2) | Flags only, never auto-reject | Product |
| Should the interview also accept voice-note answers | Prototype is text only | Product |
| Replace example stories on the start screen with real approved stories | Pull 6 approved stories with explicit consent for website use | Marketing |
| Stock photo licence for any example imagery kept | Unsplash licence; credit in `design/assets/CREDITS.md` | Marketing |

---

## 22. Files in this pack

| Path | What it is |
|---|---|
| `README.md` | What this pack is and how to start |
| `CLAUDE.md` | Standing rules for Claude Code in this repo |
| `KICKOFF_PROMPT.md` | The first message to paste into Claude Code |
| `docs/PRD.md` | This document |
| `docs/ai-prompts.md` | Interviewer, drafting, content pack and pre-screen prompts |
| `design/README.md` | How to read the prototype and screenshots |
| `design/prototype/springpod-work-experience-stories.html` | The working prototype. Open in a browser. Add `#admin` to the URL for the team backend |
| `design/screens/` | Screenshot of every screen (phone 01 to 27, desktop 40 to 42) |
| `design/assets/` | Springpod logos (colour, navy, white) and the six example portraits with credits |
