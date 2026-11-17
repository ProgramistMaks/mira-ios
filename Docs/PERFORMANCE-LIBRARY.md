# Compositional character performances

The user's request for over 10,000 animations is implemented as **29,952 selectable
combinations**, not 29,952 independently authored clips or motion-capture recordings:

| Dimension | Choices |
| --- | ---: |
| Authored additive gesture tracks | 52 |
| Emotional expressions | 12 |
| Gaze targets | 8 |
| Grounded stance offsets | 6 |

`Renderer/expression-library.mjs` is the catalogue source. The renderer build emits
`Web/expression-catalog.json`; native settings decode that manifest and use the same
mixed-radix identifiers. There is no animation download, additional model or service.
The minified renderer and manifest add approximately 33 KB before IPA compression.
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

Automatic selection excludes the previous 64 combinations and the previous four
gesture tracks. Emotional styles persist for three selections within a conversational
phase; phase changes reset that choice. These histories remain bounded.
At most 65 probes select the next identifier; the renderer
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

## Natural movement update

The 28 appended tracks have distinct preparation, stroke, hold and release poses:
acknowledging, comparing two options, describing a small idea, inviting a response,
remembering, realizing, leaning to listen, transferring weight, relaxing the hands,
opening a palm, explaining in sequence, finishing a thought and settling again.
Disagreement, stopping and celebration are manual-only: automatic phase-based
selection cannot know whether those meanings are appropriate. Existing saved IDs
0–13,823 keep their original four catalogue selections.

Track interpolation uses quintic easing with zero velocity and acceleration at
keys. Eye/head and torso tracks lead the arm slightly; wrists and fingers lag.
The timing offsets vanish at endpoints. A selected arm track takes ownership from
the base conversational arm during the stroke so two large gestures do not stack.
After greeting/touch, the selected gesture restarts at preparation and blends from
the displayed pose. Phrase duration varies gently between selections, not mid-motion;
listening/idle allow longer pauses than speaking.

Continuous, small chest/spine breathing and asymmetric wrist settling use scene
time, so background time cannot fast-forward them. Automatic gaze makes short
glances and returns towards the partner; manual gaze remains selected. Speech
energy smoothly scales arm activity during pauses. A real PCM onset can trigger a
small head/chest emphasis with a refractory interval; sustained amplitude does not
produce metronomic nods. This is amplitude-based emphasis, not word/meaning or
prosody recognition. Reduced Motion and disabling variety bypass these additions.
No new provider, network traffic, motion pack or LLM prompt is involved.

## Independent wrist controls

The previous renderer sent `Palm` to the hand's Y rotation, which bent the hand
sideways rather than turning it around the forearm. `ArmRig` now applies palm
pronation around the measured elbow-to-wrist axis before the elbow bend, while separate `Flex`
and `Wrist` channels bend and deviate the hand itself. Palm turn is bounded to
±1.2 rad, flexion to ±0.45 rad and deviation to ±0.4 rad. Absolute transforms are
reapplied each frame, so repeated gestures cannot accumulate rotation drift.

Four appended tracks (IDs 48–51 in the gesture dimension) explicitly turn and
release the left/right palm or flex the left/right wrist. Upper-arm and elbow
values are held during the turn so the hand movement is visible independently.
Question, comparison and outline gestures also have authored wrist flexion and
larger palm turns. The complete catalogue remains combinations, not independent
motion-capture recordings. Run browser QA with `--wrists` for close-up stroke/turn
images; the default review samples twelve body performances. Test-only read getters
wait for controller progress rather than assuming software-GPU wall time matches
animation time.

## Evidence and limits

The exhaustive numeric test samples three points of every combination and compares
all pose channels after quantizing to 1e-5. All 29,952 sampled trajectories differ.
This establishes distinct animation inputs, **not** that every pair looks strikingly
different to a viewer. Five samples of each combination also satisfy finite-value,
joint and facial limits. Additional tests cover interruption continuity, no recent
repeats, phase eligibility, manual persistence, reduced motion and consistent
elapsed-time poses at simulated 30/60/120/240 Hz.

The browser QA exercises the actual bundled Vita with twelve representative composed
performances. Its separate real-rig probe checks every gesture/stance pair on four
conversational base poses at two points, alongside the original six clips. This
does not exhaustively validate visual self-intersection for every combination.
Native settings typechecking, WKWebView timing, measured frame rate, battery use,
physical Duo screens and reference-quality acceptance still need device evidence.
See [current results](VERIFICATION.md) and [release gate](QUALITY.md).
