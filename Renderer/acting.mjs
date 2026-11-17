// Original hand-authored motion curves for Mira, in radians. No third-party clips.
// Pelvis translation is a fraction of avatar height; stance IK keeps feet planted.
export const REST = Object.freeze({
  hipsSide: 0, hipsDrop: 0, hipsForward: 0, hipsYaw: 0, hipsRoll: 0,
  spineX: 0, spineZ: 0, chestX: 0, chestY: 0, chestZ: 0,
  neckX: 0, headX: 0, headY: 0, headZ: 0,
  leftLift: 0, rightLift: 0, leftElbow: 0.10, rightElbow: 0.10,
  leftRoll: 0, rightRoll: 0, leftForward: 0, rightForward: 0, leftWrist: 0, rightWrist: 0,
  leftPalm: 0, rightPalm: 0, leftCurl: 0.16, rightCurl: 0.16,
  leftFlex: 0, rightFlex: 0,
  leftShoulderLift: 0, rightShoulderLift: 0, leftShoulderForward: 0, rightShoulderForward: 0,
  leftChestReach: 0, rightChestReach: 0, leftWaveReach: 0, rightWaveReach: 0,
  gazeX: 0, gazeY: 0, smile: 0.10,
});
const ease = x => x * x * (3 - 2 * x);
const keys = Object.keys(REST);
const timeline = (duration, loop, base, frames) => ({
  duration, loop, frames: frames.map(([at, pose]) => ({ at, pose: { ...REST, ...base, ...pose } })),
});

export const CLIPS = {
  idle: timeline(8.8, true, {}, [
    [0, {}],
    [2.4, { hipsSide: 0.012, hipsDrop: 0.003, hipsRoll: -0.012, spineX: -0.008, chestZ: 0.009, headY: 0.025, gazeX: 0.035, leftElbow: 0.13 }],
    [4.6, { hipsSide: -0.010, hipsDrop: 0.003, hipsRoll: 0.010, chestZ: -0.009, neckX: 0.008, headY: -0.035, gazeX: -0.045, rightElbow: 0.14 }],
    [6.6, { spineX: -0.006, headX: -0.012, gazeY: 0.015 }],
    [8.8, {}],
  ]),
  listening: timeline(7.4, true, { hipsSide: -0.006, hipsDrop: 0.004, hipsForward: 0.006, chestX: 0.018, headZ: 0.055, leftElbow: 0.16, rightElbow: 0.13, smile: 0.13 }, [
    [0, {}],
    [1.0, { hipsDrop: 0.006, headX: 0.055, neckX: 0.018 }],
    [1.65, { headX: -0.012 }],
    [3.6, { headZ: 0.025, headY: -0.025, gazeX: -0.018 }],
    [5.7, { headX: 0.022 }],
    [7.4, {}],
  ]),
  thinking: timeline(9.6, true, {
    hipsSide: 0.015, hipsDrop: 0.005, hipsRoll: -0.016, hipsYaw: -0.020,
    rightLift: 0.55, rightForward: 0.95, rightElbow: 2.40, rightPalm: -0.18, rightCurl: 0.42,
    chestY: -0.025, headZ: -0.055, headY: -0.055, gazeX: -0.10, gazeY: 0.075, smile: 0.035,
  }, [
    [0, {}],
    [1.6, { headX: -0.025, rightWrist: 0.06 }],
    [4.0, { headY: -0.015, gazeX: -0.04, rightCurl: 0.22 }],
    [6.4, { headX: 0.02, headZ: -0.035 }],
    [9.6, {}],
  ]),
  speaking: timeline(8.4, true, { leftLift: 0.06, rightLift: 0.04, leftElbow: 0.22, rightElbow: 0.17, smile: 0.16 }, [
    [0, {}],
    [1.1, { hipsSide: -0.012, hipsDrop: 0.005, hipsYaw: 0.020, leftLift: 0.67, leftElbow: 1.18, leftPalm: -0.6, leftCurl: 0.035, chestY: 0.025, headZ: -0.025 }],
    [2.0, { hipsSide: -0.009, hipsDrop: 0.004, leftLift: 0.60, leftElbow: 1.05, leftPalm: -0.5, leftCurl: 0.05, headX: 0.035 }],
    [3.1, {}],
    [4.4, { hipsSide: 0.012, hipsDrop: 0.005, hipsYaw: -0.020, rightLift: 0.52, rightElbow: 1.08, rightPalm: 0.55, rightCurl: 0.04, chestY: -0.025, headZ: 0.025 }],
    [5.5, { hipsSide: 0.009, hipsDrop: 0.004, rightLift: 0.40, rightElbow: 0.9, rightPalm: 0.4, rightCurl: 0.06, headX: 0.025 }],
    [6.5, { headX: 0.035 }],
    [7.1, { headX: -0.012 }],
    [8.4, {}],
  ]),
  greeting: timeline(3.25, false, {}, [
    [0, {}],
    [0.68, { hipsSide: 0.014, hipsDrop: 0.007, hipsRoll: -0.018, leftLift: 1.34, leftElbow: 1.35, leftCurl: 0, leftWrist: -0.12, headZ: -0.04, smile: 0.23 }],
    [1.02, { hipsSide: 0.014, hipsDrop: 0.007, hipsRoll: -0.018, leftLift: 1.34, leftElbow: 1.35, leftCurl: 0, leftWrist: -0.32, headZ: -0.04, smile: 0.23 }],
    [1.37, { hipsSide: 0.014, hipsDrop: 0.007, hipsRoll: -0.018, leftLift: 1.34, leftElbow: 1.35, leftCurl: 0, leftWrist: 0.27, headZ: -0.04, smile: 0.23 }],
    [1.72, { hipsSide: 0.014, hipsDrop: 0.007, hipsRoll: -0.018, leftLift: 1.34, leftElbow: 1.35, leftCurl: 0, leftWrist: -0.24, headZ: -0.04, smile: 0.23 }],
    [2.08, { hipsSide: 0.012, hipsDrop: 0.006, hipsRoll: -0.014, leftLift: 1.34, leftElbow: 1.35, leftCurl: 0, leftWrist: 0.20, headZ: -0.04, smile: 0.23 }],
    [2.42, { hipsSide: 0.008, hipsDrop: 0.003, hipsRoll: -0.010, leftLift: 1.24, leftElbow: 1.32, leftCurl: 0.04, headZ: -0.015, smile: 0.18 }],
    [3.25, {}],
  ]),
  touch: timeline(2.0, false, {}, [
    [0, {}],
    [0.32, { hipsDrop: 0.014, hipsForward: -0.005, chestX: -0.025, headZ: -0.065, leftLift: 0.10, rightLift: 0.12, leftElbow: 0.40, rightElbow: 0.36, smile: 0.27 }],
    [0.76, { hipsDrop: 0.008, hipsForward: 0.003, headX: 0.065, neckX: 0.02, headZ: -0.025, leftElbow: 0.30, rightElbow: 0.26, smile: 0.24 }],
    [1.24, { headX: -0.02, headZ: 0.025, smile: 0.18 }],
    [2.0, {}],
  ]),
};

