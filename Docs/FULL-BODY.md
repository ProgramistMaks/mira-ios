# Full-body articulation and secondary motion

Vita's appearance, base camera and lighting are retained. `Renderer/body.mjs`
adds 93 bounded channels shared by the native settings and the browser test site.
These are controls, not 93 independent animation clips. The existing 52 gestures
and 29,952 compositional IDs remain stable.

## Available movement

- All 30 finger joints, including VRM-normalized thumb metacarpal/proximal/distal;
  independent left/right phalanges, finger spread and thumb opposition.
- Shoulder elevation/protraction; upper arm, elbow, forearm axial twist and
  two wrist axes. Forearm rotation preserves the wrist centre.
- Spine/chest, three neck and head axes, pelvis translation and three rotations.
- Knee-driven foot lift, explicit foot lift/forward/side targets, ankle pitch/roll
  and toes. Two-bone IK preserves bone lengths and the other foot's contact.
  Manual knee input sets an IK target through chain geometry, not an exact knee
  angle when other pelvis/foot controls are combined. This is not a walking system.
- VRM eye yaw/pitch, separate eyelids and five existing mouth vowel morphs.
  Face demonstration is explicitly a test. During speaking, real audio amplitude
  retains mouth priority; phoneme extraction/lip sync is not implemented here.
- Natural behavior adds separated finger motion, thumb opposition, mild shoulder
  participation, neck rotation and pelvis micro-motion. Dedicated hands/body/legs/
  face demos and manual controls replace normal gestures until reset. Transitions
  use velocity-preserving joint following, and Reduce Motion overrides test loops too.

The original Vita asset has no separate coccyx bone. This region moves through the
pelvis. Extreme simultaneous manual joint angles can intersect body/clothing;
there is no full-body contact or self-collision solver.

## Physics and mesh

The existing VRM asset has 18 spring groups / 80 simulated joints: hair 50, skirt
18, sleeves 8, other 4 (authored bust chains). Original collider memberships are
retained. A single VRM update hook advances springs at 120 Hz with at most six
steps per rendered frame, bounded wind and softness settings. This is simulation
frequency, not a claim of 120 rendered FPS. Hidden time is not replayed. Physics
can be disabled and respects Reduce Motion; re-enabling resets stale state.

Hair, skirt and sleeve motion uses bone-chain springs. It is not surface cloth
simulation, cloth self-collision, or independently simulated rigid accessories.
Unrigged/fixed accessories follow their parent skin bones. Making every such
piece swing independently requires authoring its geometry, weights, attachment
bones and collision shapes; no fake independent accessory physics is claimed.

Vita initially has 26,130 triangles (hair 11,972). Optional hair subdivision
produces 62,046 total triangles (hair 47,888), interpolating skin weights and UVs
while retaining the original rest surface and face morphs. It does not create
new strands or texture detail. Standard density is the default. High-density
geometry is bounded, opt-in, and released when returning to standard. Imported
meshes with morph targets, excessive size or unsupported geometry are not
subdivided. More vertices do not by themselves create more physical joints.

## Verification on 2026-11-17

- 50 renderer unit tests: phalanx isolation, control limits, smooth reset, all
  demo loops, incomplete rigs, nonaccumulating transforms, leg contacts, skin
  interpolation, fixed physics steps at 30/60/120/240 rendering schedules.
- `node Scripts/check-body-rig.mjs`: loads the actual bundled GLB/VRM with texture
  decoding replaced by a single pixel (no browser/GPU). Checks all 30 phalanges,
  real shoulder lift direction, supported eye/vowel controls, 5 animation modes,
  spring transforms, normalized interpolated weights and both mesh counts.
  Maximum normalized foot target error is below 1e-12 model units. This is
  geometry/skeleton evidence, not visual quality or physical iPhone performance.
- TypeScript check and renderer production build; Swift syntax parsing only,
  without an Apple SDK. Native compile and device acceptance remain outstanding.
- Private Site tests exercise the real control wiring in a DOM model. Managed
  browser QA is unavailable; no substitute browser-control path was used.

No paid macOS workflow was dispatched for this update. The last known GitHub
billing block remains unresolved; no new IPA is claimed. See QUALITY.md.

## Natural behavior revision

`natural-behavior.mjs` replaces short repeated secondary loops with seeded,
phase-aware events and quiet intervals: sequential finger release, palm opening,
wrist relaxation, thumb/index gathering, finger extension/spread, one-sided
shoulder adjustment, attentive nod and foot unloading after support transfer.
Events avoid immediate repetition; they do not infer emotion or semantic agreement.
Large authored arm gestures suppress competing hand events. Greeting, touch,
manual catalogue choices, body demos and Reduce Motion retain priority.

Gaze changes start in the eyes; head, neck, trunk, wrists and phalanges use
separate critically damped response rates with velocity preserved through target
changes. Breath duration and inhale/exhale timing vary by cycle. Weight shifts
hold for 9–18 seconds instead of continuously rocking side to side. Natural gaze
uses VRM's supported eye control and irregular blinks, occasionally paired.
The upper-chest bone now participates in breathing and torso movement.
Audio remains the sole source of speaking mouth amplitude; no synthetic lip sync.

54 renderer tests pass, including deterministic event schedules, actual pauses,
context suppression, joint limits, interruption continuity and frame-rate
independence of the joint follower. The real Vita geometry probe runs 90 seconds
of natural movement plus joint demonstrations; foot-target error remains below
1e-12 model units. TypeScript/build and Swift syntax checks pass. This does not
establish human-quality acting: visual review, contact quality and measured
physical iPhone performance remain unverified. No paid native build dispatched.
