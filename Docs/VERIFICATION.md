# Verification — 2026-11-16

## Resumable model downloads — portable transfer verification

Source now supports pausing/resuming model downloads, keeps partial data after a
network failure or app backgrounding, shows bytes/rate, and offers confirmed removal
of an unfinished download. Disk preflight counts remaining bytes plus a 1 GB reserve.
Full-file size/SHA256 verification still gates installation; a completed partial can
resume directly at verification without another network request.

- Swift 6.2.3 compiled the actual download engine; all 34 XCTest cases passed. The suite includes twelve real
  localhost HTTP transfer tests in addition to the twenty-two interaction tests.
  It covers loss/resume with Range/If-Range, redirects, cancellation/new instances,
  changed identities/validators, ignored/invalid ranges, server errors, an oversized
  body, an empty replacement response, offline re-verification and explicit discard.
- Real HTTPS probing of the pinned Qwen3.5 9B Q4 URL exposed a per-attempt URLSession
  destruction crash in Linux FoundationNetworking. Reusing a single serial transport
  fixed it. A fresh-process probe then exposed premature file truncation on an
  intermediate response; truncation/checkpoint replacement now wait for actual body
  data, with a regression test for an empty replacement response.
- After those corrections, two independent HTTPS probe processes grew the same saved
  partial from 1,620,959 to 2,767,785 bytes without restarting. These small samples
  prove resumed transfer behavior, not full model integrity or inference. Temporary
  probe files are removed after review; no signed CDN URL or model file is committed.
- Changed app files passed Swift syntax parsing. Apple SDK type checking, native
  download UI, Wi-Fi enforcement, app background/relaunch and complete hash-verified
  installation remain pending. Earlier inference results do not validate this new
  transfer integration.

The previously confirmed native build blocker is GitHub billing/spending limits.
A fresh native attempt for this source is recorded separately once it completes.
No finished IPA or screenshots are delivered before the release gate passes.

## Dictation draft preservation and permission cancellation

The new source snapshots the draft before dictation and applies recognition revisions
to that snapshot. It moves transcript delivery from SwiftUI observation into a direct
main-actor callback, so a final result is applied before recording cleanup. Permission
setup is now a cancellable pending state; the composer cannot edit/send during setup
or recording. The authorization gate checks cancellation after each reply and does
not request microphone permission after speech denial or cancellation. Interruption
handling now stops work only for the beginning of an audio interruption.

- Swift 6.2.3 compiled the shared source and passed **22 XCTest cases**: the existing
  thirteen lifecycle/route cases and nine new dictation/permission cases. Controlled
  continuations cover cancellation between prompts, a late reply after cancellation,
  overlapping requests and task cancellation. Draft cases cover partial recognition
  revisions, retained whitespace, no speech and a subsequent dictation session.
- The Swift compiler parsed the changed app files without syntax errors; whitespace
  checks passed. This is not Apple SDK type checking or a native build.
- Actual permission dialogs, capture, transcript ordering in Speech.framework, the
  updated composer and the interruption notification integration still need native
  tests/device review. The system's already-visible permission sheet is not dismissed
  by cancellation; the pending recording operation is invalidated.
- Native CI remains blocked by the last confirmed GitHub billing/spending-limit
  failure. No new hosted run was dispatched and no finished IPA/screenshots delivered.

## Activity lifecycle race fixes — portable Swift tests passed

The lifecycle implementation is now separated from the ActivityKit/UIKit adapter and compiled directly into both native targets. Each explicit user interaction invalidates the previous logical session synchronously. This closes a window where an old activity retained during asynchronous cleanup could still authorize cancellation of a newly started conversation. Reconciliation also rechecks state after a delayed end, preventing obsolete activity creation.

