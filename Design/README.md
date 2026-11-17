# Cream companion design — 2026-11-17

The user chose the light cream interface in the first Astra reference video.
The current direction uses warm paper, dark olive text, honey accents and thin
translucent controls. The character shares the background with the interface;
the large boxed conversation panel is replaced by a compact three-action dock.
A compact left-aligned reply card replaces the oversized centered heading. The
header groups Home, Commands and Settings in a thin rounded navigation surface.
A small footer shows actual AI-selection and microphone state, plus the iOS voice
provider; it never claims a connection or model is ready merely because a key exists. Wide screens
place the character beside the controls. Settings and chat remain separate sheets.

Implemented in `CompanionApp.swift`, `CompanionBackdrop.swift`,
`VoiceHomeControls.swift` and the shared glass styles. Renderer lighting is warm
and the camera fits the character more closely. Existing VRM, actions, speech,
model download and search behavior are retained. The user explicitly approved Vita after reviewing the cream design. Keep its model,
animation, lighting and camera; do not replace it just to copy Astra. This approval
does not establish device performance or voice quality.

`cream.html` is an explicitly labelled **browser design preview**, using the actual
bundled Three/VRM renderer. Its controls only demonstrate layout/states. No microphone,
AI, model downloads or search services are invoked. The screen selector covers settings, models, voice, search, cloud, commands,
empty chat, sample messages, widgets, appearance and data. Shared paper cards,
source links and grouped navigation follow the native implementation, but browser
forms approximate SwiftUI rather than reproducing its exact layout. Sample messages
are labelled examples; credentials and downloads do not invoke services. CSS approximates
the glass; it is not native Liquid Glass or a screenshot from an iOS build.

Run from the repository root:

```sh
npm run build
python3 -m http.server 8765 --bind 127.0.0.1
# Open http://127.0.0.1:8765/Design/cream.html
```

For reproducible browser screenshots, with Playwright Chromium installed:

```sh
node Scripts/review-cream-design.mjs
```

Screenshots default to `/tmp/mira-cream-review`; override `MIRA_DESIGN_OUTPUT` to
choose another directory. The script loads the real character and checks controls
inside the preview frame at 390×780, 320×568, 844×390 and 820×1000. It also captures
an active conversation state, then checks all 11 secondary screens at widths
390, 320 and 844, catalogue filtering, command tabs and draft-only suggestions.
Use `MIRA_REVIEW_PAGES_ONLY=1` to limit a review to secondary screens without
repeating unchanged home captures. These checks do not
prove SwiftUI layout, physical iPhone sizing, native glass or automatic speech.
No paid macOS workflow was run for this design change; the last GitHub billing
restriction remains unresolved. Native startup's pixel check was adapted so a
bright cream background alone cannot count as a visible character.


## Themes and Duo preview

The toolbar now selects Cream, Night, Sakura or Sage, plus a **simulated** book or
tabletop fold. Scenario, editor, voice library, theme and character pages are design
previews of the new native destinations. All service/file actions remain disabled
or explicitly labelled demonstrations in the browser. The microphone is drawn as
an SVG; musical-note glyphs and reply playback buttons were removed.

`MIRA_REVIEW_DUO_ONLY=1` runs the four-theme / five-size-posture visual matrix
without repeating the secondary form checks. See `Docs/DUO-AND-REFERENCE-FEATURES.md`
for the actual SDK requirements and unverified native behavior. Native lighting,
geometry and character content are unchanged by theme switching.
