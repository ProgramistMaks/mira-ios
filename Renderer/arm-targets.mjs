import { Matrix4, Quaternion, Vector3 } from 'three';
import { ReferenceFrame } from './reference-poses.mjs';

// Body-relative semantic hand targets. Two-bone IK preserves segment lengths;
// reach weights blend from the currently authored wrist path, not a fixed T-pose.
export class ArmTargets {
  constructor(root,bone,height,armSign=1){
    this.root=root;this.height=height;this.forward=-armSign;this.armSign=armSign;
    this.chest=bone('chest');this.neck=bone('neck');this.head=bone('head');this.arms=[];
    if(bone('leftUpperArm') && bone('rightUpperArm') && bone('hips'))this.referenceFrame=new ReferenceFrame(root,bone,armSign);
    for(const side of ['left','right']){
      const upper=bone(side+'UpperArm'),lower=bone(side+'LowerArm'),hand=bone(side+'Hand');
      if(!upper||!lower||!hand)continue;
      const index=bone(side+'IndexProximal'),middle=bone(side+'MiddleProximal'),little=bone(side+'LittleProximal');
      let localForward=new Vector3(side==='left'?-armSign:armSign,0,0),localPalm=new Vector3(0,0,this.forward);
      if(index&&middle&&little){
        localForward=hand.worldToLocal(middle.getWorldPosition(new Vector3())).normalize();
        const i=hand.worldToLocal(index.getWorldPosition(new Vector3())),l=hand.worldToLocal(little.getWorldPosition(new Vector3()));
        localPalm.crossVectors(i,l).normalize();
        if(localPalm.z*this.forward<0)localPalm.negate();
      }
      const localSide=new Vector3().crossVectors(localForward,localPalm).normalize();localPalm.crossVectors(localSide,localForward).normalize();
      const localBasis=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(localSide,localForward,localPalm));
      this.arms.push({side,upper,lower,hand,localBasis,axis:hand.position.clone().normalize(),goal:new Vector3()});
    }
  }
  resetTwist(){
    for(const arm of this.arms)arm.twistUnwrapped=undefined;
  }
  aim(node,source,destination){
    if(source.lengthSq()<1e-12||destination.lengthSq()<1e-12)return;
    const swing=new Quaternion().setFromUnitVectors(source.normalize(),destination.normalize());
    const world=node.getWorldQuaternion(new Quaternion()).premultiply(swing);
    node.quaternion.copy(node.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
  }
  apply(pose, paths = {}){
    if(!this.chest||!this.neck)return;
    if(paths.left?.projection || paths.right?.projection)this.referenceFrame?.measure();
    for(const arm of this.arms){
      const {side,upper,lower,hand}=arm,s=side==='left'?-this.armSign:this.armSign;
      const safe=key=>Number.isFinite(pose[key])?pose[key]:0;
      const chest=Math.max(0,Math.min(1,safe(side+'ChestReach'))),wave=Math.max(0,Math.min(1,safe(side+'WaveReach')));
      const path = paths[side];
      const weight=path ? path.weight : Math.max(chest,wave);if(weight<1e-6){arm.twistUnwrapped=undefined;continue;}
      const isWave=wave>chest,anchor=path ? this[path.anchor] ?? this.chest : isWave?this.neck:this.chest;
      // Keep the wrist in front of the garment; this is a near-chest gesture,
      // not a claim of cloth contact/self-collision simulation.
      const target=anchor.localToWorld(new Vector3(s*(isWave?.19:.045)*this.height,
        (isWave?.025:.065)*this.height,this.forward*(isWave?.06:.07)*this.height));
      if(isWave){const shift=this.root.getWorldQuaternion(new Quaternion());target.add(new Vector3(safe(side+'Wrist')*.065*this.height,0,0).applyQuaternion(shift));}
      if (path) {
        const [lateral, vertical, forward] = path.position;
        target.set(s*lateral, vertical, this.forward*forward).multiplyScalar(this.height);
        anchor.localToWorld(target);
        if(path.projection)this.referenceFrame?.place(target,path.projection.x,path.projection.y,path.projection.z,path.projectionWeight);
      }
      const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3()),c=hand.getWorldPosition(new Vector3());
      const l1=a.distanceTo(b),l2=b.distanceTo(c);if(l1<1e-8||l2<1e-8)continue;
      const originalUpper=upper.quaternion.clone(),originalLower=lower.quaternion.clone(),originalHand=hand.quaternion.clone();
      const destination=target.clone();arm.goal.copy(destination);
      const direction=destination.clone().sub(a),distance=direction.length();if(distance<1e-8)continue;direction.divideScalar(distance);
      const minimumReach=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(2.6));
      const reach=Math.max(minimumReach,Math.min(l1+l2-1e-6,distance));
      destination.copy(a).addScaledVector(direction,reach);
      const along=(l1*l1-l2*l2+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,l1*l1-along*along));
      const pole=this.chest.localToWorld(new Vector3(s*(path?.elbow ?? .18)*this.height,-.11*this.height,this.forward*.045*this.height));
      if(path?.projection)this.referenceFrame?.place(pole,path.projection.elbowX,path.projection.elbowY,path.projection.elbowZ,path.projectionWeight);
      pole.sub(a);
      pole.addScaledVector(direction,-pole.dot(direction));if(pole.lengthSq()<1e-10)pole.copy(b).sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction));
      pole.normalize();
      const knee=a.clone().addScaledVector(direction,along).addScaledVector(pole,height);
      const originalHandRotation=hand.getWorldQuaternion(new Quaternion());
      this.aim(upper,b.clone().sub(a),knee.clone().sub(a));
      lower.getWorldPosition(b);hand.getWorldPosition(c);this.aim(lower,c.clone().sub(b),destination.clone().sub(b));
      // For a wave: fingers up, palm out. Near chest: fingers diagonal inward,
      // palm towards the torso. Preserve each rig's authored hand basis.
      const up=isWave?new Vector3(0,1,0):new Vector3(-s*.8,.6,0).normalize();
      const palm=new Vector3(0,0,isWave?this.forward:-this.forward);
      if (path) {
        up.set(s*path.fingers[0],path.fingers[1],this.forward*path.fingers[2]).normalize();
        palm.set(s*path.palm[0],path.palm[1],this.forward*path.palm[2]);
        palm.addScaledVector(up,-up.dot(palm)).normalize();
      }
      const across=new Vector3().crossVectors(up,palm).normalize();
      const orientation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across,up,palm));
      const world=anchor.getWorldQuaternion(new Quaternion()).multiply(orientation).multiply(arm.localBasis.clone().invert());
      if(isWave)world.premultiply(new Quaternion().setFromAxisAngle(this.root.getWorldDirection(new Vector3()),safe(side+'Wrist')*.6));
      originalHandRotation.copy(world);
      const local=hand.parent.getWorldQuaternion(new Quaternion()).invert().multiply(originalHandRotation);
      const projected=arm.axis.dot(new Vector3(local.x,local.y,local.z));
      const twist=new Quaternion(arm.axis.x*projected,arm.axis.y*projected,arm.axis.z*projected,local.w).normalize();
      let angle=2*Math.atan2(new Vector3(twist.x,twist.y,twist.z).dot(arm.axis),twist.w);
      if(angle>Math.PI)angle-=2*Math.PI;if(angle< -Math.PI)angle+=2*Math.PI;
      if(arm.twistUnwrapped!==undefined){
        while(angle-arm.twistUnwrapped>Math.PI)angle-=2*Math.PI;
        while(angle-arm.twistUnwrapped< -Math.PI)angle+=2*Math.PI;
      }
      arm.twistUnwrapped=angle;
      angle=Math.max(-1.2,Math.min(1.2,angle));
      // Put axial turning in the forearm, not a large wrist bend. This axis
      // passes through the wrist, so pronation cannot move its centre.
      lower.quaternion.multiply(new Quaternion().setFromAxisAngle(arm.axis,angle));
      const residual=hand.parent.getWorldQuaternion(new Quaternion()).invert().multiply(originalHandRotation);
      const bend=new Quaternion().angleTo(residual);
      hand.quaternion.identity().slerp(residual,Math.min(1,.6/Math.max(1e-8,bend)));
      // Blend whole solved rotations. Blending a near-straight wrist target
      // while instantly changing its elbow pole creates a visible elbow flip.
      upper.quaternion.copy(originalUpper.slerp(upper.quaternion,weight));
      lower.quaternion.copy(originalLower.slerp(lower.quaternion,weight));
      hand.quaternion.copy(originalHand.slerp(hand.quaternion,weight));
    }
  }
}
