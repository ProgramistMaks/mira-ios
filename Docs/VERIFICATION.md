# Verification — 2026-11-16


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
