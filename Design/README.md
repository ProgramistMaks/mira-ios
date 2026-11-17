# Cream companion design — 2026-11-17

The user chose the light cream interface in the first Astra reference video.
The current direction uses warm paper, dark olive text, honey accents and thin
translucent controls. The character shares the background with the interface;
the large boxed conversation panel is replaced by a compact three-action dock.
A short title and caption replace the previous introductory block. Wide screens
place the character beside the controls. Settings and chat remain separate sheets.

Implemented in `CompanionApp.swift`, `CompanionBackdrop.swift`,
`VoiceHomeControls.swift` and the shared glass styles. Renderer lighting is warm
and the camera fits the character more closely. Existing VRM, actions, speech,
model download and search behavior are retained. The character is still Vita:
its short hair and futuristic outfit do not match Astra's character. This is a
UI redesign, not a claim of final character or voice parity.

`cream.html` is an explicitly labelled **browser design preview**, using the actual
bundled Three/VRM renderer. Its controls only demonstrate layout/states. No microphone,
AI, model downloads or search services are invoked. The optional settings/chat
panels are visual sketches, not replicas of the complete native forms. CSS approximates
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
an active conversation state and the optional chat sketch. These checks do not
prove SwiftUI layout, physical iPhone sizing, native glass or automatic speech.
No paid macOS workflow was run for this design change; the last GitHub billing
restriction remains unresolved. Native startup's pixel check was adapted so a
bright cream background alone cannot count as a visible character.
