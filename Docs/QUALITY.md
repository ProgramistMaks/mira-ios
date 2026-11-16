# Release gate — NOT PASSED

The user explicitly requested no delivery until comparable to the three Astra reference videos.
Compiling, passing unit tests, or rendering an avatar is NOT visual/behavioral acceptance.
Do not describe this source tree, test model, screenshots, or unsigned artifacts as the finished app.

Reference files: Google Drive folder 1kaSsqA1c3jj7hpR_9N2PKzQ6EIAWP239.
Videos sampled visually on 2026-11-15; full audio was machine-transcribed locally and the feature review updated on 2026-11-16. See REFERENCE-REVIEW.md. Perceived voice-quality comparison remains pending.

## Required before delivery

- [ ] Final high-quality anime model with hair/clothing dynamics, accurate material rendering and documented asset terms. Vita (CC0) is the current candidate; visual parity still unapproved.
- [ ] Authored idle, listening, thinking, speaking, greeting and touch-reaction animation clips with smooth blending. Original keyframed torso/arm/hand/gaze clips and interruption-safe blending are now implemented. Lower-body acting, wider motion variety and recorded reference comparison remain unfinished.
- [ ] Phoneme-aware mouth animation and device-verified audiovisual timing. Actual PCM amplitude now drives mouth opening; this is not phoneme lip sync. See SPEECH.md.
- [ ] Natural Russian voice, interruptible playback, no feedback loop into microphone. Current Apple TTS is a functional baseline, not demonstrated parity.
- [ ] Voice activation / push-to-talk UX and transcripts validated on device with Bluetooth, interruption, permission denial and network loss.
- [ ] Local model download, cancellation and sustained inference checked on device; optional cloud connection configured and tested against a real provider; disconnect must preserve partial text and never claim completion.
- [ ] Broader intent-to-command coverage and on-device voice-command verification. Explicit Russian note/reminder/search commands now route offline to review forms and acknowledge actual results; arbitrary model-generated actions and the reference block editor are not implemented.
- [ ] Character and voice selection beyond a single sample avatar.
- [ ] Responsive chat/character/settings layouts checked on the actual outer and inner Duo screens, rotation, Split View, keyboard and large text.
- [ ] Fresh macOS compile, native tests, installation after user signing and cold launch on iPhone Duo iOS 27.3.
- [ ] Ten-minute device session with measured frame times, thermal behavior and memory. Target stable 60 fps normally, 30 fps under thermal/low-power constraints; no crashes or unreleased microphone session.
- [ ] Side-by-side recorded review against references, checking animation, framing, visual polish, voice and interaction. No assertion of “not worse” without this evidence.

## Platform boundary

iOS app owns its scene. No claim of a system-wide desktop-style avatar or arbitrary control of other apps.
Notes are app-local; reminders use EventKit; explicit web search uses Tavily or opens a browser. No search results are fabricated by the chat model.

## Current blockers

This workspace is Linux. macOS CI compiles the app and local inference runtime with Xcode 16.4/iOS 18.5 SDK. Real Qwen3.5 9B and Gemma 4 E2B inference through the Swift runtime on macOS passed; see VERIFICATION.md for native test and screenshot evidence. Actual Duo/iOS 27.3 verification, local-model device performance and reference-quality review are still required.
User has a signing certificate and can sign/test IPA. Do not collect private keys or passwords in chat.
The user's private repository is ProgramistMaks/mira-ios; cloud builds are internal. No public release has been created.
