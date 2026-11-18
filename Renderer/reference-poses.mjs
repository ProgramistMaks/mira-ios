import rows from './motions/reference-poses.json' with {type:'json'};
import {at} from './staged-gestures.mjs';
import {Quaternion,Vector3} from 'three';

// Source-frame numbers at 30 Hz. Wrist and elbow coordinates are measured
// from the shoulder midpoint, in projected shoulder-to-hip lengths (right, up).
// Then torso lean, shoulder slope and head roll in degrees, followed by fitted
// wrist and elbow-pole depths for each side, positive toward the viewer,
// and the estimated shoulder and head turns in degrees. The fastest takes
// also store fitted lateral and vertical elbow-pole coordinates per arm.
const tracks=Object.fromEntries(Object.entries(rows).map(([id,frames])=>[id,
  Array.from({length:frames[0].length-1},(_,i)=>frames.map(row=>[row[0],row[i+1]]))]));
// Application time of source frame zero, blend-in and blend-out intervals.
// Cuts and captions in the references delimit each usable continuous take.
const timing={
  templeDance:[0,0,.14], arrival:[0,0,.10,4.8,5.5], sitFloor:[0,0,.28],
  welcome:[.40,0,.48,4.18,4.54], dance:[0,0,.30,1.70,1.98],
  temples:[.18,.05,.66,2.64,3.51], cheek:[.89,.05,.91,2.84,3.9],
  fold:[1.0,.09,1.04,3.31,4.51], palms:[.57,.04,.62,2.12,3.53],
  idle:[.4,0,.69],
};
const ramp=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Finger direction and palm roll during the opening drop and one-handed return.
// Degrees from fingers-up, positive toward the performing side.
const welcomeHands={
  left:[[0,-18],[12,-12],[18,28],[24,136],[30,161],[43,165],[114,163]],
  right:[[0,-18],[12,-12],[18,-42],[24,-139],[29,-115],[36,-49],[43,-19],[98,-20],[110,-117],[114,-145]],
  leftRoll:[[0,-48],[18,-39],[23,-14],[29,25],[43,65],[114,65]],
  rightRoll:[[0,-48],[18,-35],[28,8],[43,17],[98,15],[114,-29]],
};
function directPalm(hand,angle,roll){
  const tilt=angle*Math.PI/180, bank=roll*Math.PI/180;
  const x=Math.sin(tilt),y=Math.cos(tilt);
  hand.fingers=[x,y,0];
  hand.palm=[y*Math.sin(bank),-x*Math.sin(bank),Math.cos(bank)];
}
export function referencePose(id,time){
  if(!tracks[id])return;
  const mirror=id==='dance' && Math.floor(time/6)%2===1;
  if(id==='dance')time%=6;
  const [start,enter,ready,release,end]=timing[id];
  const weight=ramp((time-enter)/(ready-enter))*(release===undefined?1:1-ramp((time-release)/(end-release)));
  if(weight<=0)return;
  const curves=tracks[id];
  const first=curves[0][0][0],last=curves[0].at(-1)[0];
  let frame=Math.max(first,(time-start)*30);
  if(id==='idle'){
    const span=last-first;
    frame=last-Math.abs((frame-first)%(2*span)-span);
  }
  // After the opening step, alternate the two temple positions with each transfer.
  if(id==='templeDance' && frame>24) frame=24+(frame-24)%57;
  const v=curves.map(c=>at(c,frame));
  const hand=(i,d,pole)=>({x:v[i],y:v[i+1],elbowX:v[pole]??v[i+2],elbowY:v[pole+1]??v[i+3],z:v[d],elbowZ:v[d+1]});
  const left=hand(0,11,17),right=hand(4,13,19);
  if(id==='arrival' || id==='sitFloor' || id==='templeDance') left.fitDepth=right.fitDepth=true;
  if(id==='welcome'){
    directPalm(left,at(welcomeHands.left,frame),at(welcomeHands.leftRoll,frame));
    directPalm(right,at(welcomeHands.right,frame),at(welcomeHands.rightRoll,frame));
  }else if(id==='arrival'){
    const drop=ramp((frame-27)/18), cheek=ramp((frame-90)/20);
    directPalm(left,12+144*drop,18+47*drop);
    directPalm(right,5+149*drop-164*cheek,-24+92*drop-46*cheek);
  }else if(id==='templeDance'){
    const up=ramp((frame-5)/17);
    directPalm(left,105-151*up,40-18*up);
    directPalm(right,115-159*up,32-8*up);
  }else if(id==='sitFloor'){
    const settle=ramp((frame-22)/20);
    directPalm(left,20-153*settle,15+48*settle);
    directPalm(right,29-162*settle,16+52*settle);
  }else if(id==='palms'){
    const reach=ramp((frame-38)/8);
    left.fingers=[.06+.55*reach,.99-.28*reach,.06];
    right.fingers=[.14,.98,.06];
    left.palm=right.palm=[0,0,1];
  }else if(id==='idle'){
    left.fingers=[.32,-.95,.06];right.fingers=[.29,-.95,.10];
    left.palm=right.palm=[-.94,-.15,.25];
  }else if(id==='fold'){
    left.fingers=[-.48,.40,-.78];right.fingers=[.08,.70,-.70];
    left.palm=right.palm=[0,0,-1];
  }
  if(mirror) for(const p of [left,right]){p.x=-p.x;p.elbowX=-p.elbowX;}
  const rad=(mirror?-1:1)*Math.PI/180;
  return {weight,left:mirror?right:left,right:mirror?left:right,lean:v[8]*rad,shoulders:v[9]*rad,roll:v[10]*rad,
    torsoYaw:v[15]*rad,headYaw:v[16]*rad};
}
export function guideHands(hands,reference){
  if(!reference)return;
  for(const side of ['left','right']){
    const path=hands[side]??{anchor:'chest',position:[.14,-.16,.06],fingers:[.65,-.75,.08],palm:[0,0,1],shape:'soft',fingerWeight:0,weight:0};
    path.weight+=(1-path.weight)*reference.weight;
    path.projection=reference[side];
    path.projectionWeight=reference.weight/path.weight;
    if(path.projection.fingers){
      const w=path.projectionWeight;
      path.fingers=path.fingers.map((v,i)=>v+(path.projection.fingers[i]-v)*w);
      path.palm=path.palm.map((v,i)=>v+(path.projection.palm[i]-v)*w);
    }
    hands[side]=path;
  }
}

