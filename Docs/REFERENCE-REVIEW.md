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

## User-selected cream direction — 2026-11-17

The user selected the light cream version visible around 12–16 seconds in the first
video. That reference has warm paper-like surfaces, thin rounded controls, muted
accents and a character sharing the workspace. The mobile adaptation now uses those
colors/material roles, a larger character and a compact conversation dock; optional
forms open separately. This follows the user's request to prioritize automatic
conversation, rather than copying the desktop block-editor layout onto a phone.
The user subsequently confirmed that they really like Vita. Character appearance is now selected; retain the current model and renderer presentation while refining the interface.

## Interface refinement after character approval — 2026-11-17

The user approved the character and said the interface is much better but still
unlike the video. Refinement therefore preserves the entire renderer and model:
compact grouped navigation replaces the large header treatment; small rectangular
paper cards replace centered display headings; the conversation controls use softer
rounded rectangles and a subtle footer, following the reference's panel hierarchy.
Commands and Settings are functional native destinations. Status labels reflect
selection/capture state, not fictitious connections. The browser preview remains
an approximation; no native result or complete reference parity is claimed.

## Latest reference-function pass

The current code now includes ordered routine blocks, a persistent study timer,
optional Fish Audio voice library, and import/selection of self-contained VRM
characters/costume variants. Vita remains selected by default. See
[implementation and validation boundaries](DUO-AND-REFERENCE-FEATURES.md).
Desktop plugins, embedding inside other games, arbitrary local TTS checkpoint import
and full motion/phoneme parity remain unfinished; they must not be inferred from
new navigation entries or preview screenshots.

## Remaining quality gap

The reference character has authored full-body acting, varied gestures, expressive
speech and polished character/voice selection. The current Vita candidate now has original keyframed torso/arm/hand/gaze clips,
plus pelvis weight shifts and dips with planted-foot leg IK. A new [compositional library](PERFORMANCE-LIBRARY.md) adds 13,824 selectable gesture/emotion/gaze/stance combinations, not independent clips. Native validation of these performances and imported characters remains unfinished;
speech uses an amplitude-driven jaw with system TTS or the new optional Fish Audio path. Do not call
that comparable solely because CI passes. A recorded comparison on the actual target
phone is required before user delivery, along with the remaining QUALITY.md gates.
