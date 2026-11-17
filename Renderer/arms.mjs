import { Quaternion, Vector3 } from 'three';

// Palm rotation follows the actual elbow-to-wrist axis: even normalized VRMs can
// have a slightly angled forearm. Apply axial twist before elbow bend, otherwise
// the wrist centre sweeps sideways when only the palm should turn.
const finite = (pose, key, limit) => Number.isFinite(pose[key])
  ? Math.max(-limit,Math.min(limit,pose[key])) : 0;

export class ArmRig {
  constructor(bone, armSign) {
    this.armSign=armSign===-1?-1:1;
    this.twist=new Quaternion();
    this.arms=['left','right'].map(side=>{
      const upper=bone(`${side}UpperArm`),lower=bone(`${side}LowerArm`),hand=bone(`${side}Hand`);
      const axis=lower&&hand?lower.worldToLocal(hand.getWorldPosition(new Vector3())):new Vector3(1,0,0);
      if(axis.lengthSq()<1e-12)axis.set(1,0,0);
      axis.normalize();if(axis.x<0)axis.negate();
      return {side,sign:side==='left'?1:-1,upper,lower,hand,axis};
    });
  }
  apply(pose) {
    for(const {side,sign,upper,lower,hand,axis} of this.arms) {
      const facing=this.armSign, turn=finite(pose,`${side}Palm`,1.2)*facing;
      upper?.rotation.set(finite(pose,`${side}Roll`,.55),
        -sign*finite(pose,`${side}Forward`,1.12),
        sign*facing*(1.2-finite(pose,`${side}Lift`,1.7)));
      if(lower){
        lower.rotation.set(0,0,-sign*facing*finite(pose,`${side}Elbow`,2.6));
        lower.quaternion.multiply(this.twist.setFromAxisAngle(axis,turn));
      }
      hand?.rotation.set(lower?0:turn,sign*facing*finite(pose,`${side}Flex`,.45),
        sign*facing*finite(pose,`${side}Wrist`,.4),'ZYX');
    }
  }
}
