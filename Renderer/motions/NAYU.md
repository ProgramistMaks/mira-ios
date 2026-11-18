# Nayu motion adaptation

The Windows edition can load the 49 humanoid takes from the built-in Nayu set in Astra 0.2.7. Asset reuse for this adaptation was authorized by the user. The original files were found in the installed avatar engine. Each source file SHA-256, take name, speed and loop setting is recorded in `nayu.json`.

`Scripts/import-nayu-motion.mjs` reads the source FBX and GLB tracks at their original key times. It maps 52 humanoid joints, normalizes root travel to the target skeleton, and stores motion rotations and animated translations in `nayu-motion.bin`. Mira's own model, materials, expressions and physics remain the render target.

`nayu-motion.bin` contains motion only. The original Nayu model and FBX and GLB files are not included in this adaptation. This document does not grant a license to redistribute Astra assets.
