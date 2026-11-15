# Release gate — NOT PASSED

The user explicitly requested no delivery until comparable to the three Astra reference videos.
Compiling, passing unit tests, or rendering an avatar is NOT visual/behavioral acceptance.
Do not describe this source tree, test model, screenshots, or unsigned artifacts as the finished app.

Reference files: Google Drive folder 1kaSsqA1c3jj7hpR_9N2PKzQ6EIAWP239.
Videos sampled visually on 2026-11-15. Full audio/transcript review still pending.

## Required before delivery

- [ ] Final high-quality anime model with hair/clothing dynamics, accurate material rendering and documented asset terms. Vita (CC0) is the current candidate; visual parity still unapproved.
- [ ] Authored idle, listening, thinking, speaking, greeting and touch-reaction animation clips with smooth blending. Current procedural breathing/tilt is a first pass only.
- [ ] Speech-driven mouth animation synchronized to audible output. Current synthesized mouth envelope is NOT lip sync.
- [ ] Natural Russian voice, interruptible playback, no feedback loop into microphone. Current Apple TTS is a functional baseline, not demonstrated parity.
- [ ] Voice activation / push-to-talk UX and transcripts validated on device with Bluetooth, interruption, permission denial and network loss.
- [ ] Chat connection configured and tested against a real provider; disconnect must preserve partial text and never claim completion.
- [ ] Intent-to-command routing with explicit action previews and result acknowledgement. Current commands are manual forms; the model cannot execute them.
- [ ] Character and voice selection beyond a single sample avatar.
- [ ] Responsive chat/character/settings layouts checked on the actual outer and inner Duo screens, rotation, Split View, keyboard and large text.
- [ ] Fresh macOS compile, native tests, installation after user signing and cold launch on iPhone Duo iOS 27.3.
- [ ] Ten-minute device session with measured frame times, thermal behavior and memory. Target stable 60 fps normally, 30 fps under thermal/low-power constraints; no crashes or unreleased microphone session.
- [ ] Side-by-side recorded review against references, checking animation, framing, visual polish, voice and interaction. No assertion of “not worse” without this evidence.

## Platform boundary

iOS app owns its scene. No claim of a system-wide desktop-style avatar or arbitrary control of other apps.
Notes are app-local; reminders use EventKit; web search opens a browser. No search results are fabricated by the chat model.

## Current blockers

This workspace is Linux. macOS CI now compiles the app successfully with Xcode 16.4/iOS 18.5 SDK; four unit tests passed. Native UI tests and latest-character review are in progress. Actual Duo/iOS 27.3 verification is still required.
User has a signing certificate and can sign/test IPA. Do not collect private keys or passwords in chat.
The user's private repository is ProgramistMaks/mira-ios; cloud builds are internal. No public release has been created.
