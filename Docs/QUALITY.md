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
- [ ] Ten-minute device session with measured frame times, thermal behavior and memory. Target stable 60 fps normally, 30 fps under thermal/low-power constraints; no crashes or unreleased microphone session.
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

This workspace is Linux. macOS CI now selects Xcode 26.2/iOS 26.2 SDK for native Liquid Glass, while the minimum deployment target stays iOS 18. Prior real Qwen3.5 9B and Gemma 4 E2B inference through the Swift runtime on macOS passed; see VERIFICATION.md for exact toolchain, native test and screenshot evidence. Actual Duo/iOS 27.3 verification, local-model device performance and reference-quality review are still required.
User has a signing certificate and can sign/test IPA. Do not collect private keys or passwords in chat.
The user's private repository is ProgramistMaks/mira-ios; cloud builds are internal. No public release has been created.

Previous hosted validation was blocked by GitHub Billing & plans: run `43927090461` did not start because GitHub reported a failed-payment or spending-limit issue. Liquid Glass has partial native visual evidence and a passing iOS 18 compatibility run, but the final loading/cancellation/contrast corrections still need native compilation and UI verification. See VERIFICATION.md for the exact tested commits and failures. No payment or spending-limit settings were changed. On 2026-11-16 the user confirmed iOS build availability, lifting the request to pause native builds.

Native execution resumed in run `43932686138`: Xcode 26.2 started and twenty-eight
portable tests passed on macOS, but the twelve HTTP tests failed at fixture startup.
The updated startup deadline/diagnostics pass all forty tests locally, including a
separate delayed-start probe. Follow-up runs `43934113790` (Intel) and `43936091765`
(Apple Silicon) both failed before execution because GitHub could not allocate a
hosted runner; the ARM run explicitly cited capacity constraints. The fix and all
new app/widget changes still require successful native archive/UI validation.

The subsequent WidgetKit/Dynamic Island extension and its platform integration still require native compilation and UI tests. Its shared lifecycle has compiled and passed thirteen Swift tests on Linux, including deliberately delayed effects and stale Stop rejection. All widget families, real-system Stop interaction, background/stale behavior, audio continuity, accessibility, signing and actual-device presentation remain acceptance requirements; see WIDGETS.md.

The shared suite now also covers dictation draft preservation and cancellation between
permission prompts (twenty-two passing Swift tests in total). The updated microphone
permission flow, composer and interruption handling still need native/device review;
see SPEECH.md. Portable tests do not certify Speech.framework or iOS permission UI.

Resumable model transfers now have real HTTP integration coverage and a small
successful HTTPS resume probe against the pinned Qwen URL, including separate process
launches. Native pause/relaunch UI, Wi-Fi restrictions, complete-file verification
and installation still require iOS acceptance. No inference runtime or model pin was
changed by this transfer update; see LOCAL-AI.md and VERIFICATION.md.

Fresh native attempt `43927090461` for transfer source `b287ced` was rejected before
execution by the same GitHub failed-payment/spending-limit block on 2026-11-16.
It supplies no new native validation.

The portable suite now passes fifty-six tests, including six real file-verification
cases. Verification percent and explicit pause feedback are implemented in source;
their iOS presentation and the CryptoKit/store integration remain unverified.

The new chat-recovery block adds sixteen portable tests for the actual stream
decoder, backward-compatible message metadata, draft-preserving question restoration
and delayed save cancellation. Native stream transport, row/confirmation/focus UI,
disk-protection/background behavior and speech integration remain pending. See
CHAT-RECOVERY.md. No hosted build was dispatched for this locally verified batch.
