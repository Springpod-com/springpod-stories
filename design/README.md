# Design files

## Prototype

`prototype/springpod-work-experience-stories.html` is a single-file working prototype. Open it in Chrome or Safari.

- The public flow starts at the start screen. Every screen, branch and validation works.
- Add `#admin` to the end of the URL for the team backend (queue, detail, checks, team checklist, content pack).
- Outside Claude, AI calls fall back to fixed interview questions and simple drafts. That is expected; the build calls the Claude API from the server (`docs/ai-prompts.md`).
- Voice note and video checks run for real in the browser on the file you pick. The transcript is sample text in the prototype.
- Submissions are not saved outside Claude. The admin shows three example stories plus anything you submit in the same session.
- The prototype copies design system styles by hand. The build must use `@springpod/design-system` components and tokens.

## Screens

`screens/` has a PNG of every screen at 390px (phone, 2x) unless named desktop.

| File | Screen |
|---|---|
| 01 | Start screen with example stories |
| 02 to 04 | About you: who, age, first name |
| 05 to 11 | Experience: type, area, organisation, what now, current role, company, industry |
| 12 to 13 | Interview me or Tell it myself; then voice note, video or write |
| 14 to 17 | Video: guidance, capture, checks (all pass), transcript |
| 18 | Draft with quote picker and live quote card |
| 19 to 23 | Sharing: name display, show company, channels, email, confirm |
| 24 | Done |
| 25 to 26 | Voice note: guidance, checks with failures |
| 27 | AI interview |
| 40 to 41 | Desktop: start, question card |
| 42 | Admin: queue and story detail with video checks and team checklist |

Full-length screenshots show the pinned bottom button part-way down the image. On a phone it sits at the bottom of the screen.

## Assets

- `assets/springpod-logo.png`: full colour, for light backgrounds.
- `assets/springpod-logo-navy.png`: single colour navy.
- `assets/springpod-logo-white.png`: all white, for navy, teal or dark mode.
- `assets/portraits/`: six Unsplash portraits used for the example story cards. See `assets/CREDITS.md`.

Logo rules: 150px minimum width on screen, never recolour, rotate or recompose.
