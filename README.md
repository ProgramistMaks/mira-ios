# Мира — iOS companion, internal work in progress

Native SwiftUI shell with local Qwen inference through llama.cpp, optional cloud streaming chat, Russian speech recognition / Apple TTS, Tavily search, Keychain credential storage, local history/notes and confirmed EventKit reminders. A bundled Three.js/VRM scene runs inside an isolated WKWebView. It receives only animation state and audio-derived mouth amplitude, never conversation text or credentials. See [speech synchronization](Docs/SPEECH.md). This renderer is reusable for later Android/desktop hosts.

**Not ready for delivery.** See [quality gate](Docs/QUALITY.md). An unsigned IPA with the local runtime has been compiled on macOS CI. With the previous Qwen2.5 runtime, real inference, eleven native unit tests and one UI test passed; speech playback and offline command review are covered. See [verification](Docs/VERIFICATION.md) for test evidence; physical-device testing remains pending. Working name “Мира” is provisional. Vita (CC0, VRoid Project / pixiv) is the current character candidate, not an approved final design.

## Renderer checks

```sh
npm ci
npm run check
npm test
npm run build
```

`Resources/Web` is generated and bundled as a folder. Rendering requires no CDN or network after installation. Source model and license attribution are in `Renderer/public`.

## macOS build and user signing

Install Xcode with iOS SDK + simulator runtime, Node 22 and XcodeGen. Run:

```sh
bash Scripts/build-ios.sh
bash Scripts/test-ios.sh
```

The first script creates `build/Mira-unsigned.ipa` from an actual device archive. It is not installable as-is: the user must re-sign it using a valid identity/profile compatible with the device and bundle ID. No certificate is needed on CI for this unsigned workflow. The workflow under `.github/workflows/ios.yml` is manual and produces an **internal** artifact only after native tests pass. It is not a release pipeline.

The workflow assumes this directory is the repository root. The user authorized the private repository ProgramistMaks/mira-ios. macOS runner availability/charges depend on the user's GitHub plan.

## Configuration and limitations

- New installations default to local mode. Download the pinned Qwen model once over Wi-Fi (Qwen3.5 9B Q4_K_M, 5.68 GB); subsequent text inference runs on device without a cloud key or automatic cloud fallback. See [local AI](Docs/LOCAL-AI.md).
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
