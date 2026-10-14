# Copy gaps

Screens, states and messages the prototype doesn't cover. Per `CLAUDE.md`, the build does not write new marketing copy. Each gap gets a plain placeholder in the build, marked `COPY GAP`, until approved copy is added here.

| # | Where | What's needed | Milestone |
|---|---|---|---|
| G1 | Email confirmation landing (`/confirm/[token]`) | Success, expired link, link that doesn't work. The build shows the headings "Email confirmed", "This link has expired" and "This link doesn't work" with a marked placeholder for the next steps | 2 |
| G2 | Resume a saved draft | Message when someone returns on the same device, and the label for the "Start again" link (the build uses "Start again" for now) | 2 |
| G3 | Transcript screen while processing | Upload progress, the transcribing wait, a file the worker couldn't open, and transcription failing. Placeholders: "Sending your video. Keep this page open.", "Turning your video into text…", "We couldn't open that file. Film again, or upload a different file.", "We couldn't turn your video into text. Type what you said below." ("Checking your video…" is from the prototype) | 4 |
| G4 | Upload failure | Offline, upload failed after retries, and a reload part way through sending. Placeholders: "You're offline. We'll carry on sending when you're back online.", "The upload didn't finish. Check your connection and try again." with a "Try again" button, "Your video didn't finish sending. Choose it again.", and on the capture screen "We couldn't start sending your file. Check your connection and try again." | 4 |
| G5 | Interview errors | When the interviewer can't be reached at all. Placeholder: "We couldn't reach the interviewer. Try sending again." (When the AI fails, the fixed questions take over silently: no message) | 3 |
| G6 | Draft generation failure | Message if the draft can't be written and the fallback is used | 5 |
| G7 | Parent or carer decision page (`/parent/[token]`) | Intro, story preview framing, three buttons (Approve, Approve without name, Decline), confirmation for each, expired link | 5 |
| G8 | Remove my story page (`/remove/[token]`) | Confirm step, removed state, already removed | 7 |
| G9 | Edit after changes requested (`/edit/[token]`) | Heading, how the team's message is shown, resubmit confirmation | 6 |
| G10 | Admin: Request changes and Reject dialogs | Titles, field labels, button labels, reason presets for reject (if any) | 6 |
| G11 | Admin: sign-in and access denied | Sign-in page, not on the staff list | 6 |
| G12 | Admin: filters, empty queue, safeguarding view, manual verify control, asset history, downloads | Labels and empty states | 6, 7 |
| G13 | Admin: missing safeguarding lead warning | Banner text when `SAFEGUARDING_LEAD_EMAIL` is not set | 6 |
| G14 | Emails (PRD 14) | All six: confirm email, parent consent request, approved, published, changes requested, safeguarding flag. Subject lines, body, button labels, footer with "Remove my story". The confirm email sends now with a marked placeholder subject and body | 2, 7 |
| G15 | Error pages | 404, 500, rate limited | 8 |
| G16 | Terms text and version | The full text behind "Springpod can use it where I've chosen" and the version stored with consent | 5 |
| G17 | Rate limit message in the interview and draft | When someone hits the limit. Interview placeholder: "Too many messages too quickly. Wait a moment, then try again." | 3, 5 |
| G18 | Submit errors | When sending fails ("We couldn't send your story. Check your connection and try again.") and when there have been too many tries ("Too many tries. Wait a little while, then try again."). Both are placeholders | 2 |
