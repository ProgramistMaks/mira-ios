import {Bone, Group, Quaternion, Skeleton, Vector3} from 'three';

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(x,hi));
const ease=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};

// Vita's two tapered ear pieces are stored as rigid hair primitives. Identify
// both in bind space before changing either. Other VRMs retain their own rig.
function earMeshes(avatar, head) {
  if (avatar.meta.metaVersion!=='0' || avatar.meta.title!=='Vita' || !head) return [];
  const pair=[];
  avatar.scene.traverse(mesh=>{
    if (!mesh.isSkinnedMesh || mesh.material?.name!=='F00_000_Hair_00_HAIR_03') return;
    const g=mesh.geometry, p=g.attributes.position;
    g.computeBoundingBox();
    const box=g.boundingBox, side=Math.sign(box.min.x);
    if (Math.sign(box.max.x)!==side || p.count!==(side>0?278:266) ||
        Math.abs(box.max.y-1.711)>.002 || Math.abs(box.min.y-1.540)>.002) return;
    const headIndex=mesh.skeleton.bones.indexOf(head);
    for(let i=0;i<p.count;i++){
      if (g.attributes.skinIndex.getX(i)!==headIndex || g.attributes.skinWeight.getX(i)<.99999) return;
    }
    pair.push({mesh,side,headIndex});
  });
  return pair.length===2 && pair[0].side!==pair[1].side ? pair : [];
}

function bindEar({mesh,side,headIndex}, head) {
  const hinge=new Bone();
  hinge.name=side<0?'MiraEarLeft':'MiraEarRight';
  const base=new Vector3(side*.102,1.627,.009).applyMatrix4(mesh.bindMatrix);
  hinge.position.copy(head.worldToLocal(base));
  head.add(hinge); hinge.updateWorldMatrix(true,false);
  const original=mesh.skeleton, earIndex=original.bones.length;
  const skin=new Skeleton([...original.bones,hinge],[...original.boneInverses,hinge.matrixWorld.clone().invert()]);
  const g=mesh.geometry, p=g.attributes.position;
  // Keep the lower attachment in the scalp. The upper section bends as one
  // piece; the transition is continuous across duplicate seam vertices.
  for(let i=0;i<p.count;i++){
    const w=ease((p.getY(i)-1.602)/.055);
    g.attributes.skinIndex.setXYZW(i,headIndex,earIndex,0,0);
    g.attributes.skinWeight.setXYZW(i,1-w,w,0,0);
  }
  mesh.bind(skin,mesh.bindMatrix);
  return {hinge,side,angle:new Vector3(),speed:new Vector3(),target:new Vector3()};
}

function bindRibs(avatar) {
  const chest=avatar.humanoid.getRawBoneNode('upperChest');
  const manager=avatar.springBoneManager;
  if (!chest || !manager) return;
  const roots=[...manager.joints].filter(j=>j.bone.parent===chest && /^J_Sec_[LR]_Bust1$/.test(j.bone.name));
  if (roots.length!==2) return;
  const anchor=new Group();
  anchor.name='MiraRibExpansion';
  chest.add(anchor);
  for(const joint of roots){
    // Keep the author's pivots, initial matrices and colliders. Re-register
    // the unchanged joints so the manager updates their new ancestor first.
    manager.deleteJoint(joint);
    anchor.add(joint.bone);
    manager.addJoint(joint);
  }
  return anchor;
}

export class VitaSecondary {
  constructor(avatar) {
    this.root=avatar.scene;
    this.head=avatar.humanoid.getNormalizedBoneNode('head');
    const rawHead=avatar.humanoid.getRawBoneNode('head');
    this.ears=earMeshes(avatar,rawHead).map(entry=>bindEar(entry,rawHead));
    this.ribs=this.ears.length?bindRibs(avatar):undefined;
    this.orientation=new Quaternion(); this.previous=new Quaternion();
    this.rootInverse=new Quaternion(); this.deltaRotation=new Quaternion();
    this.rate=new Vector3();
    this.headPosition=new Vector3();
    this.reset();
  }
  reset() {
    this.tracking=false; this.earsActive=false; this.reactionAge=Infinity;
    this.neutralEars();
    this.ribs?.position.set(0,0,0);
  }
  neutralEars() {
    for (const ear of this.ears) {
      ear.angle.set(0,0,0); ear.speed.set(0,0,0); ear.hinge.quaternion.identity();
    }
  }
  rebase() {
    this.tracking=false;
    for (const ear of this.ears) ear.speed.set(0,0,0);
  }
  listenCue() { this.reactionAge=0; }

  update(dt,phase,breath,enableEars) {
    // A common parent moves the original clothing and body skin together.
    this.ribs?.position.set(0,.0018*breath,-.0035*breath);
    if (!this.ears.length) return;
    if (!enableEars) {
      if(this.earsActive) this.neutralEars();
      this.earsActive=false;
      this.tracking=false; this.reactionAge=Infinity; return;
    }
    this.earsActive=true;
    this.root.getWorldQuaternion(this.rootInverse).invert();
    this.head.getWorldQuaternion(this.orientation).premultiply(this.rootInverse);
    this.root.worldToLocal(this.head.getWorldPosition(this.headPosition));
    const height=this.headPosition.y;
    if (!this.tracking || dt<=0) {
      this.previous.copy(this.orientation); this.previousHeight=height; this.tracking=true;
      if(dt<=0) return;
    }
    const rise=clamp((height-this.previousHeight)/dt,-.55,.55);
    this.previousHeight=height;
    this.deltaRotation.copy(this.previous).invert().multiply(this.orientation);
    this.previous.copy(this.orientation);
    const q=this.deltaRotation;
    // Signed shortest-arc angular velocity in head space. Rotating the entire
    // model in the viewer leaves this signal unchanged.
    const k=(q.w<0?-2:2)/dt;
    this.rate.set(clamp(q.x*k,-4,4),clamp(q.y*k,-4,4),clamp(q.z*k,-4,4));
    const steps=Math.max(1,Math.ceil(dt*240)), h=dt/steps;
    const attentive=phase==='listening', thinking=phase==='thinking';
    const pitch=-.07*this.rate.x+.12*rise-(attentive ? .082 : 0);
    const yaw=-.095*this.rate.y, roll=-.085*this.rate.z;
    for (const ear of this.ears) {
      const {angle,speed,target,side}=ear;
      // Small substeps give the same damped follow-through at 30/60/120 Hz.
      const frequency=side<0?24:22, delay=side<0?0:.075;
      const thoughtfulTilt=thinking ? (side<0 ? .16 : .045) : 0;
      const tilt=side*(.17*rise+thoughtfulTilt);
      const attentiveTurn=attentive ? side*.078 : 0;
      const drag=Math.exp(-1.42*frequency*h);
      for(let i=0;i<steps;i++){
        const age=(this.reactionAge+(i+1)*h-delay)/.24;
        const flick=age>0 && age<1 ? Math.sin(Math.PI*age)**2 : 0;
        target.set(clamp(pitch-.12*flick,-.28,.28),
          clamp(yaw+attentiveTurn+side*.13*flick,-.35,.35),
          clamp(roll+tilt+side*.27*flick,-.38,.38));
        speed.addScaledVector(target,h*frequency*frequency).addScaledVector(angle,-h*frequency*frequency);
        speed.multiplyScalar(drag);
        angle.addScaledVector(speed,h);
      }
      ear.hinge.rotation.set(angle.x,angle.y,angle.z,'YXZ');
    }
    this.reactionAge+=dt;
  }
}
