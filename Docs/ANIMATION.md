# Character acting and rendering

`Renderer/acting.mjs` contains six original authored keyframe clips: idle, listening, thinking, speaking, greeting and touch. They drive the normalized VRM torso, neck, head, upper/lower arms, wrists, finger joints and eye target. Hips/feet remain planted; this is not full-body motion capture or the final reference-quality animation set.

- Smoothstep interpolation keeps adjacent keys and loop seams continuous. State changes blend from the last displayed pose, including an interrupted transition. Listening/thinking/speaking interrupt a decorative greeting or touch reaction.
- Greeting is a one-shot wave with authored wrist reversals. A separate touch nod has a cooldown. Repeated native idle updates do not restart the greeting.
- Character touches are ray-tested against the currently posed model. Background taps, vertical/horizontal drags, cancelled pointers and additional fingers do not trigger the touch clip. Drag rotates the parent turntable; VRM0 orientation correction remains intact.
- Reduce Motion settles into a quiet pose and disables decorative touch/greeting and drag rotation. Blinks and actual-audio mouth feedback remain available. Eye blinks have uneven intervals.
- Body clips do not invent mouth motion: the existing audible-PCM amplitude and 180 ms stale-sample cutoff still control the jaw. Phoneme articulation remains unfinished.
- Native code requests a 30 fps cap under Low Power Mode or serious/critical thermal state; normal cap is 60. Thinking and Reduce Motion also cap at 30. These are scheduling limits, not measured iPhone frame rates or energy claims.
- The canvas pauses while the scene is inactive or settings/commands cover it, then resumes the same loaded model. No new network access or conversation/credential bridge data is introduced.

Validation: unit tests exercise loop seams, one-shot return, rapid interruption, gesture priority/cooldown, Reduce Motion, and matching elapsed-time poses at 30/60 fps. Browser tests exercise the real VRM, all four sustained states at three viewport sizes, hit-tested touch and drag/background rejection, pause/resume, and explicit model-load errors. Native iOS evidence is recorded in VERIFICATION.md.

The workflow's real-inference check defaults to enabled. For changes confined to character/UI code it can be disabled after verifying the local model catalogue, inference code and runtime are unchanged from a previously successful inference run. This animation update retains the runtime tested in run `43829220890`.
