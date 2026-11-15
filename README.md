# Мира — iOS companion, internal work in progress

Native SwiftUI shell, Russian speech recognition / Apple TTS, streaming chat with an explicitly configured HTTPS Chat Completions endpoint, Keychain credential storage, local history/notes and confirmed EventKit reminders. A bundled Three.js/VRM scene runs inside an isolated WKWebView. It receives only animation state, never conversation text or credentials. This renderer is reusable for later Android/desktop hosts.

**Not ready for delivery.** See [quality gate](Docs/QUALITY.md). An unsigned IPA has been compiled on macOS CI and four native unit tests passed; physical-device testing remains pending. Working name “Мира” is provisional. Vita (CC0, VRoid Project / pixiv) is the current character candidate, not an approved final design.

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

- Chat endpoint and model start empty; there is no fake response mode. The user chooses a compatible provider. API key is entered on device and stored only in Keychain.
- Apple speech recognition may send audio to Apple; the permission copy discloses this. Microphone is activated only by the recording control and stopped on background/interruption.
- Conversation history is bounded to the last 40 non-interrupted messages for requests; long-term semantic memory is not implemented.
- The app has manual search/note/reminder actions; natural-language action execution and integrated web answers remain unfinished.
- Natural voice parity, authored motions, real lip sync and final character acceptance remain open. UI automation covers startup, local notes and adaptive layout screenshots.

## Sources

- [Three VRM](https://github.com/pixiv/three-vrm)
- [Sample avatar license](https://github.com/vrm-c/vrm-specification/tree/master/samples/VRM1_Constraint_Twist_Sample)
- [Apple: distributing apps to registered devices](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices/)

No secrets, paid API use, third-party messages or external releases are part of the local implementation.
