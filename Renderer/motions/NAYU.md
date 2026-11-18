# Nayu motion adaptation

The Windows edition can load 52 humanoid takes from the installed Astra 0.2.7 avatar engine: all 49 listed Nayu takes, plus two unlisted idle gestures and a fixed drag pose. The user confirmed permission to transfer and publicly distribute the adapted tracks. Each source file SHA-256, take name, speed and loop setting is recorded in `nayu.json`.

The 19 previews use the original controller's references for entrance, idle and exit clips. Loop counts and the displayed BPM values are preview settings. The UI groups the sequences and the individual takes.

`Scripts/import-nayu-motion.mjs` reads the source FBX and GLB tracks at their original key times. It maps 52 humanoid joints, normalizes root travel to the target skeleton, and stores motion rotations and animated translations in `nayu-motion.bin`. Mira's own model, materials, expressions and physics remain the render target.

`nayu-motion.bin` contains motion only. The original Nayu model and FBX and GLB files are not included in this adaptation. The adaptation contains the copyright holder’s motion data. This statement records permission for the Mira distribution and does not grant downstream redistribution rights.
