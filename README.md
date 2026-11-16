# Мира — iOS companion, internal work in progress

Native SwiftUI shell with local Qwen inference through llama.cpp, optional cloud streaming chat, Russian speech recognition / Apple TTS, Tavily search, Keychain credential storage, local history/notes and confirmed EventKit reminders. A bundled Three.js/VRM scene runs inside an isolated WKWebView. It receives only animation state and audio-derived mouth amplitude, never conversation text or credentials. See [speech synchronization](Docs/SPEECH.md). Original keyframed gestures, smooth state changes and adaptive rendering are described in [character acting](Docs/ANIMATION.md). This renderer is reusable for later Android/desktop hosts.

**Not ready for delivery.** See [quality gate](Docs/QUALITY.md). An unsigned IPA with the Qwen/Gemma catalogue has been compiled on macOS CI. Real Swift inference for both model families, fourteen native unit tests and two UI tests passed; model selection, speech playback and offline command review are covered. See [verification](Docs/VERIFICATION.md) for test evidence; physical-device testing remains pending. Working name “Мира” is provisional. Vita (CC0, VRoid Project / pixiv) is the current character candidate, not an approved final design.

Liquid Glass is implemented and has internal iOS 26 visual evidence. The full UI suite passed on the iOS 18 fallback; iOS 26 checks exposed cold-start timing and download-cancellation issues. Latest loading, cancellation and icon-contrast corrections await a fresh native build: GitHub blocked the next run for a billing/spending-limit issue. Earlier passing tests do not validate those latest corrections.

Subsequent renderer changes reduce facial morph data and fix readiness/reload behavior after graphics context loss. Real-model Chromium checks passed; these changes also await native verification. See [verification evidence](Docs/VERIFICATION.md) for measured scope and remaining limits.

[Widgets and Dynamic Island](Docs/WIDGETS.md) are implemented in source: Home/Lock Screen shortcuts, conversation status, and an activity-specific Stop action. The new extension, lifecycle and route tests await native compilation/QA because hosted macOS builds remain blocked. Re-signing must retain and sign `MiraWidgets.appex` as well as the main app.

## Renderer checks

```sh
npm ci
npm run check
npm test
npm run build
```

`Resources/Web` is generated and bundled as a folder. Rendering requires no CDN or network after installation. Source model and license attribution are in `Renderer/public`.

## macOS build and user signing

Install Xcode 26.2 with the iOS 26.2 SDK and simulator runtime, Node 22 and XcodeGen. Run:

```sh
bash Scripts/build-ios.sh
bash Scripts/test-ios.sh
```

The minimum deployment target remains iOS 18. Native [Liquid Glass](Docs/LIQUID-GLASS.md) is used on iOS 26+, with standard material on older systems. To test the fallback, install the iOS 18.5 simulator runtime and run `MIRA_TEST_IOS_VERSION=18.5 bash Scripts/test-ios.sh` with a fresh result-bundle directory.

The first script creates `build/Mira-unsigned.ipa` from an actual device archive. It is not installable as-is: the user must re-sign it using a valid identity/profile compatible with the device and bundle ID. No certificate is needed on CI for this unsigned workflow. The workflow under `.github/workflows/ios.yml` is manual and produces an **internal** artifact only after native tests pass. It is not a release pipeline.

The workflow assumes this directory is the repository root. The user authorized the private repository ProgramistMaks/mira-ios. macOS runner availability/charges depend on the user's GitHub plan.

## Configuration and limitations

- New installations default to local mode. Select and download Qwen3.5 (2B/4B/9B) or Google Gemma 4 E2B over Wi-Fi from the local catalogue; subsequent text inference runs on device without a cloud key or automatic cloud fallback. See [local AI](Docs/LOCAL-AI.md).
- Optional cloud chat requires a compatible provider, endpoint, model and key. Keys are entered on device and stored in Keychain. Tavily provides search, not the conversational model.
- Local-mode dictation requires on-device recognition; if unavailable, text input remains available. Cloud-mode dictation may send audio to Apple. Microphone is activated only by the recording control and stopped on background/interruption.
- Cloud requests use at most 40 non-interrupted messages; local requests use at most 12, trimmed to the token budget. Long-term semantic memory is not implemented.
- Explicit Russian note/reminder/search commands work without an LLM and require action review. Manual forms remain available. Open-ended model tool use, a block editor and integrated web answers remain unfinished.
- Natural voice parity, authored motions, real lip sync and final character acceptance remain open. UI automation covers startup, local notes and adaptive layout screenshots.

## Sources

- [Three VRM](https://github.com/pixiv/three-vrm)
- [Vita avatar provenance and license](Renderer/public/ASSET-LICENSE.md)
- [Apple: distributing apps to registered devices](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices/)

No secrets, paid API use, third-party messages or external releases are part of the local implementation.