export function blendPose(a, b, weight) {
  if (weight <= 0) return { ...a };
  if (weight >= 1) return { ...b };
  const pose = { ...REST };
  for (const key of keys) pose[key] = a[key] + (b[key] - a[key]) * weight;
  return pose;
}
export function sampleClip(name, age) {
  const clip = CLIPS[name];
  const t = clip.loop ? Math.max(0, age) % clip.duration : Math.max(0, Math.min(age, clip.duration));
  let index = 1;
  while (index < clip.frames.length - 1 && t > clip.frames[index].at) index++;
  const a = clip.frames[index - 1], b = clip.frames[index];
  return blendPose(a.pose, b.pose, ease((t - a.at) / (b.at - a.at)));
}

// All transitions start at the last displayed pose, including rapid interruptions.
export class ActingController {
  phase = 'idle'; clip = 'idle'; reduced = false; age = 0; time = 0;
  fadeAge = 1; fadeDuration = 0.42; from = { ...REST }; pose = { ...REST };
  lastTouch = -Infinity;
  begin(clip, duration = 0.42) {
    this.from = { ...this.pose }; this.clip = clip; this.age = 0;
    this.fadeAge = 0; this.fadeDuration = duration;
  }
  setPhase(phase) {
    if (!['idle', 'listening', 'thinking', 'speaking'].includes(phase) || phase === this.phase) return;
    this.phase = phase; this.begin(phase);
  }
  trigger(clip) {
    if (this.reduced || this.phase !== 'idle' || !['greeting', 'touch'].includes(clip)) return false;
    if (clip === 'touch' && (this.time - this.lastTouch < 1.25 || this.clip === 'greeting')) return false;
    if (clip === 'touch') this.lastTouch = this.time;
    this.begin(clip, 0.18); return true;
  }
  update(delta, reduced = false) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
    this.time += dt;
    if (reduced !== this.reduced) { this.reduced = reduced; this.begin(this.phase, 0.42); }
    this.age += dt; this.fadeAge += dt;
    if (!CLIPS[this.clip].loop && this.age >= CLIPS[this.clip].duration) this.begin(this.phase);
    const target = this.reduced ? { ...REST, smile: sampleClip(this.phase, 0).smile } : sampleClip(this.clip, this.age);
    this.pose = blendPose(this.from, target, ease(Math.min(1, this.fadeAge / this.fadeDuration)));
    return this.pose;
  }
}
