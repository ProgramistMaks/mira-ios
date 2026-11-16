import { Euler, Quaternion, Vector3 } from 'three';

const bounded = (pose, key, limit) => Number.isFinite(pose[key]) ? Math.max(-limit, Math.min(limit, pose[key])) : 0;

// Analytic two-bone IK on the normalized VRM rig. Contact points are stored in
// avatar-local space, so turning the whole character never drags its feet.
class PlantedLeg {
  constructor(root, upper, lower, foot, forward) {
    Object.assign(this, { root, upper, lower, foot, forward });
    this.restUpper = upper.quaternion.clone();
    this.restLower = lower.quaternion.clone();
    this.restFoot = foot.quaternion.clone();
    this.anchor = root.worldToLocal(foot.getWorldPosition(new Vector3()));
    this.anchorRotation = root.getWorldQuaternion(new Quaternion()).invert()
      .multiply(foot.getWorldQuaternion(new Quaternion()));
    for (const name of ['a', 'b', 'c', 'target', 'direction', 'bend', 'knee', 'source', 'desired']) this[name] = new Vector3();
    this.parentRotation = new Quaternion(); this.worldRotation = new Quaternion(); this.swing = new Quaternion();
  }
  reset() {
    this.upper.quaternion.copy(this.restUpper);
    this.lower.quaternion.copy(this.restLower);
    this.foot.quaternion.copy(this.restFoot);
  }
  measure() {
    this.upper.getWorldPosition(this.a); this.lower.getWorldPosition(this.b); this.foot.getWorldPosition(this.c);
    this.target.copy(this.anchor); this.root.localToWorld(this.target);
    this.upperLength = this.a.distanceTo(this.b); this.lowerLength = this.b.distanceTo(this.c);
  }
  requiredDrop(up) {
    this.measure();
    this.direction.subVectors(this.a, this.target);
    const vertical = this.direction.dot(up);
    const horizontalSquared = Math.max(0, this.direction.lengthSq() - vertical * vertical);
    const reach = this.upperLength + this.lowerLength;
    return Math.max(0, vertical - Math.sqrt(Math.max(0, reach * reach - horizontalSquared)));
  }
  aim(node, source, desired) {
    if (source.lengthSq() < 1e-12 || desired.lengthSq() < 1e-12) return;
    this.swing.setFromUnitVectors(source.normalize(), desired.normalize());
    node.getWorldQuaternion(this.worldRotation).premultiply(this.swing);
    node.parent.getWorldQuaternion(this.parentRotation).invert();
    node.quaternion.copy(this.parentRotation.multiply(this.worldRotation));
  }
  solve(rootRotation) {
    this.measure();
    const distance = this.direction.subVectors(this.target, this.a).length();
    if (distance < 1e-8 || this.upperLength < 1e-8 || this.lowerLength < 1e-8) return;
    this.direction.divideScalar(distance);
    // The authored stance stays near neutral. Clamp unreachable input without
    // stretching bones or allowing NaNs at the fully straight rest pose.
    const reach = Math.min(this.upperLength + this.lowerLength,
      Math.max(Math.abs(this.upperLength - this.lowerLength) + 1e-8, distance));
    const along = (this.upperLength ** 2 - this.lowerLength ** 2 + reach ** 2) / (2 * reach);
    const height = Math.sqrt(Math.max(0, this.upperLength ** 2 - along ** 2));
    this.bend.set(0, 0, this.forward).applyQuaternion(rootRotation);
    this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction)).normalize();
    this.knee.copy(this.a).addScaledVector(this.direction, along).addScaledVector(this.bend, height);
    this.aim(this.upper, this.source.subVectors(this.b, this.a), this.desired.subVectors(this.knee, this.a));
    this.lower.getWorldPosition(this.b); this.foot.getWorldPosition(this.c);
    this.aim(this.lower, this.source.subVectors(this.c, this.b), this.desired.subVectors(this.target, this.b));
    this.worldRotation.copy(rootRotation).multiply(this.anchorRotation);
    this.foot.parent.getWorldQuaternion(this.parentRotation).invert();
    this.foot.quaternion.copy(this.parentRotation.multiply(this.worldRotation));
  }
}

export class PlantedStance {
  constructor(root, bone, height, forward = 1) {
    this.root = root; this.height = height; this.forward = forward;
    this.hips = bone('hips'); this.legs = [];
    if (!this.hips || !Number.isFinite(height) || height <= 0) return;
    this.restRotation = this.hips.quaternion.clone();
    this.origin = root.worldToLocal(this.hips.getWorldPosition(new Vector3()));
    for (const side of ['left', 'right']) {
      const upper = bone(`${side}UpperLeg`), lower = bone(`${side}LowerLeg`), foot = bone(`${side}Foot`);
      if (!upper || !lower || !foot) { this.legs = []; return; }
      this.legs.push(new PlantedLeg(root, upper, lower, foot, forward));
    }
    this.position = new Vector3(); this.up = new Vector3(); this.rotation = new Quaternion();
    this.tilt = new Quaternion(); this.euler = new Euler();
  }
  apply(pose) {
    // An incomplete rig keeps its original pose; never animate only one leg.
    if (this.legs.length !== 2) return;
    const side = bounded(pose, 'hipsSide', 0.025), forward = bounded(pose, 'hipsForward', 0.02);
    const drop = Math.max(0, bounded(pose, 'hipsDrop', 0.025));
    for (const leg of this.legs) leg.reset();
    this.hips.quaternion.copy(this.restRotation)
      .multiply(this.tilt.setFromEuler(this.euler.set(0, bounded(pose, 'hipsYaw', 0.06), bounded(pose, 'hipsRoll', 0.04))));
    this.position.copy(this.origin).addScaledVector(this.up.set(side, -drop, forward * this.forward), this.height);
    this.root.localToWorld(this.position);
    this.hips.position.copy(this.hips.parent.worldToLocal(this.position));
    this.root.getWorldQuaternion(this.rotation);
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    // A lateral shift can otherwise overextend the far leg. Lower the pelvis
    // just enough to keep both contacts reachable, with fixed bone lengths.
    const extraDrop = Math.max(this.legs[0].requiredDrop(this.up), this.legs[1].requiredDrop(this.up));
    if (extraDrop > 0) {
      this.hips.getWorldPosition(this.position).addScaledVector(this.up, -extraDrop);
      this.hips.position.copy(this.hips.parent.worldToLocal(this.position));
    }
    for (const leg of this.legs) leg.solve(this.rotation);
  }
}
