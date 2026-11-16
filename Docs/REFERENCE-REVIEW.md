# Reference review — 2026-11-16

Source: the user's three videos in Drive folder `1kaSsqA1c3jj7hpR_9N2PKzQ6EIAWP239`.
Original videos stay outside the source repository. Contact sheets were inspected;
all audio was machine-transcribed locally with Whisper small, Russian, int8. The
transcript is an aid to feature review, not proof of perceived voice quality or an
error-free verbatim record. No user video was sent to a transcription service.

## Observed expectations

| Reference | Evidence | Implication for this app |
| --- | --- | --- |
| `v1c044g50000dbdp57vog65gsmf2lq1g.mp4` (54.4 s) | Around 4–18 s: desktop companion, offline block-based commands and a redesigned interface. Later: costume changes and appearing inside games. | Character, offline actions and interaction polish matter together. Game embedding and system-wide desktop overlays are separate platform work, not ordinary iOS capabilities. |
| `v1c044g50000db1tht7og65pfi5egn6g.mp4` (60.8 s) | Around 10–24 s: a study-mode command, movement and model selection. Around 28–39 s: optional neural network and plugins. | Simple explicit actions should work with no LLM configured. Multiple authored motions, character selection and richer automations are still missing. |
| `v1c044g50000dbgdv5nog65ke921tcqg.mp4` (43.7 s) | Early: cloud voice library visible as Fish Audio; multiple voice examples. Around 25–36 s: local voices and voice-file import. | Installed Apple voice selection is only a baseline. High-quality local/cloud voices and import are separate unfinished features. No reference voice identity has been cloned. |

## Changes guided by this review

- Explicit note/reminder phrases route to an action preview before the LLM setup
  check. The rebuilt conversation sends explicit web searches directly to Tavily
  and preserves source excerpts and links.
- Only the confirmation button executes a note/reminder action. Cancellation leaves the draft
  intact. Successful actions, rather than model claims, produce history entries.
- Reminder dates are selected and confirmed in the form; natural-language date
  extraction is not claimed. Search still requires an internet connection.
- Speech mouth movement is driven by actual PCM playback, including silence,
  interruption and completion. It is not phoneme articulation.
- Character scene and status use separate vertical space so the status no longer
  needs to cover the feet. Native screenshot review is required for each change.

## Remaining quality gap

The reference character has authored full-body acting, varied gestures, expressive
speech and polished character/voice selection. The current Vita candidate now has original keyframed torso/arm/hand/gaze clips,
plus pelvis weight shifts and dips with planted-foot leg IK. Broader acting variety
and character selection remain unfinished; speech still uses an amplitude-driven jaw and system TTS. Do not call
that comparable solely because CI passes. A recorded comparison on the actual target
phone is required before user delivery, along with the remaining QUALITY.md gates.
