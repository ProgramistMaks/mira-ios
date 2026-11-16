# Release gate — NOT PASSED

The user explicitly requested no delivery until comparable to the three Astra reference videos.
Compiling, passing unit tests, or rendering an avatar is NOT visual/behavioral acceptance.
Do not describe this source tree, test model, screenshots, or unsigned artifacts as the finished app.

Reference files: Google Drive folder 1kaSsqA1c3jj7hpR_9N2PKzQ6EIAWP239.
Videos sampled visually on 2026-11-15; full audio was machine-transcribed locally and the feature review updated on 2026-11-16. See REFERENCE-REVIEW.md. Perceived voice-quality comparison remains pending.

## Required before delivery

- [ ] Final high-quality anime model with hair/clothing dynamics, accurate material rendering and documented asset terms. Vita (CC0) is the current candidate; visual parity still unapproved.
- [ ] Authored idle, listening, thinking, speaking, greeting and touch-reaction animation clips with smooth blending. Original torso/arm/hand/gaze clips now include pelvis weight shifts and dips with planted-foot leg IK and interruption-safe blending. Wider motion variety, native performance and recorded reference comparison remain unfinished.
- [ ] Phoneme-aware mouth animation and device-verified audiovisual timing. Actual PCM amplitude now drives mouth opening; this is not phoneme lip sync. See SPEECH.md.
- [ ] Natural Russian voice, interruptible playback, no feedback loop into microphone. Current Apple TTS is a functional baseline, not demonstrated parity.
- [ ] Voice activation / push-to-talk UX and transcripts validated on device with Bluetooth, interruption, permission denial and network loss.
- [ ] Local model download, cancellation and sustained inference checked on device; optional cloud connection configured and tested against a real provider; disconnect must preserve partial text and never claim completion.
- [ ] Broader intent-to-command coverage and on-device voice-command verification. Explicit Russian note/reminder/search commands now route offline to review forms and acknowledge actual results; arbitrary model-generated actions and the reference block editor are not implemented.
- [ ] Character and voice selection beyond a single sample avatar.
- [ ] Responsive chat/character/settings layouts checked on the actual outer and inner Duo screens, rotation, Split View, keyboard and large text.
- [ ] Fresh macOS compile, native tests, installation after user signing and cold launch on iPhone Duo iOS 27.3.
- [ ] Ten-minute device session with measured frame times, thermal behavior and memory. User-requested target is 120 fps on supported displays; renderer scheduling also accepts 240 for a capable future host/display. Measure actual WKWebView callback/render rates before claiming support: Info.plist opt-in and screen capability alone do not establish it. Fall back to the available display/host rate and 30 fps under thermal/low-power constraints; no crashes or unreleased microphone session.
- [ ] Side-by-side recorded review against references, checking animation, framing, visual polish, voice and interaction. No assertion of “not worse” without this evidence.

## Platform boundary

iOS app owns its scene. No claim of a system-wide desktop-style avatar or arbitrary control of other apps.
Notes are app-local; reminders use EventKit; explicit web search uses Tavily or opens a browser. No search results are fabricated by the chat model.

## Build budget — user preference (2026-11-16)

Batch small changes and validate them locally. Do not dispatch a hosted macOS/iOS
build for every small edit, documentation update or test adjustment. Reserve hosted
builds for substantial feature milestones, important native fixes or an explicit
user request. Run the relevant local checks before using hosted minutes. A small
change that depends on Apple SDK/device behavior remains marked unverified until
the next appropriate native build; local checks do not replace that validation.
Do not race duplicate hosted builds or repeatedly retry runner-capacity failures.
Re-run costly model downloads/inference only when model/runtime changes or a specific
regression justify them. The iOS workflow remains manual (`workflow_dispatch`).

## Current native status

The workspace is Linux. Native builds run in the user's private repository
`ProgramistMaks/mira-ios`, defaulting to macos-26-intel / Xcode 26.6 / iOS 26.5.
Earlier billing and runner-capacity failures are historical; the current host has
compiled the complete device package with native Liquid Glass and MiraWidgets.

Run `43953994238` passed 70 native unit tests and three UI scenarios on iPhone 17 /
iOS 26.5. The widget-route test incorrectly relaunched the app for each URL and
failed draft retention; the overall job deadline then prevented finalizing the
result bundle and publishing the IPA. Raw diagnostic screenshots were recovered
and reviewed. Voice controls below the viewport prompted the pinned-control fix.
The focused voice/routes follow-up failed before creating an XCResult. Package-only run `43965968225` produced the compact IPA for the user’s signing/test request; it does not close native UI or device acceptance. Exact
run IDs, source revisions, fixture repairs and final outcomes are in VERIFICATION.md.

Earlier real Qwen3.5 9B and Gemma 4 E2B inference through the Swift runtime on macOS
passed. Model pins/runtime did not change, so subsequent UI/package checks do not
repeat multi-GB inference downloads. Portable HTTP tests exercise real loopback
transfers and resume, but device downloads, Metal performance and RAM remain open.

The user explicitly requested a single compact IPA for their own signing/testing,
with model weights downloaded inside the app. The character, renderer, local AI
runtime and widget extension belong in the package. The user has a signing
certificate; do not request private keys or passwords in chat. An unsigned artifact
requires correct signing of the app, framework and widget extension before install.

A package for the user's device check is not a finished, reference-approved release.
Actual Duo/iOS 27.3 installation, microphone permissions, Bluetooth, real-system
widgets/Live Activities, sustained inference and measured display performance are
still acceptance requirements. No public release or quality-parity claim exists.