- Installed the official Swift 6.2.3 Linux toolchain in the temporary workspace. `swift test` compiled the actual `ActivityCore` source and passed all thirteen XCTest cases, with zero failures. Tests use an injected effect driver and explicit continuations to exercise delayed update/end operations, not time-based approximations or a duplicate implementation.
- Coverage includes old Stop rejection before cleanup completes; a third interaction superseding a second while the first ends; cancellation during an update; phase handovers without duplicates; background speech completion/Stop; no background request; late recording/inference updates; permission/preference denial; manual dismissal; request failure/recovery; idle cleanup; rapid changes; and widget URLs.
- The Swift compiler parsed twenty-five app/shared/widget/test files without syntax errors. YAML/plist/workflow wiring and whitespace checks passed. This parser check does not type-check Apple SDK calls.
- The source now stops the 30 Hz mouth clock while the app scene is inactive and resumes from actual playback time. Player release precedes audio-session deactivation. An extended native speech test is prepared, but these audio integration changes have not run on iOS.
- CI now runs the portable package before native archive preparation and includes the same lifecycle tests in the native unit-test target. No new hosted workflow was dispatched while the confirmed billing/spending-limit block remains unresolved.

This provides compiled/tested lifecycle logic, **not** a compiled iOS extension, a working-system ActivityKit certification, physical-device audio evidence or visual acceptance. Earlier native results do not certify these source changes. No IPA or screenshots were delivered.

## WidgetKit and Dynamic Island — native verification pending

Source now includes a WidgetKit app extension (five widget families), ActivityKit status/Stop controls, guarded deep links and a persisted Live Activities preference. The app embeds the extension; an archive checker requires the actual nested executable, correct extension point, versions, Live Activities flag and URL scheme before packaging. Details and native acceptance steps are in WIDGETS.md.

Initial validation at `8aca164` checked YAML/plist structure, extension wiring, shell syntax, Python syntax, Swift grammar and whitespace. The archive checker accepted a synthetic valid fixture and rejected incorrect versions/IDs and a missing executable; this does not validate a compiled bundle. Four native unit tests initially covered route validation, actual-phase selection, settings migration and the public status payload; route validation has since moved into the portable/native lifecycle suite above. A native UI test covers cold/warm routes, sheet transitions and draft preservation. Neither the extension nor the changed app source has compiled in Xcode yet.

GitHub's previously confirmed billing/spending-limit block still prevents native validation; no new hosted run was dispatched for this change. Device Live Activities, interactive Stop, widget rendering/tints and signing remain unverified. The source now permits already-playing speech to continue in the declared audio background mode; recording, inference and speech preparation still stop when backgrounded. Actual playback continuity, Lock Screen Stop and natural completion in the background also await native/device checks. No finished IPA or widget screenshots were delivered.

## Renderer memory and context recovery

The current source combines facial morph targets by VRM expression and fixes stale readiness after WebGL context loss. The animation loop cannot reassert readiness while the context is lost; recovery reloads the local scene and requires a rendered frame.

- `npm run check`, `npm test`, `npm run build` and the real-model Chromium check passed. Direct execution of the two unit-test files also reported all nine individual tests passing.
- The bundled VRM's summed position-target count across mesh primitives fell from 369 to 126. Unique morph attribute arrays fell from 2,118,552 to 723,408 bytes (about 66%). These are morph-array measurements, not total app RAM, GPU allocation or device-performance measurements.
- The browser probe compared all fifteen expression presets, neutral and two mixed blink/mouth/smile cases before and after optimization. Every sampled vertex position and normal matched exactly in all eighteen cases (maximum absolute difference 0). The probe is excluded from the app bundle.
- A real `WEBGL_lose_context` interruption cleared readiness and retained the error state across subsequent frames. Restoring the context reloaded the local scene, rendered the character and restored readiness with exactly one canvas. The restored-scene screenshot and thinking pose were reviewed internally. Existing touch, drag rejection, pause/resume, reduced-motion, three-size and missing-model checks also passed, with no external requests or page errors.
- This is Linux Chromium evidence. WKWebView recovery, physical-device resource use and reference quality remain unverified; no IPA or screenshots were delivered.

One retry of native CI, run `43851757448` at pre-renderer commit `5970d78808d61bc6b031964f4ed9a545c2ec2c24`, was rejected before execution by the same GitHub billing/spending-limit error. No further builds were requested after that retry. Current renderer changes therefore also await native verification. The previously pending obsolete run `43849413671` is now completed with failure and has no active job.

