# Character asset

Vita (β Ver AvatarSample_3), VRoid Project / pixiv Inc. — CC0.

Authoritative conditions:
https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use
https://vroid.pixiv.help/hc/en-us/articles/360014900113
https://creativecommons.org/publicdomain/zero/1.0/

Download mirror: https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Vita.vrm
SHA256: f2bf78f28a24e2f75f5ca0b6c3b646654c394e4b03592dfaa0d0633ef0972b4d

The original, unmodified VRM0 metadata declares title=Vita, licenseName=CC0,
allowedUserName=Everyone, commercialUssageName=Allow.
The model is a starting character candidate, not a claim of original character authorship
or final visual parity with the user's reference videos.

Three.js and @pixiv/three-vrm are MIT-licensed. The renderer build emits bundled
code license notices in avatar.js.LEGAL.txt. Earlier commits used the pixiv
VRM1_Constraint_Twist_Sample under VRM Public License 1.0 as a technical fixture.

The six motion curves in `Renderer/acting.mjs` were authored specifically in this
project. They do not contain third-party VRMA, dance or motion-capture assets.
They animate the existing character rig and do not change the model's authorship.

## Whole-body animation (2026-11-17)

The default natural mode now uses retargeted CC0 clips from **Quaternius Universal
Animation Library Standard 3.0** (Quaternius; animator Gonzalo Furnier credited by
the pack author). https://quaternius.itch.io/universal-animation-library

Additional takes are used for jogging, sprinting, chair seating and jumping.
Astra's Nayu catalogue references several of the same Quaternius takes.
Mira's motion tracks are converted from the public Quaternius Standard release.

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
Full provenance and reproducible conversion: `Renderer/motions/LICENSE.md` and
`Scripts/import-authored-motion.mjs`. These are authored game animations, not
motion capture, and are not extracted from Astra or the user's videos.
