# Verification — 2026-11-15

## macOS CI update

The user created private repository `ProgramistMaks/mira-ios` and granted access.
Source was pushed with authorization; manual workflow run `43764306154` succeeded.
Xcode 16.4 / iOS 18.5 SDK compiled the unsigned device archive and all four native
unit tests passed. The artifact is internal, not a deliverable approved against the videos.

Run `43764534875` adds native UI coverage for WKWebView avatar readiness, note
persistence, settings and portrait/landscape screenshots. Its result is pending.
Latest local asset candidate is Vita (CC0), verified in Chromium with corrected
VRM0 orientation and resting pose; older runs contain the previous technical model.
Physical iPhone Duo / iOS 27.3 testing remains unperformed.

## Earlier local checks and initial access blocker

Completed locally on Linux:

- `npm run check`: TypeScript type check passed.
- `npm test`: motion tests passed (silent states, reduced motion, expression bounds).
- `npm run build`: offline renderer bundle generated successfully.
- `Scripts/check-renderer.mjs`: real Chromium/WebGL loaded the 10.3 MiB VRM model, switched through four states at three viewport sizes, made no external network requests, and reported an error for a missing model.
- Internal screenshots inspected. First pass exposed incorrect arm pose and excessive light; both corrected and browser check repeated successfully. This sample remains visually below the reference and is not approved for delivery.
- Project/workflow YAML parsed; shell scripts passed `bash -n`.

Not completed:

- Swift compile and XCTest: no Xcode or iOS SDK in Linux environment.
- WKWebView custom scheme, microphone, TTS, EventKit and live API integration tests.
- Physical iPhone Duo checks, full native UI review, reference-quality animation/voice review.
- Signed or unsigned IPA creation.

GitHub:

- User explicitly authorized creation of a private repository.
- `gh auth status` confirms the connected GitHub account.
- `gh repo create ProgramistMaks/mira-ios --private` was rejected by GitHub: `Resource not accessible by integration (createRepository)`.
- No repository was created; no source was uploaded; no workflow was executed; no signing key was requested.
- User must create a private repo and expose it to the integration, or provide another supported repository-creation authentication path. Existing unrelated repositories were not modified.
