# Verification — 2026-11-15

## Current implementation

Source is in the user-authorized private repository `ProgramistMaks/mira-ios`.
The app is internal work in progress; no reference-quality approval or public release exists.

Run `43766167802`, commit `c4b76dcf79c7eedd406ee8d4762b60966f0f1f5f`:

- Unsigned iOS device archive compiled successfully with Xcode 16.4 / iOS 18.5 SDK, including the llama.cpp XCFramework.
- Exact pinned Qwen2.5 1.5B Q4_K_M weights downloaded, SHA256 verified and actual inference completed successfully on the macOS runner.
- Six native unit tests and one native UI test passed with zero failures on the iPhone 16 Pro simulator.
- Portrait, landscape and settings screenshots were reviewed internally. Vita remains visible after rotation, and local/cloud controls are present. Character framing still needs polish: the status badge overlaps the feet.
- Internal unsigned IPA and native test evidence were generated. Workflow completed successfully in 9m37s.

The inference smoke test executes a real Russian prompt and rejects empty output.
The observed answer to “Сколько будет два плюс два? Ответь одним числом.” was `4`.
It does not prove Russian dialogue quality, airplane-mode behavior on iPhone,
Metal performance, memory use or thermal behavior on the target device.

## Local checks

- TypeScript type check, four motion tests and renderer bundle build passed.
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
- Complete reference-video audio review, final animation/voice quality and visual parity.

See QUALITY.md for the full delivery gate. Successful CI does not clear it.
