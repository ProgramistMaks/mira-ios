# Verification — 2026-11-17

## Interface refinement; character explicitly retained

The user confirmed that they really like Vita. This revision changes only native
interface composition/styles and the labelled browser preview: compact Home / Commands
/ Settings navigation, a left-aligned reply card, smaller rectangular voice controls
and actual state labels. No renderer, camera, lighting, animation or model file changed.
Swift syntax parsing passed. Browser review passed at 390×780, 320×568, 844×390 and
820×1000, including all action hit targets within the frame and no horizontal overflow.
Images are saved separately from the previous cream version. No macOS build was
launched and native typography/glass/layout remain pending verification.


## Cream design selected by the user — local visual review

The user explicitly chose the reference's light cream direction on 2026-11-17.
The native home now uses warm paper/olive/honey tokens, a compact wordmark/header,
a larger character scene and a slim glass conversation dock. Chat/settings adopt
light surfaces, and the Dynamic Island retains its system-dark surface with a
matching honey accent. Character lighting and camera framing were adjusted.
The original Vita asset is unchanged and still differs from the reference character.

TypeScript checks, renderer build, all 27 renderer tests and Swift syntax parsing
passed. The real bundled VRM was visually reviewed in an explicitly labelled browser
preview at 390×780, 320×568, 844×390 and 820×1000, including active conversation and
optional chat. Control bounds and no horizontal overflow passed. The native startup
pixel assertion now requires character color rather than general brightness, which
would incorrectly accept an empty cream background.

These are browser design screenshots, not native screenshots. The final native
layout/glass, accessibility sizes and physical-device voice/search remain unverified.
No GitHub Actions run or new IPA was produced for this design change. See
`Design/README.md` for reproduction and exact preview limitations.


## Last macOS attempt: blocked by GitHub billing