## Liquid Glass update — final corrections awaiting native verification

Native glass on iOS 26+ and the iOS 18 material fallback were implemented in `d7b31ecfe2d1e237e246f8e280ff9d66069b366f`. See LIQUID-GLASS.md for presentation scope and Apple references. The latest source includes subsequent corrections described below; earlier passing results do not certify those corrections.

**Successful compatibility check:** run `43841702974`, commit `2686db09c1c1d37fe78409a90c05af9924112a27`, used Xcode 26.2 with the iOS 18.5 simulator on Intel macOS. The unsigned device archive compiled; fourteen unit tests and two UI tests passed. Tests covered 44-point control bounds, empty/enabled sending, keyboard input, notes and command review, rotation and persisted model selection without downloading. The actual Swift model smoke checks returned `4` and completed for both Qwen3.5 9B Q4_K_M and Gemma 4 E2B Q4_K_M after verifying the pinned files. The keyboard and landscape screenshots were reviewed internally: the controls remain usable and the character remains visible. The active send icon was white on lavender; that contrast issue is corrected in subsequent source but needs a new screenshot.

**Native glass evidence and failures:**

- Run `43841103969`, commit `2686db0`, compiled the archive and passed fourteen unit tests on iOS 26.2, including actual speech playback. UI checks failed when the simulator timed out obtaining a screenshot, then timed out setting orientation. No visual acceptance follows from that run.
- Run `43845997475`, commit `844d0159ba4eb4be32b828cacfa4914b27dcca29`, booted the simulator explicitly and disabled parallel test execution. All fourteen unit tests passed again. The first UI test exceeded the original sixty-second renderer-readiness wait; its recorded screen and failure hierarchy subsequently show the real character loaded. The model test reached selection and the download confirmation, but the iOS 26 popover omitted the implicit cancel button expected by the test.
- The native iOS 26 home-screen recording and model-catalogue screenshot were inspected internally. They show the actual system glass on controls, composer/status surfaces and navigation, with the character fully visible. This is partial visual evidence; the full native-glass UI suite did not pass.
- A similar simulator screenshot timeout is reported at https://github.com/actions/runner-images/issues/13830. This is context for investigating CI, not proof of the cause here.

**Corrections after review:** `7c7c26b` adds an explicit character-loading indicator and a native download alert with separate “Скачать” / “Отмена” buttons. Cold-launch UI waits allow 120 seconds while still requiring both readiness and actual character pixels. The following review also sets prominent action icons to a dark foreground for contrast and raises the per-test CI ceiling to twenty minutes: the successful iOS 18 UI scenario took 691 seconds, exceeding the earlier ten-minute ceiling. These latest corrections have not completed a fresh native build. Shell syntax, YAML parsing and whitespace checks passed locally; no Apple SDK or Swift compiler is available in this Linux workspace.

**External blocker:** run `43850639531` for `7c7c26b` never started. GitHub reported: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” The owner must resolve Billing & plans before new hosted checks can run. No spending limit, payment method or account setting was changed. A later retry is recorded above.

Apple Silicon attempt `43845119642` also failed before execution because GitHub could not acquire a hosted runner after fifteen minutes. Optional newer-Xcode attempt `43849413671` targeted Xcode 26.6 / iOS 26.5 on macOS 26 Intel, on the obsolete pre-correction commit `0cab0bf`. While pending, normal and force-cancel requests returned HTTP 409 (“has not been queued yet”); it has subsequently completed with failure. It must not be treated as verification of current source.

No IPA or screenshots were delivered as a finished product. Accessibility settings, physical-device startup/graphics performance, corrected native UI behavior and reference parity remain unverified.

## Authored character acting update

Application changes are in `c9c714221bcfe8013e8fe446fe83dba9b752bddd`. Follow-up `85ca5c2` only adds an Intel macOS runner option to work around ARM runner capacity delays.

