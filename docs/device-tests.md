# Real phone tests

PRD 17 asks for the camera and recorder inputs to be tested on real devices; acceptance criterion 6 asks for a 200 MB upload from a phone. Emulated versions of these pass in the automated tests (`docs/acceptance.md`), but phones behave differently, so these need a person with the phones.

Run against a staging deployment with HTTPS (camera and microphone access need a secure page). Record a result for each row: pass, or what happened.

## Phones

| Phone | Browser | Tester | Date |
|---|---|---|---|
| iPhone on iOS 16 | Safari | | |
| iPhone on the latest iOS | Safari | | |
| Android phone, recent | Chrome | | |
| Small Android phone (about 360 pixels wide) | Chrome | | |

## Video

| # | Step | Expect | Result |
|---|---|---|---|
| V1 | Choose Video, then "Film now" | The phone's camera opens, front camera first | |
| V2 | Film 30 to 60 seconds in portrait, facing a window, and use it | Checks pass; the video plays back on the checks screen | |
| V3 | Film about 5 seconds | Length fails with "a bit short"; "Film again" opens the camera | |
| V4 | Film in landscape | Orientation tip about portrait | |
| V5 | Film in a dark room | Lighting tip | |
| V6 | "Upload a file" and pick a video from the gallery | The picker opens; checks run on the chosen video | |
| V7 | "Use this video", then wait on the transcript screen | Upload progress shows; the transcript appears and can be edited | |
| V8 | Send the story and open it in the admin | The video plays; checks and transcript show | |

## Voice note

| # | Step | Expect | Result |
|---|---|---|---|
| A1 | Choose Voice note, then record | The phone's recorder opens (on iPhone, Safari offers its recording options) | |
| A2 | Record 30 seconds, speaking normally | Checks pass; the voice note plays back | |
| A3 | Record whispering | Volume fails with the fix text | |
| A4 | Upload a voice memo from the phone | Checks run; the transcript appears | |

## Large upload over mobile data (acceptance criterion 6)

| # | Step | Expect | Result |
|---|---|---|---|
| U1 | On 4G (wi-fi off), upload a portrait video of about 200 MB (about 90 seconds filmed at 1080p, or 4K for 30 to 40 seconds) | Upload progress moves steadily | |
| U2 | About a third of the way in, turn on flight mode for 20 seconds, then turn it off | The upload pauses, then carries on from where it was (it doesn't start again) | |
| U3 | Lock the phone for 30 seconds during the upload, then unlock | The upload carries on, or picks up again within a few seconds | |
| U4 | Time from the upload finishing to the video, checks and transcript showing in the admin | Under 2 minutes | |

## Accessibility on the phone

| # | Step | Expect | Result |
|---|---|---|---|
| X1 | VoiceOver (iPhone) through the whole flow | Each question is read when it appears; answers are announced as radio buttons; errors are read out | |
| X2 | TalkBack (Android) through the whole flow | As X1 | |
| X3 | Turn on Reduce Motion, open the start screen | The example stories stay still until tapped | |
| X4 | Largest text size | Nothing overlaps or is cut off; no sideways scrolling | |
