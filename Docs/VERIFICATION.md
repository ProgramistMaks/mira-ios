# Verification — 2026-11-16

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

## Latest validated source

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

- TypeScript type check, five motion tests and renderer bundle build passed.
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