- Nine renderer unit tests passed: loop seams, gesture return, interruptions, gesture priority/cooldown, Reduced Motion, 30/60 fps elapsed-time equivalence, and audio-only mouth feedback.
- Chromium loaded the actual Vita VRM and rendered idle/listening/thinking/speaking in three viewport sizes. Poses were visually inspected, including the corrected thinking hand placement and greeting. The checks also exercise actual character hit tests, rejection of background taps and vertical drags, pause/resume of the canvas, and model-load failure. No external renderer requests occurred.
- Native run `43834206714`, commit `85ca5c2527604cb01364f98e54e519f24ce3a994`, completed successfully on the Intel macOS fallback with Xcode 16.4 / iOS 18.5 SDK. The unsigned iPhone archive compiled, and fourteen native unit tests plus two UI tests passed with zero failures. The duplicate ARM run `43833765666` was cancelled after the fallback started.
- The actual speech synthesis/playback, cancellation and completion checks passed again. UI checks covered character visibility, command review and note persistence, rotation, and persisted model selection without downloading.
- Portrait and landscape screenshots from this run were inspected internally. The whole character remains framed above the status badge; the landscape scene is visible after settings and command-review dismissal. Static screenshots establish framing, not motion quality or a measured frame rate. Browser checks separately verify animation pause/resume.
- Model inference is unchanged from the successful Qwen/Gemma run `43829220890`; its code/catalogue/runtime diff was checked before disabling repeat weight downloads for this renderer-only run.
- The separate speech-marker probe `43834797647` generated actual PCM with Russian Milena and English Samantha, but neither voice emitted markers. This is a negative capability finding on macOS, not a phoneme-lip-sync implementation; see SPEECH.md.

## Local model catalogue upgrade

User-selected Qwen3.5 9B Q4_K_M and four local alternatives are now in the catalogue. All five pinned files were downloaded on Linux and matched their exact SHA256 and sizes.

- Qwen3.5 9B Q4_K_M answered `17 × 23 = 391` and explained Rayleigh scattering in Russian using llama.cpp b12430.
- Qwen3.5 2B Q4_K_M, 4B Q4_K_M and Gemma 4 E2B Q4_K_M answered a Russian name-recall prompt with `Барсик` (Gemma included punctuation), using their family-specific raw prompt templates. These commands ran without network permission.
- Qwen3.5 9B Q3_K_M also completed the same Russian recall prompt with `Барсик`, using the raw Qwen template and the application's configured top-k/top-p/temperature/presence-penalty values.
- CI run `43829220890`, commit `507f2de74b169cfa7bfd380aedbaf5315c7909f7`, completed successfully in 19m37s on Xcode 16.4 / iOS 18.5 SDK.
- Unsigned iPhone archive compiled with llama.cpp b12430. The simulator slice was built from the pinned source and combined with official device/macOS slices.
- The actual Swift `LocalGenerator` returned `4` and reached EOS with both Qwen3.5 9B Q4_K_M and Gemma 4 E2B Q4_K_M. Both exact files passed SHA256 verification on the macOS runner.
- Fourteen native unit tests and two UI tests passed with zero failures. New tests cover family-specific turn boundaries, RAM guidance, saved model selection and recovery from an unknown saved model ID.
- The UI test selected Qwen3.5 4B, opened and cancelled its download confirmation, restarted the app, then verified the persisted choice and the still-not-downloaded state. Previous speech playback, commands, notes and rotation tests also passed.
- The native catalogue screenshot was reviewed: 4B's size, recommendation, selected marker and download button are legible; 2B and Gemma rows render correctly. This is internal simulator evidence, not a user-facing delivery or a physical-device certification.
- Follow-up changes only document these results and delete temporary smoke-test weights after each successful inference to reduce CI disk usage; shell syntax was checked. Application behavior remains the validated source above.

These are basic real-inference checks, not quality benchmarks or measurements on iPhone. No physical-device memory, thermal or speed certification exists.

## Speech and framing update

Run `43821912875`, commit `d3d8aadc3f3b06e62aca793e33cff5b84da8e524`, passed:

- Device archive, real local Qwen inference, nine native unit tests and the native UI test.
- The actual speech test generated speech, played it with AVAudioPlayer, observed
  nonzero mouth amplitude, then verified stop, natural completion and early cancel.