Source at the last macOS attempt: `561dd63` on `rebuild/voice-first` (draft PR #1).
Run `43972857986` did not start any job steps. GitHub check annotation:
“The job was not started because recent account payments have failed or your
spending limit needs to be increased. Please check the 'Billing & plans' section
in your settings”. This establishes an account billing/spending restriction;
it does not distinguish a failed payment from a spending cap. No billing settings
were changed and no further runs were dispatched.

All 79 portable tests passed locally and on macOS. Device compilation/package
validation passed for earlier rebuild source `d6a2c3d`; the subsequent chat/settings
error-presentation correction at `561dd63` has only Swift syntax validation.
The full native suite never executed for this rebuild, so automatic microphone
turn-taking, actual updated playback callbacks and new UI screenshots are unverified.
Live Tavily/device/provider testing and reference-quality acceptance remain open.
No replacement IPA was delivered as finished. The internal older 0.2 artifact does
not include the final modal-error correction and must not be presented as the latest
validated app. See the scoped run records below.

## 0.2 automatic-conversation rebuild — archive passed, test-launch repair

User rejected the delivered candidate and confirmed automatic turn-taking plus a
large character/minimal controls. Branch `rebuild/voice-first` replaces the old
manual voice panel, separates chat, adds measured silence/text endpoint detection,
session-gated microphone restart after actual playback, direct speech fallback,
independent Apple-recognition consent and direct Tavily search with source storage.
All 79 portable tests passed locally (2026-11-16); changed Swift sources also parsed.
Native tests now exercise the new home/chat flow and playback completion/cancellation.
No live Tavily credentials, microphone result or visual parity is claimed by these
local checks. Model downloads/runtime are unchanged; weights remain outside the IPA.
Run `43970432109` for source `d6a2c3d` passed the macOS portable suite,
renderer checks, actual device compilation and package validation. Internal artifact
`14278950881` was downloaded and checked again against the CI report. Version 0.2.0
(build 2), 15,846,409 bytes; SHA256
`d977c5cb05402398ef8b347d1849ddd481ef8f35e143354e29098592c51510c2`.
The original package declares device families `[1, 2]` and all four orientations.
Native execution failed before xcodebuild: the macOS Bash 3.2 script raised
`test_selection[@]: unbound variable` when full scope expanded an empty array under
`set -u`. This is a test-launch bug, not a native assertion result. The script now
uses positional arguments, whose empty expansion is safe; both full/focused argument
paths are checked locally. Simulator and xcodebuild logs are now uploaded even when
no XCResult exists, so CI finalization does not hide the error. This internal IPA
has not been handed to the user as a completed replacement.

Follow-up `43972238536` passed portable checks, then was intentionally cancelled
during device archiving to include a modal error-reporting correction before native
execution. Chat now owns its search/provider error alert and draft-replacement
dialog; settings also displays voice-service errors while presented. The updated UI
case submits a search without a key, verifies a visible Tavily setup error over the
chat sheet and verifies that the query is retained. No native result is claimed for
that cancelled run.

The simulator boot budget is seven minutes because the previous four-minute run
was still finishing first-boot migration. The overall job remains bounded.


## User-reported layout defect — correction not yet visually verified

The user's installed-app screenshot shows a narrow portrait app window within a
wide black system canvas, a small character and a clipped welcome heading. This
is not an acceptable visual delivery. The original downloaded IPA was inspected:
`UIDeviceFamily` is `[1, 2]` and `UISupportedInterfaceOrientations` contains both
portrait and landscape orientations. This does not explain the installed app's
system compatibility presentation or establish that re-signing preserved those
values. The signing/installation tool has been requested; the cause of the outer
black area remains unresolved. Do not claim that a SwiftUI layout change removes
system-imposed compatibility bounds.

The welcome scroll view previously always anchored to the bottom. It now anchors
to the top when history is empty; the empty greeting is compact. Scene sizing now
uses space below the header, reserves room for text/voice controls, and gives the
character a larger share of a fresh portrait conversation. The scene can shrink
when the keyboard reduces the viewport instead of forcing text outside it. The
native startup UI test now checks that the welcome heading is fully contained in
its scroll viewport. Swift syntax parsing and whitespace checks passed; actual
native visual validation of this correction is still pending. No replacement IPA
has been handed to the user as a verified visual fix.

The previously unavailable log for run `43963647091` is now readable: simulator
`bootstatus` exceeded its 240-second timeout before xcodebuild tests began. This
was simulator startup failure, not a new test assertion or compilation failure.

## Compact IPA delivered for user signing

Package-only run `43965968225` completed successfully for source
`bc59a0e31195bd3a3857cdd171cca2ac3ce16b6f` on macos-26-intel / Xcode 26.6.
Artifact `14278025083` contains `Mira-unsigned.ipa` and its package report. The
15,832,236-byte IPA was downloaded and validated again locally; every report
field and SHA256 matched CI:
`7fec75061b760cb4e5cff19a4455439504e856782d88e795e336a21d8be50f19`.

The package includes the arm64 iPhone app, VRM character/renderer, linked llama
runtime and WidgetKit extension. It targets iOS 18+ and contains no model weights;
those are downloaded from the app catalogue. It is unsigned and requires the
user's certificate/profiles, including the nested framework and widget extension.
Local delivery path: `/workspace/outputs/Mira-unsigned.ipa`.

This run performed device compilation, renderer build checks and actual IPA
validation. Shared/native suites and model inference were intentionally skipped
in package-only mode. Earlier 70 native unit and three UI passes remain scoped to
the revisions below; the latest pinned voice layout and warm-route test are not
newly simulator-validated. Physical-device installation and reference-quality
acceptance remain open. No public release was created.

## User-requested faster package delivery

Run `43963647091` (source `3fbfd42`) passed the repaired shared/HTTP checks,
restored the cached runtime and compiled/validated the updated device IPA. Its
native test step failed before creating an XCResult; no simulator artifact was
uploaded. The subsequently recovered log confirms a simulator first-boot timeout at 240 seconds.
The latest pinned voice controls and corrected warm-route test remain unverified.

The user explicitly asked to speed up delivery. The workflow now saves the internal
IPA immediately after device/package validation instead of withholding it behind
the simulator job. Full testing remains the default; an explicit `package_only`
mode packages the same app for the user's signing/device test without repeating
shared/native tests or model inference. This mode does not mean those checks ran
or that reference-quality acceptance was achieved. Renderer build checks and the
actual package validator still run as part of `build-ios.sh`.

## Controlled disconnect fixture repair

Focused follow-up `43962565432` (source `9296c13`) stopped before archive/native
execution: 70 of 71 portable tests passed, but the ignore-Range case had zero saved
bytes after its first truncated response. Startup/preflight succeeded; this was
not a recurrence of the Python-launch issue. The fixture had flushed 128 KiB and
immediately shut down its socket, assuming URLSession had already delivered it.

The fixture now waits for an explicit disconnect request after the test observes
128 KiB actually saved by the real downloader. A ten-second client deadline and
twenty-second server deadline bound failure. The test then requests a real socket
drop and verifies that resuming an ignored Range restarts without duplicating the
prefix. The same helper covers redirect/replacement/invalid-range cases. No
application or transport implementation changed. All 71 local tests passed, and
ten repeated real-HTTP runs of the previously failing case passed. This repair
still needs the macOS follow-up; no failure was skipped or turned into success.

## Complete-package native results and focused follow-up

Run `43953994238` tested source `6a5eadab89c7ea0ab8b215bc8df9ab1e40bda665` on
macos-26-intel / Xcode 26.6 / iOS 26.5 (iPhone 17 simulator). The standalone HTTP
preflight, all 71 portable Swift tests and five package guards passed. The llama
runtime was prepared and cached. The actual device archive and generated compact
IPA passed the checks for the embedded renderer, VRM, runtime and widget binary.

The saved simulator logs establish **70 native unit tests passed**, including real
TTS playback, mouth amplitude, stop/resume/completion, shared lifecycle, voice,
chat recovery and widget integration. **Three UI tests passed**: startup and
persistent/offline notes with portrait/landscape checks, model selection and
cancelled download, and the voice-mode draft/review/settings flow. The fourth UI
test failed on draft retention after widget navigation. The run reached its
45-minute job limit during result finalization; the XCResult is incomplete, so
standard screenshot export failed and IPA publication was skipped. This is not a
successful complete workflow or a deliverable artifact.

The diagnostic archive (`14274347059`) contains the test logs and seven raw PNG
attachments. Those screenshots were recovered and inspected internally: the
character is present in portrait/landscape, native glass and the catalogue are
legible, but the voice Send button fell below the viewport. The controls now use a
bottom safe-area inset, and the portrait voice scene uses 46% rather than 52% to
leave more room for the editable transcript. A new assertion requires both Send
and Record to be hittable without scrolling.

The route failure was a test-harness error: `XCUIApplication.open` launched a new
process for every URL (PIDs 43038, 44114, 44680, 45045, 45577). The in-memory draft
was therefore discarded by relaunch, not by the warm route under test. The first
cold URL launch remains; subsequent links use `XCUIDevice.shared.system.open` to
exercise OS routing to the running app. An assertion now checks the typed draft
before navigation as well as after it. Apple API references:
- https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/open(_:)
- https://developer.apple.com/documentation/xcuiautomation/xcuisystem/open(_:)

The next run uses the explicit `voice_and_routes` test scope: both changed UI
scenarios plus a fresh complete device archive/package check. Full remains the
workflow default. Other production logic is unchanged from the passing native
unit and three UI results above; repeating all those scenarios and multi-GB
inference downloads would not resolve these two findings. The new scope and view
changes passed shell/Swift syntax checks locally; native confirmation is pending.
The compact package remains for user signing/device testing, not a claim of
reference-quality parity or measured physical-device refresh rate.

## Previous native attempt and HTTP fixture repair

The pending macos-15-intel run `43950455692` was cancelled before any step executed.
After confirming the current official runner image/toolchain inventory, one
replacement was dispatched on macos-26-intel / Xcode 26.6 / iOS 26.5:
https://github.com/ProgramistMaks/mira-ios/actions/runs/43952016853
It executed source `cc7397833d562a6c4ebac5928e36d8987091d31a`; there were no parallel
runs. This host started successfully. Toolchain setup passed and 59 shared tests
passed, including the new mouth/voice logic. Twelve HTTP tests failed before any
transfer because their Python helper never published readiness within twenty
seconds; stderr was empty. The device archive and native simulator tests were
skipped, so no new IPA was produced by that run.

The fixture now launches with a minimal child environment, excluding XCTest/DYLD
injection variables, and CI passes the exact interpreter used by a standalone
loopback preflight. The HTTP server binds numeric loopback without `getfqdn`,
restores normal termination, and records startup stage markers for diagnosis.
These remove host-dependent startup behavior without bypassing download tests or
altering the application's network code. The original log does not identify
which startup operation stalled; the next run confirmed the combined repair on macOS.
All 71 tests passed locally after the repair, and the twelve HTTP cases also passed
with an explicit interpreter path. The standalone fixture probe passed as well.

## Single IPA packaging request

The user requested one installable package and explicitly chose to keep model
weights downloadable inside the app. The current environment is Linux, with no
signing secret bindings or local certificate/profile files found. GitHub's secrets
listing returned HTTP 403, so the account's signing-secret availability could not
be established. A certificate is still required for installation; no signed output
is claimed.

The device packaging script now stages a fresh Payload instead of merging into an
old directory/ZIP. `check-ipa.py` verifies archive integrity, arm64 iOS device
executables (rejecting simulator binaries), linked/embedded llama runtime, the VRM
character and renderer, widget configuration/version matching, required privacy
descriptions and absence of model weights. It emits a package report with SHA256
and an explicit statement that it has not validated a code signature.

Five synthetic packaging guard tests passed, plus shell syntax/whitespace checks.
The downloaded previous actual native artifact from run `43841702974` was inspected
internally: its app/runtime are iOS arm64, but the current package validator rejects
it because it predates `MiraWidgets.appex`. It is not a substitute for the current
app and was not delivered. The cancelled run was replaced sequentially; see the
active validation above. No parallel duplicate builds were dispatched.

## Voice conversation milestone — local checks completed

This batch adds a voice conversation panel with a larger existing character scene,
editable transcript, explicit send, completed-answer replay, interrupt-and-record,
Stop without recording, mode switching with draft retention, actual microphone
level feedback and bounded final-recognition draining. It retains command review,
local-only recognition restrictions and cancellation on interruptions/backgrounding.
Playback never automatically reopens the microphone.

- All **71 portable XCTest cases passed** with Swift 6.2.3 on Linux. Eight new
  cases cover phase gating, real sample-based RMS, channel stride, invalid input,
  delayed recognition completion, final-result cancellation and obsolete timeouts.
- Changed native files and the new UI test passed Swift syntax parsing. This does
  not type-check Apple APIs or validate native layout and audio behavior.
- The new native UI test exercises mode entry without microphone use, shared draft
  retention, explicit command review/cancellation and returning from settings.
  No live provider requests or microphone recordings were used in local checks.
- Native archive/UI/audio evidence for this milestone is pending. Model pins,
  inference runtime and renderer are unchanged; repeat model downloads/inference
  are unnecessary for this batch. A single combined native workflow is appropriate
  under the user's request to validate substantial additions rather than each edit.

One combined native run was dispatched for source
`f755eee1319642cbc6ef3407f871f6e9b407970f`:
https://github.com/ProgramistMaks/mira-ios/actions/runs/43950455692
Inputs: macos-15-intel, Xcode 26.2, iOS 26.2, real model inference disabled because
the runtime/model pins did not change. At the last check the run was **queued**
with no executed steps. This is not compilation/test evidence. Do not dispatch a
duplicate run while it remains pending; inspect this run when resuming work.

## Animation pause/resume — shared display timeline

The renderer now uses the display callback timestamp for a shared pose/physics
timeline. Native scene activation and browser visibility reset the time origin;
the first resumed frame advances by zero rather than applying up to 50 ms of hidden
time. Repeated active-state updates do not restart the clock. Skipped callbacks
preserve elapsed time, while visible stalls retain the existing 50 ms step bound.

- TypeScript checking, renderer unit tests and the Safari-targeted bundle build
  passed. Four new timeline cases cover a greeting pose across a long pause with
  no hidden callbacks, repeated state updates, hidden callbacks, elapsed motion at
  30/60/120/240, rate changes, invalid timestamps and visible stalls.
- The production scene browser probe passed with controlled display timestamps:
  it preserves scene time on resume, advances by 1/120 and 1/240 seconds at the
  injected intervals, and stays paused across a long gap. Existing actual VRM
  mouth checks also passed. The timestamp injection and read-only observations
  exist only in the test harness, not the shipped renderer.
- The full renderer browser regression passed with the new pacer/timeline: four
  phases at three viewport sizes, touch/drag filtering, Reduced Motion, canvas
  pause/resume, WebGL recovery and load errors. All eighteen facial morph checks
  stayed exact and 1,188 real-model stance poses retained planted feet within the
  existing tolerance. No external requests were observed on the production page.
- This is local Chromium and deterministic scheduling evidence, not measured
  120/240 fps on a physical display or WKWebView lifecycle validation. No hosted
  iOS workflow, native test suite or model inference was run for this change.

## Requested 120/240 fps animation modes — local checks only

Animation settings now persist a 120 fps default request with 30/60/120/240 options.
The scene reports its actual window screen's maximum; unsupported options are
disabled and native scheduling clamps to that limit. ProMotion opt-in is present
in Info.plist. The renderer no longer hard-caps normal animation at 60 or thinking
at 30; low power, serious heat and Reduce Motion retain the 30 fps cap.

- TypeScript checking, all renderer unit tests, the Safari-targeted bundle build,
  Swift syntax parsing for the three changed app files and plist parsing passed.
  Four new pacing cases cover 30/60/120/240 targets on simulated 30/60/90/120/144/240
  Hz callbacks, fractional timestamp jitter, changing rates, stalls and invalid
  input. The acting test now verifies identical elapsed-time poses through 240 fps.
- No native build, browser benchmark or device measurement was run for this setting
  change, respecting the user's build budget. Existing browser results below
  predate the new pacer. Apple SDK type checking, the native picker and screen
  callback, and sustained high-refresh behavior remain pending.
- These tests establish scheduling arithmetic, not delivered 120/240 fps. WebKit,
  iOS, GPU load and the physical display still determine actual frame delivery.
  Apple's screen API documentation currently specifies up to 120 fps on iOS
  ProMotion. The 240 option remains unavailable unless the host reports support.

## Bounded mouth updates — portable and browser checks

The audio bridge now retains one in-flight JavaScript evaluation and only the newest
pending sample per document. Frames carry capture time and sequence; receipt no
longer gives delayed audio samples a fresh lifetime. Visibility/readiness gates the
native mouth clock, and phase/visibility changes invalidate renderer samples.

- All **63 portable XCTest cases passed**, including seven new bridge cases for
  backpressure/coalescing, stale samples, clock reversal, stop, visibility,
  document reset and late acknowledgements. The same source/tests are included
  in the XcodeGen app/test targets.
- TypeScript checking, renderer unit tests and the Safari-targeted bundle build
  passed. Five new renderer cases cover timestamp validity/expiry, ordering,
  phase changes and visibility. Swift syntax parsing passed for the changed app
  files; this is not an Apple SDK type check.
- A browser probe runs the production renderer with a read-only accessor added
  only to its temporary test bundle. Actual VRM mouth weights open on fresh input,
  close after expiry/stop, reject delayed/reordered data, stay closed outside speech
  and recover after hide/resume. Reduced Motion retains this audio feedback.
- The full renderer browser regression also passed: four phases/three viewport
  sizes, touch/drag handling, pause/resume, WebGL recovery and missing-model errors.
  Facial morph equivalence stayed exact across eighteen cases; all 1,188 planted-foot
  poses passed the existing contact/orientation/leg-length tolerance checks.
- The implementation remains amplitude-based, not phoneme lip sync. WKWebView
  callback behavior, Apple integration, Bluetooth/device timing and reference-video
  quality remain unverified. No hosted iOS workflow was dispatched; no IPA or
  screenshots were delivered.

## Chat recovery — portable logic verified, native integration pending

The production cloud transport now delegates SSE decoding to `ConversationCore`.
Explicit length/filter/unsupported stops remain interrupted; EOF never certifies
completion. New optional metadata preserves the originating question and reason.
Streamed text is checkpointed approximately once per second, with immediate saves
at completion/error/cancellation and invalidation of obsolete delayed callbacks.
Only the active reply shows loading. “Вернуть вопрос” restores the question without
sending it, confirms replacement of a nonempty draft, and is disabled during
generation/recording. Incomplete replies do not automatically start voice playback.

- Swift 6.2.3 compiled the actual shared source; **all 56 XCTest cases passed**.
  Sixteen new cases cover byte-delivered Russian/emoji text, SSE framing/BOM,
  role/usage events, terminal reasons, empty/malformed/error streams, event/output
  limits, interrupted-message migration, question linking/legacy recovery, draft
  replacement protection, checkpoint coalescing and obsolete callback rejection.
- Swift syntax parsing passed for the changed native app files. The shared sources
  and tests are wired into the XcodeGen app/native unit-test targets. Syntax parsing
  does not type-check Apple SDK calls or validate SwiftUI presentation.
- No real provider calls or credentials were used. Native URLSession integration,
  UI/focus behavior, protected disk writes, abrupt termination/background recovery
  and voice integration remain unverified. A sudden termination can lose the text
  since the last successful checkpoint; the change does not promise zero data loss.
- No macOS/iOS workflow was dispatched, following the user's build-budget policy.
  Local model pins/runtime and renderer sources are unchanged in this update.

## Planted-foot character acting — local renderer validation

The six authored clips now include bounded pelvis weight shifts, turns and dips.
An analytic two-bone solver bends the legs while preserving the original foot
positions/orientations in avatar-local space. It compensates pelvis height when
needed to avoid extending a leg beyond its length. The stance resets its input
rotations every frame; Reduce Motion blends back to the original quiet stance.

- TypeScript checking, all fourteen renderer unit tests and the Safari-targeted
  renderer bundle build passed. Five new cases cover all clips with both VRM
  facing conventions, transformed/scaled parents, rapid transitions, Reduce Motion,
  repeated rest poses, bounded/invalid input and incomplete leg rigs.
- The real-model Chromium probe sampled **1,188 poses** across all six clips while
  turning the parent scene. It checked normalized and retargeted raw foot contacts,
  raw foot orientation, leg lengths and forward knee bending with a `1e-5` tolerance.
  Pelvis displacement exceeded 1 cm, so the contact check did not pass by keeping
  the entire model motionless.
- The browser suite also covers four sustained phases at three viewport sizes,
  hit-tested touch, drag rejection, scene pause/resume, Reduce Motion, WebGL recovery,
  unchanged optimized facial morphs, no external requests and explicit load failure.
  Front and three-quarter screenshots were inspected internally for pose/framing.
- This is local Chromium/WebGL evidence. It does not establish WKWebView performance,
  device frame times, final acting quality or parity with the user's reference videos.
  Per the build-budget preference, no hosted workflow was dispatched and no IPA or
  screenshots were delivered. Apple SDK/inference sources and model pins are unchanged.

## Native validation resumed after user confirmation

The user confirmed iOS build availability. Run `43932686138` tested source
`c1fedc7deddc36ef9250ce593a52a6f539b89685` on macos-15-intel / Xcode 26.2.
The runner started successfully; the previous billing rejection did not recur.
The Swift package compiled on macOS and its twenty-eight interaction/file-reader
tests passed, but all twelve HTTP cases failed during fixture setup before making
their requests. The fixture's two-second readiness window expired or its process
exited; stderr was suppressed, so that run does not identify the exact cause.
Archive and native simulator tests were consequently skipped.

The fixture now allows twenty seconds for cold startup and includes subprocess
diagnostics in setup errors. All forty tests still pass locally on Linux after
this change. A focused transfer/resume check also passed with an injected three-second
Python startup delay. A fresh hosted run is required to confirm the macOS correction.

Retry `43934113790`, source `ddc7e2d79f20e1172a6db746f7113be20365e39f`,
waited roughly fifteen minutes for macos-15-intel and then failed before any step:
"The job was not acquired by Runner of type hosted even after multiple attempts".
This is a runner-allocation failure, distinct from the earlier billing rejection
and the first resumed run's HTTP fixture failure.

Fallback `43936091765` targeted the same source with the macos-15 Apple Silicon
runner selection and Xcode 26.2 / iOS 26.2 inputs. It also failed after roughly
fifteen minutes without executing any step, with the same runner-allocation error.
GitHub additionally annotated this run: "Due to capacity constraints, jobs targeting
macOS arm64 runners may experience longer queue times."
Both retries are completed; neither produced an archive, native test result or IPA.
No payment/account settings were changed and no additional retry was dispatched.

## File verification progress and pause feedback

The model store now uses `ModelFileVerifier` to stream completed files into the
existing CryptoKit SHA256 check in 1 MiB chunks. The UI shows verification percent,
an explicit pausing state until cleanup finishes, and a separate label for a
fully downloaded file awaiting verification. Late transfer callbacks cannot replace
verification progress or a pending pause. A complete saved file no longer requires
the extra 1 GB download reserve before checking/installing it.

- All **40 portable XCTest cases passed** with Swift 6.2.3 on Linux. Six new cases
  exercise actual file reads: bounded chunks and exact bytes/progress, failed digest
  approval, short/oversized/empty input, cancellation during reading and a complete
  retry from the preserved file, cancellation before reading, and a missing file.
  These tests inject the digest decision; they do not execute Apple's CryptoKit.
- Changed Swift files passed syntax parsing and whitespace checks. This is not an
  Apple SDK type check. Native progress/pause presentation and the CryptoKit/store
  integration still need iOS validation.
- No hosted build was started. Per the user's latest instruction, native builds
  remain paused until they confirm availability. No IPA or screenshots delivered.

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

Native run `43927090461` for source `b287ced9c7b805a523045ccc9fea91fd1bdcd336`
was rejected before any build step on 2026-11-16. GitHub reported that recent account
payments failed or the spending limit needs increasing. It did not compile or run
tests. Runtime/model inference re-downloads were disabled for this transfer-only
attempt; model pins and the inference runtime are unchanged from earlier validated
source. No payment, spending-limit or account settings were modified, and no further
native attempts were submitted after this rejection. No finished IPA or screenshots
are delivered before the release gate passes.

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

- TypeScript type check, fourteen current renderer tests and renderer bundle build passed.
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
