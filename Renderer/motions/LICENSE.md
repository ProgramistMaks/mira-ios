# Motion data

Quaternius Universal Animation Library, Standard, version 3.0.
Authors: Quaternius; the official pack page credits animator Gonzalo Furnier.

- Official source: https://quaternius.itch.io/universal-animation-library
- Official description: https://quaternius.com/packs/universalanimationlibrary.html
- License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
- Downloaded the free **Standard** ZIP through the author's itch.io download flow on 2026-11-17. No paid assets or assets from Astra are included.
- Input: `Unreal-Godot/UAL1_Standard.glb`. SHA256 is recorded in `authored.json`.
- Locomotion: Idle_Loop, Dance_Loop, Walk_Loop, Jog_Fwd_Loop and Sprint_Loop.
- Seating: Sitting_Enter, Sitting_Idle_Loop and Sitting_Exit.
- Jumping: Jump_Start, Jump_Loop and Jump_Land.
- The built-in Nayu catalogue in Astra identifies these Quaternius takes for walking, jogging, sprinting, chair seating, falling and landing. Mira loads the public Standard pack. Jump_Start is added to complete the preview sequence.
- `Scripts/import-authored-motion.mjs` samples original joint transforms at 30 Hz relative to A_TPose. Geometry/materials are not included in this motion pack. Runtime quaternions are interpolated at the display rate.

Original License.txt:

    License:
    CC0 1.0 Universal (CC0 1.0)
    Public Domain Dedication
    https://creativecommons.org/publicdomain/zero/1.0/
    Models by @Quaternius
    Consider supporting me on Patreon!
    https://www.patreon.com/quaternius

These are authored game animations, not a claim of motion capture or reconstruction of the user's reference videos. Vita remains separately CC0 as described in `Renderer/public/ASSET-LICENSE.md`.