- PCM round-trip and cleanup tests passed; silence windows produce a closed mouth.
- Native portrait and landscape screenshots were reviewed: the status badge no
  longer overlaps the character's feet, including the initial greeting pose.
- Additional Chromium screenshots confirmed an open mouth with live amplitude and
  a closed mouth after bridge updates expired. These are internal review artifacts.

## Previous command and speech validation

Run `43822824892`, commit `aa05a0e00e598e792c683cd9fcfde28a4bc9f499`,
completed successfully in 12m5s:

- Unsigned device archive and real Qwen inference passed.
- Eleven native unit tests and one UI test passed with zero failures.
- Actual synthesis/playback, cancellation and natural completion passed again.
- Explicit Russian command parsing and non-command/negation cases passed.
- The UI test submitted a Russian note command with no LLM configured, dismissed
  its review, verified no note was created, resubmitted, confirmed and verified the
  saved note. It also checked restart persistence and rotation.
- The command review and landscape conversation screenshots were inspected:
  editable text, separate save/cancel controls and the actual success message are
  visible; the character remains visible with feet clear of the status badge.

The unsigned artifact remains internal. None of these checks establish quality
parity, Bluetooth timing or physical-device performance.

## Previous local-AI validation

Source is in the user-authorized private repository `ProgramistMaks/mira-ios`.
The app is internal work in progress; no reference-quality approval or public release exists.

Run `43766167802`, commit `c4b76dcf79c7eedd406ee8d4762b60966f0f1f5f`:

- Unsigned iOS device archive compiled successfully with Xcode 16.4 / iOS 18.5 SDK, including the llama.cpp XCFramework.
- Exact pinned Qwen2.5 1.5B Q4_K_M weights downloaded, SHA256 verified and actual inference completed successfully on the macOS runner.
- Six native unit tests and one native UI test passed with zero failures on the iPhone 16 Pro simulator.
- Portrait, landscape and settings screenshots were reviewed internally. Vita remains visible after rotation, and local/cloud controls are present. That earlier run still had status/feet overlap; the speech update above fixes it.
- Internal unsigned IPA and native test evidence were generated. Workflow completed successfully in 9m37s.

The inference smoke test executes a real Russian prompt and rejects empty output.
The observed answer to “Сколько будет два плюс два? Ответь одним числом.” was `4`.
It does not prove Russian dialogue quality, airplane-mode behavior on iPhone,
Metal performance, memory use or thermal behavior on the target device.

## Local checks

- TypeScript type check, nine current renderer tests and renderer bundle build passed.
- Chromium/WebGL loaded the actual Vita VRM model, exercised four states and three viewport sizes, checked native viewport resizing, and made no external renderer requests.
- A missing model produced the expected explicit failure.
- Browser screenshots were reviewed internally for pose, materials, framing and greeting.
- Project/workflow YAML and shell syntax were checked.

## Native regression evidence

Earlier run `43764534875` passed four unit tests and a native UI test covering
WKWebView startup, settings, note persistence across restart and rotation.
Its screenshots exposed a blank landscape scene despite the readiness flag.
The current code preserves WKWebView identity across layout changes, explicitly
synchronizes its viewport and adds a pixel-presence assertion to prevent that
false-positive. Current screenshots confirm that the blank-scene regression is fixed in this simulator run; this does not approve overall visual quality.

Current native unit tests cover SSE parsing, HTTPS endpoints, persisted messages,
settings migration and search result URL validation. The UI test covers character
pixels, settings, note persistence and portrait/landscape screenshots.

## Still unverified

- Installation after user signing and cold launch on the physical target device.
- Device model download/cancellation, sustained Metal inference, memory and temperature.
- Microphone permissions, on-device Russian dictation availability, Bluetooth, TTS and EventKit on device.
- Real cloud chat provider and live Tavily requests. The credential pasted in chat was not used or stored in the repository.
- Perceived reference-voice comparison, final animation/voice quality and visual parity. Full machine transcription and feature review are recorded in REFERENCE-REVIEW.md.

See QUALITY.md for the full delivery gate. Successful CI does not clear it.