export class ReferenceFrame {
  constructor(root,bone,armSign){
    this.root=root;this.bone=bone;this.sign=-armSign;
    this.left=bone('leftUpperArm');this.right=bone('rightUpperArm');this.hips=bone('hips');
    this.center=new Vector3();this.diff=new Vector3();this.hip=new Vector3();
    this.a=new Vector3();this.b=new Vector3();this.axis=new Vector3();this.q=new Quaternion();
  }
  point(node,out){return this.root.worldToLocal(node.getWorldPosition(out));}
  measure(){
    this.point(this.left,this.a);this.point(this.right,this.b);this.point(this.hips,this.hip);
    this.center.addVectors(this.a,this.b).multiplyScalar(.5);
    this.diff.subVectors(this.a,this.b);
    this.span=Math.hypot(this.center.x-this.hip.x,this.center.y-this.hip.y);
  }
  rotate(node,angle,vertical=false){
    if(!node)return;
    this.axis.set(0,vertical?1:0,vertical?0:-this.sign).applyQuaternion(this.root.getWorldQuaternion(this.q))
      .applyQuaternion(node.getWorldQuaternion(this.q).invert());
    node.rotateOnAxis(this.axis,angle);
  }
  align(pose,nodes){
    this.measure();
    const yaw=v=>Math.atan2(-this.sign*v.z,this.sign*v.x);
    const turn=(pose.torsoYaw-yaw(this.diff))*pose.weight;
    this.rotate(nodes.spine,.32*turn,true);
    this.rotate(nodes.chest,.68*turn,true);
    this.measure();
    const lean=Math.atan2(this.sign*(this.center.x-this.hip.x),this.center.y-this.hip.y);
    this.rotate(nodes.spine,(pose.lean-lean)*1.35*pose.weight);
    this.measure();
    const slope=Math.atan2(-this.diff.y,this.sign*this.diff.x);
    this.rotate(nodes.chest,(pose.shoulders-slope)*pose.weight);
    const leftEye=this.bone('leftEye'), rightEye=this.bone('rightEye');
    if(leftEye && rightEye){
      this.point(leftEye,this.a);this.point(rightEye,this.b);this.diff.subVectors(this.a,this.b);
      const faceTurn=(pose.headYaw-yaw(this.diff))*pose.weight;
      this.rotate(nodes.neck,.45*faceTurn,true);
      this.rotate(nodes.head,.55*faceTurn,true);
      this.point(leftEye,this.a);this.point(rightEye,this.b);this.diff.subVectors(this.a,this.b);
      const roll=Math.atan2(-this.diff.y,this.sign*this.diff.x);
      this.rotate(nodes.neck,.35*(pose.roll-roll)*pose.weight);
      this.rotate(nodes.head,.65*(pose.roll-roll)*pose.weight);
    }
  }
  fitArmDepth(shoulder,elbow,wrist,upperLength,lowerLength,weight){
    // A screen-space segment fixes two coordinates. Recover the remaining
    // depth from this avatar's segment length, in the viewer-facing plane.
    this.axis.set(0,0,this.sign).applyQuaternion(this.root.getWorldQuaternion(this.q));
    const fit=(origin,end,length)=>{
      const difference=this.diff.subVectors(end,origin);
      const depth=difference.dot(this.axis);
      const planarSquared=Math.max(0,difference.lengthSq()-depth*depth);
      const fitted=Math.sqrt(Math.max(0,length*length-planarSquared));
      end.addScaledVector(this.axis,(fitted-depth)*weight);
    };
    fit(shoulder,elbow,upperLength);
    fit(elbow,wrist,lowerLength);
  }
  place(world,x,y,z,weight){
    this.root.worldToLocal(world);
    world.x+=(this.center.x+this.sign*x*this.span-world.x)*weight;
    world.y+=(this.center.y+y*this.span-world.y)*weight;
    world.z+=(this.center.z+this.sign*z*this.span-world.z)*weight;
    return this.root.localToWorld(world);
  }
}
