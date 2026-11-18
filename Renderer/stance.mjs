import { Euler, Quaternion, Vector3 } from 'three';

const bounded = (pose, key, limit) => Number.isFinite(pose[key]) ? Math.max(-limit, Math.min(limit, pose[key])) : 0;
const ease = x => { x = Math.min(1, Math.max(0, x)); return x*x*(3-2*x); };
const footPose = () => ({position:new Vector3(), rotation:new Quaternion(), knee:new Vector3()});

// Analytic two-bone IK on the normalized VRM rig. Contact points are stored in
// avatar-local space, so turning the whole character never drags its feet.
class PlantedLeg {
  constructor(root, upper, lower, foot, forward, toes) {
    Object.assign(this, { root, upper, lower, foot, forward, toes });
    this.restUpper = upper.quaternion.clone();
    this.restLower = lower.quaternion.clone();
    this.restFoot = foot.quaternion.clone();
    this.anchor = root.worldToLocal(foot.getWorldPosition(new Vector3()));
    this.offset = new Vector3(); this.footEuler = new Euler(); this.footTilt = new Quaternion();
    this.anchorRotation = root.getWorldQuaternion(new Quaternion()).invert()
      .multiply(foot.getWorldQuaternion(new Quaternion()));
    this.takeoff = footPose();
    this.landing = footPose();
    this.transferBend = new Vector3();
    if(toes){
      this.toeLever=root.worldToLocal(toes.getWorldPosition(new Vector3())).sub(this.anchor);
      this.toeRest=toes.quaternion.clone();
      this.toeInFoot=foot.getWorldQuaternion(new Quaternion()).invert().multiply(toes.getWorldQuaternion(new Quaternion()));
      this.rollAxis=new Vector3(1,0,0);
      this.heelRotation=new Quaternion();this.rolledLever=new Vector3();
    }
    for (const name of ['a', 'b', 'c', 'target', 'direction', 'bend', 'knee', 'source', 'desired']) this[name] = new Vector3();
    this.parentRotation = new Quaternion(); this.worldRotation = new Quaternion(); this.swing = new Quaternion();
  }
  reset() {
    this.upper.quaternion.copy(this.restUpper);
    this.lower.quaternion.copy(this.restLower);
    this.foot.quaternion.copy(this.restFoot);
  }
  capture(pose, inverseRoot) {
    this.upper.getWorldPosition(this.a);
    this.foot.getWorldPosition(pose.position);
    this.direction.subVectors(pose.position,this.a).normalize();
    this.lower.getWorldPosition(pose.knee).sub(this.a);
    pose.knee.addScaledVector(this.direction,-pose.knee.dot(this.direction)).applyQuaternion(inverseRoot);
    if (pose.knee.lengthSq() < 1e-10) pose.knee.set(0,0,this.forward);
    pose.knee.normalize();
    this.root.worldToLocal(pose.position);
    this.foot.getWorldQuaternion(pose.rotation).premultiply(inverseRoot);
  }
  measure() {
    this.upper.getWorldPosition(this.a); this.lower.getWorldPosition(this.b); this.foot.getWorldPosition(this.c);
    this.target.copy(this.anchor).add(this.offset); this.root.localToWorld(this.target);
    this.upperLength = this.a.distanceTo(this.b); this.lowerLength = this.b.distanceTo(this.c);
  }
  configure(pose, side, height) {
    this.offset.set(0, 0, 0); this.measure();
    const knee = Math.max(0, bounded(pose, side + 'Knee', 1.4));
    const a = this.upperLength, b = this.lowerLength;
    const worldScale = this.root.getWorldScale(this.direction).y;
    const kneeLift = (a + b - Math.sqrt(a*a + b*b + 2*a*b*Math.cos(knee))) / Math.max(1e-8, worldScale);
    const seat = Math.max(0, bounded(pose, 'floorSeat', 1));
    this.offset.set((side === 'left' ? -1 : 1) * bounded(pose, side + 'FootSide', .18),
      Math.max(0, bounded(pose, side + 'FootLift', .1)), bounded(pose, side + 'FootForward', .09 + .09 * seat) * this.forward).multiplyScalar(height);
    this.offset.y += kneeLift;
    this.footTilt.setFromEuler(this.footEuler.set(-this.forward * bounded(pose, side + 'FootPitch', .4), 0, bounded(pose, side + 'FootRoll', .2)));
    this.foldedAnkle = seat;
    const outward = .45 * seat;
    this.kneeUp = 1.08 * seat;
    this.kneeIn=(side==='left'?1:-1)*(bounded(pose,side+'KneeIn',.65)-outward);
    this.rollFoot=this.toes && Number.isFinite(pose[side+'HeelRoll']);
    if(this.rollFoot){
      const roll=bounded(pose,side+'HeelRoll',.55);
      this.heelRotation.setFromAxisAngle(this.rollAxis,this.forward*roll);
      // Rotate around the ball of the foot. Rotating at the ankle alone
      // sinks the toe below the floor as the heel comes up.
      this.rolledLever.copy(this.toeLever).applyQuaternion(this.heelRotation);
      this.offset.add(this.toeLever).sub(this.rolledLever);
      this.toeContact=Math.max(0,bounded(pose,side+'ToeContact',1));
    }
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
  solve(rootRotation, transferring) {
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
    if (transferring) this.bend.copy(this.transferBend);
    else this.bend.set(this.kneeIn, this.kneeUp, this.forward);
    this.bend.applyQuaternion(rootRotation);
    this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction)).normalize();
    this.knee.copy(this.a).addScaledVector(this.direction, along).addScaledVector(this.bend, height);
    this.aim(this.upper, this.source.subVectors(this.b, this.a), this.desired.subVectors(this.knee, this.a));
    this.lower.getWorldPosition(this.b); this.foot.getWorldPosition(this.c);
    this.aim(this.lower, this.source.subVectors(this.c, this.b), this.desired.subVectors(this.target, this.b));
    this.worldRotation.copy(rootRotation);
    if(this.rollFoot)this.worldRotation.multiply(this.heelRotation);
    this.worldRotation.multiply(this.anchorRotation).multiply(this.footTilt);
    this.foot.parent.getWorldQuaternion(this.parentRotation).invert();
    this.foot.quaternion.copy(this.parentRotation.multiply(this.worldRotation));
    // Once the ankles cross, release the floor orientation and let each
    // foot follow its shin. Contact transfers retain their cached orientation.
    if (!transferring && this.foldedAnkle) this.foot.quaternion.slerp(this.restFoot, .70*this.foldedAnkle);
    if(this.rollFoot){
      this.toes.quaternion.copy(this.toeRest);
      // Keep the toe pad level during contact; let it follow the foot in flight.
      this.worldRotation.copy(rootRotation).multiply(this.anchorRotation).multiply(this.footTilt).multiply(this.toeInFoot);
      this.toes.parent.getWorldQuaternion(this.parentRotation).invert();
      this.toes.quaternion.slerp(this.parentRotation.multiply(this.worldRotation),this.toeContact);
    }
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
      this.legs.push(new PlantedLeg(root, upper, lower, foot, forward, bone(side+'Toes')));
    }
    this.position = new Vector3(); this.up = new Vector3(); this.rotation = new Quaternion();
    this.tilt = new Quaternion(); this.euler = new Euler();
  }
  apply(pose) {
    // An incomplete rig keeps its original pose; never animate only one leg.
    if (this.legs.length !== 2) return;
    const side = bounded(pose, 'hipsSide', 0.09), forward = bounded(pose, 'hipsForward', 0.02);
    const seat = Math.max(0, bounded(pose, 'floorSeat', 1));
    const drop = Math.max(0, bounded(pose, 'hipsDrop', 0.06 + .42 * seat));
    for (const [index, leg] of this.legs.entries()) { leg.reset(); leg.configure(pose, index === 0 ? 'left' : 'right', this.height); }
    this.hips.quaternion.copy(this.restRotation)
      .multiply(this.tilt.setFromEuler(this.euler.set(bounded(pose, 'hipsPitch', .12), bounded(pose, 'hipsYaw', 0.06), bounded(pose, 'hipsRoll', 0.04))));
    this.position.copy(this.origin).addScaledVector(this.up.set(side, -drop, forward * this.forward), this.height);
    this.root.localToWorld(this.position);
    this.hips.position.copy(this.hips.parent.worldToLocal(this.position));
    this.solveContacts();
  }
  solveContacts(transferring = false) {
    this.root.getWorldQuaternion(this.rotation);
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    // A lateral shift can otherwise overextend the far leg. Lower the pelvis
    // just enough to keep both contacts reachable, with fixed bone lengths.
    const extraDrop = Math.max(this.legs[0].requiredDrop(this.up), this.legs[1].requiredDrop(this.up));
    if (extraDrop > 0) {
      this.hips.getWorldPosition(this.position).addScaledVector(this.up, -extraDrop);
      this.hips.position.copy(this.hips.parent.worldToLocal(this.position));
    }
    for (const leg of this.legs) leg.solve(this.rotation,transferring);
  }
  beginTransfer(moving) {
    this.transferring = moving && this.legs.length === 2;
    this.transferPlanned = false;
    if (!this.transferring) return;
    this.root.getWorldQuaternion(this.rotation).invert();
    for (const leg of this.legs) {
      leg.capture(leg.takeoff, this.rotation);
      let clearance = leg.takeoff.position.y-leg.anchor.y;
      if (leg.toes) {
        this.root.worldToLocal(leg.toes.getWorldPosition(this.position));
        clearance = Math.min(clearance,this.position.y-leg.anchor.y-leg.toeLever.y);
      }
      leg.airborne = clearance > .004*this.height;
    }
  }
  sampleLanding() {
    if (!this.transferring) return;
    this.root.getWorldQuaternion(this.rotation).invert();
    for (const leg of this.legs) leg.capture(leg.landing, this.rotation);
    if (this.transferPlanned) return;
    this.transferPlanned = true;
    const [left, right] = this.legs;
    for (const leg of this.legs) {
      const a = leg.takeoff.position, b = leg.landing.position;
      leg.stride = Math.hypot(b.x-a.x, b.z-a.z)/this.height;
    }
    if (Math.max(left.stride, right.stride) < .035) {
      this.transferring = false;
      return;
    }
    // With both feet down, move the right one first. The incoming dance,
    // cheek and folded-arm clips all initiate their own step with the left.
    const leftFirst = left.airborne === right.airborne ? right.stride < .003 : left.airborne;
    const first = leftFirst ? left : right;
    const second = first === left ? right : left;
    first.start = 0;
    first.duration = .25;
    second.start = first.duration;
    second.duration = second.stride >= .003 ? .25 : 0;
    this.transferEnd = second.start + second.duration;
  }
  transferFeet(time) {
    if (!this.transferring) return;
    let support, load = 0;
    for (const leg of this.legs) {
      const u = leg.duration ? Math.max(0, Math.min(1, (time-leg.start)/leg.duration)) : Math.min(time/.4,1);
      // Gain clearance before travelling and finish travelling before landing.
      const travel = ease((u-.13)/.74);
      const arc = leg.duration ? Math.sin(Math.PI*u)**2 : 0;
      if (arc > load) {
        load = arc;
        support = this.legs[0] === leg ? this.legs[1] : this.legs[0];
      }
      this.position.copy(leg.takeoff.position);
      if (leg.airborne && leg.start === 0 && u < .6) {
        // The crossfade carries the outgoing velocity of a foot already in flight.
        this.root.worldToLocal(leg.foot.getWorldPosition(leg.c));
        this.position.lerp(leg.c, 1-ease(u/.6));
      }
      leg.offset.copy(this.position).lerp(leg.landing.position, travel).sub(leg.anchor);
      leg.offset.y += this.height*Math.min(.045,leg.stride*.38)*arc;
      leg.rollFoot = false;
      leg.footTilt.copy(leg.anchorRotation).invert()
        .multiply(this.tilt.copy(leg.takeoff.rotation).slerp(leg.landing.rotation, travel));
      leg.transferBend.lerpVectors(leg.takeoff.knee,leg.landing.knee,ease(time/.4));
      if (leg.transferBend.lengthSq() < 1e-8) leg.transferBend.set(0,0,this.forward);
    }
    if (load > 1e-6) {
      this.root.worldToLocal(this.hips.getWorldPosition(this.position));
      this.up.copy(support.anchor).add(support.offset).sub(this.position);
      this.up.y = 0;
      this.up.multiplyScalar(.16).clampLength(0,.021*this.height);
      this.position.addScaledVector(this.up,load);
      this.root.localToWorld(this.position);
      this.hips.position.copy(this.hips.parent.worldToLocal(this.position));
    }
    this.solveContacts(true);
    if (time >= Math.max(.4,this.transferEnd)) this.transferring = false;
  }
}
