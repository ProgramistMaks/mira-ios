# Compositional character performances

The user's request for over 10,000 animations is implemented as **13,824 selectable
combinations**, not 13,824 independently authored clips or motion-capture recordings:

| Dimension | Choices |
| --- | ---: |
| Authored additive gesture tracks | 24 |
| Emotional expressions | 12 |
| Gaze targets | 8 |
| Grounded stance offsets | 6 |

`Renderer/expression-library.mjs` is the catalogue source. The renderer build emits
`Web/expression-catalog.json`; native settings decode that manifest and use the same
mixed-radix identifiers. There is no animation download, additional model or service.
The minified renderer and manifest add approximately 17 KB before IPA compression.
Vita's asset, lighting and camera are unchanged.

## Behavior

`PerformanceController` composes these tracks with the six existing conversational
clips. State changes and settings changes blend from the last displayed composed
pose over 0.65 seconds. Direct greeting/touch clips take priority over additive arm
gestures. Idle choices have quiet intervals; listening uses a restrained subset,
thinking uses contemplative gestures and speaking includes explanatory gestures.
Sad, serious and surprised styles require explicit selection rather than being
randomly assigned to ordinary conversation. This is phase-based behavior, not
semantic sentiment analysis or detection of the user's emotions.

Automatic selection excludes the previous 64 combinations and stores only that
bounded recent history. At most 65 probes select the next identifier; the renderer
does not expand thousands of clips in memory. Manual selection uses four pickers
under Settings → Character → Emotions and movements. The same page controls
intensity, a persistent mood, automatic selection and disabling the added variety.

Pelvis offsets use the existing planted-foot IK. Joint ranges and combined facial
weights are bounded. Surprise resolves both VRM1 `surprised` and Vita's custom
VRM0 `Surprised` expression. Imported VRMs lacking a morph skip that channel; the
catalogue is not a guarantee that every imported rig supports the same expressions.
Reduce Motion settles all added body motion and freezes gesture cycling, retaining
static expression, blinking and real-audio mouth feedback. Mouth amplitude remains
driven by PCM; no procedural syllables or phoneme-lip-sync claim is introduced.

## Evidence and limits

The exhaustive numeric test samples three points of every combination and compares
all pose channels after quantizing to 1e-5. All 13,824 sampled trajectories differ.
This establishes distinct animation inputs, **not** that every pair looks strikingly
different to a viewer. Five samples of each combination also satisfy finite-value,
joint and facial limits. Additional tests cover interruption continuity, no recent
repeats, phase eligibility, manual persistence, reduced motion and consistent
elapsed-time poses at simulated 30/60/120/240 Hz.

The browser QA exercises the actual bundled Vita with six representative composed
performances. Its separate real-rig probe checks every gesture/stance pair on four
conversational base poses at two points, alongside the original six clips. This
does not exhaustively validate visual self-intersection for every combination.
Native settings typechecking, WKWebView timing, measured frame rate, battery use,
physical Duo screens and reference-quality acceptance still need device evidence.
See [current results](VERIFICATION.md) and [release gate](QUALITY.md).
