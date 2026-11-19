# Duo and reference feature pass — 2026-11-17

This is implemented source, not a verified replacement IPA or complete Astra parity.

## What the current code adds

- Automatic conversation remains the main action. Reply playback buttons and the
  home voice-preview action are removed; voice audition stays inside voice settings.
  The browser's erroneous musical-note microphone glyph is replaced with a real
  microphone SVG. Optional text dictation still only fills the chat draft.
- Cream, Night, Sakura and Sage palettes apply through SwiftUI's environment with
  persistent selection. Switching theme does not recreate the store or avatar.
- Offline action sequences: ordered speech, pause, study timer, note, theme and web
  search blocks. Editor supports add/remove/reorder, exact phrase triggers, explicit
  run preview, bounded JSON import/export and saved routines. Online search and
  optional cloud speech need their own connections; local actions don't need an LLM.
- A study timer retains its deadline or paused remainder across relaunch. It is an
  app timer, not the system Focus mode, notification silencing, or permission to
  close other apps. Backgrounding stops a running block chain; it does not roll
  back completed actions or remove a timer already started. No background alert
  or background execution is claimed.
- Russian installed voices plus optional Fish Audio selection and paginated voice
  search. The explicit provider selection discloses text transmission and service
  cost. Keys go to Keychain. Cancellation invalidates pending audio; bounded WAV
  decoding feeds the existing PCM envelope/playback/completion path, so automatic
  conversation waits for actual playback. No silent provider fallback.
- Local VRM 0.x/1.0 import and selection; costume variants may be separate VRM files.
  Vita stays the default. Import validates container limits and excludes external
  buffer/image URLs. Choosing another file explicitly reloads only the avatar;
  resizing and theme changes do not. Arbitrary mesh/material compatibility is not
  guaranteed by container validation.

## Duo implementation and build boundary

Apple's official specs identify inner/outer folding displays with ProMotion up to
120 Hz. The app queries the current window's actual screen maximum instead of
hard-coding a device name, and caps animation under thermal/low-power constraints.
The requested 240 Hz is not a Duo display capability.

`CompanionLayoutPlan` computes separate character, navigation and control rectangles.
It handles compact, expanded, vertical book-fold and horizontal tabletop-fold
layouts; controls scroll when their text/content exceeds their allocated space.
Camera occlusions in the top region move the header below them. The avatar's SwiftUI
identity stays stable across these changes. Repeated unchanged bridge commands are
coalesced. Existing character, animation, camera and lighting are retained.

`DuoGeometry` uses documented `GeometryProxy.reservedRegions(kind:)` for active
`.division` and `.occlusion` regions only in an iOS 27.1+ SDK build. Both build
scripts select `MIRA_DUO_SDK` from the SDK actually installed. SDK 26.x builds retain
size-based layouts, but cannot read the physical fold. CI version inputs now accept
an installed newer toolchain; availability on the hosted runner must be checked.
No workflow was dispatched, and existing billing restrictions were not changed.

Reference sources checked on 2026-11-17:
- https://www.apple.com/iphone-duo/specs/
- https://developer.apple.com/videos/play/tech-talks/111463/
- https://docs.fish.audio/api-reference/openapi.json

## Verification and remaining work

12 portable tests passed: layout bounds, both hinge orientations, inactive regions,
camera avoidance, exact routine triggers, invalid import rejection, persisted timer
pause/resume, and automatic-conversation lifecycle. Swift files parse with the Duo
conditional branch enabled; this is not Apple-SDK typechecking. Build-flag selection
was checked against mocked SDK versions 26.5, 27.0, 27.1 and 27.3.

Browser review covers 16 secondary screens at three widths and four themes across
five size/posture cases, using the real bundled renderer. The fold is simulated;
viewport sizes are illustrative logical sizes, not certified device metrics. Night
iframe transparency was corrected after visual review. These are design previews,
not native screenshots, performance measurements or physical Duo tests.

Still open: actual compilation with the Duo SDK, imported-avatar native rendering,
Fish Audio with a configured account, microphone/voice sessions through real fold
transitions, and native large-text/keyboard/accessibility review. No service keys
were requested, used, printed or included in source during this pass.

The reference's arbitrary desktop plugin host, game embedding, system-wide avatar
and closing other apps are not ordinary iOS capabilities and are not represented
by fake switches. Importing local TTS model files is also not implemented: installed
Apple voices are real offline TTS; an arbitrary desktop voice checkpoint needs a
specific compatible inference engine and format. Phoneme lip sync and the broader
motion library still need separate implementation and device evidence. Full video
parity remains open.
