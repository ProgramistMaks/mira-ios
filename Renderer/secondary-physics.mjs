import { Matrix4, Vector3 } from 'three';

const step = 1 / 120;
// VRM expresses force in the same solver units as stiffness. The ratio of
// 0.087 to the default support stiffness gives Vita about 7 mm of static sag.
const chestLoad = .087;

// Drive the existing VRM springs, retaining the artist's chains and colliders.
// Installed as the manager update hook so VRM.update still owns update order
// (humanoid -> gaze -> expressions -> constraints -> physics -> materials).
export class SecondaryPhysics {
  constructor(manager, chestSupport) {
    this.manager=manager;this.time=0;this.accumulator=0;this.enabled=true;this.reduced=false;this.wind=0;this.softness=.5;this.sleeping=false;
    this.originalUpdate=manager?.update.bind(manager);
    this.entries=[...(manager?.joints??[])].map(joint=>({joint,
      category:/hair/i.test(joint.bone.name)?'hair':/skirt/i.test(joint.bone.name)?'skirt':/sleeve/i.test(joint.bone.name)?'sleeves':/^J_Sec_[LR]_Bust[12]$/.test(joint.bone.name)?'chest':'other',
      stiffness:joint.settings.stiffness,drag:joint.settings.dragForce,
      gravity:joint.settings.gravityPower,direction:joint.settings.gravityDir.clone(),force:new Vector3(),
    }));
    this.chestSupport=chestSupport;
    this.chestEntries=this.entries.filter(e=>chestSupport && e.category==='chest' &&
      (e.joint.bone.parent===chestSupport || e.joint.bone.parent?.parent===chestSupport))
      .sort((a,b)=>Number(b.joint.bone.parent===chestSupport)-Number(a.joint.bone.parent===chestSupport));
    this.environmentEntries=this.entries.filter(e=>!this.chestEntries.includes(e));
    this.inverseParent=new Matrix4();
    this.localUp=new Vector3();
    this.supportPosition=new Vector3();
    this.configureChest();
    if(manager)manager.update=delta=>this.update(delta);
  }
  configure({physics=true,wind=0,softness=.5},reduced=false){
    this.enabled=physics;this.reduced=reduced;this.wind=wind;
    if(this.softness!==softness){
      this.softness=softness;
      this.configureChest();
      if(this.sleeping==='weighted')this.sleeping=false;
    }
  }
  configureChest(){
    for(const e of this.chestEntries){
      const s=e.joint.settings;
      s.stiffness=e.stiffness*(1.03-.58*this.softness);
      s.dragForce=Math.min(.45,Math.max(.10,e.drag+.15-.06*this.softness));
      s.gravityDir.set(0,-1,0);
      s.gravityPower=chestLoad;
    }
  }
  reset(){
    const support=this.chestSupport;
    support?.updateWorldMatrix(true,true);
    this.previousHeight=support?.matrixWorld.elements[13];
    this.manager?.reset();this.time=0;this.accumulator=0;
    if(!this.enabled || !this.chestEntries.length)return;
    // Start at the loaded equilibrium in the current pose on launch/resume.
    // Advance only the four chest joints, in parent-first order.
    for(let i=0;i<90;i++){
      for(const {joint} of this.chestEntries){
        joint.bone.updateWorldMatrix(false,false);
        joint.child?.updateWorldMatrix(false,false);
        joint.update(step);
      }
    }
  }
  get counts(){return Object.fromEntries(['hair','skirt','sleeves','chest','other'].map(category=>[category,this.entries.filter(e=>e.category===category).length]));}
  update(delta){
    if(!this.manager)return;
    if(!this.enabled||this.reduced){
      const rest=this.enabled && this.chestEntries.length?'weighted':'unloaded';
      if(this.sleeping!==rest)this.reset();
      this.sleeping=rest;
      return;
    }
    if(this.sleeping){this.reset();this.sleeping=false;}
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.05,delta)):0;
    const support=this.chestSupport;
    support?.updateWorldMatrix(true,false);
    const height=support?.matrixWorld.elements[13];
    const rise=support && this.previousHeight!==undefined ? height-this.previousHeight : 0;
    this.previousHeight=height;
    if(!dt)return;
    this.accumulator=Math.min(.05,this.accumulator+dt);
    const steps=Math.floor((this.accumulator+1e-10)/step);
    this.accumulator=Math.max(0,this.accumulator-steps*step);
    // The torso is sampled once per displayed frame. Feed its height to each
    // intervening physics step so a 30 Hz crouch carries the same load as at 120 Hz.
    const interpolate=steps>0 && (steps>1 || this.accumulator>1e-8) && Math.abs(rise)>1e-9;
    if(interpolate){
      this.supportPosition.copy(support.position);
      this.inverseParent.copy(support.parent.matrixWorld).invert();
      this.localUp.setFromMatrixColumn(this.inverseParent,1);
    }
    for(let i=0;i<steps;i++){
      this.time+=step;
      if(this.wind!==0 || this.lastWind!==this.wind || this.lastSoftness!==this.softness){
        const windX=this.wind*.16*(.7+.3*Math.sin(this.time*1.3));
        const windZ=this.wind*.05*Math.sin(this.time*.7);
        for(const e of this.environmentEntries){
          const s=e.joint.settings;
          // Chest chains follow the supported garment and settle soon after impact.
          const soft=e.category==='other'?.5:this.softness;
          s.stiffness=e.stiffness*(e.category==='chest'?1.32-soft*.4:1.4-soft*.8);
          s.dragForce=e.category==='chest'?Math.max(.10,Math.min(.45,e.drag+.17-.10*soft)):
            Math.min(.85,Math.max(.05,e.drag+(soft-.5)*.12));
          const exposure=e.category==='hair'?1:e.category==='skirt'?.3:e.category==='sleeves'?.2:0;
          e.force.copy(e.direction).multiplyScalar(e.gravity);
          e.force.x+=exposure*windX;e.force.z+=exposure*windZ;
          s.gravityPower=e.force.length();s.gravityDir.copy(s.gravityPower>1e-8?e.force.normalize():e.direction);
        }
        this.lastWind=this.wind;this.lastSoftness=this.softness;
      }
      if(interpolate){
        const remaining=(steps-1-i)*step+this.accumulator;
        support.position.copy(this.supportPosition).addScaledVector(this.localUp,-rise*remaining/dt);
      }
      this.originalUpdate(step);
    }
    if(interpolate){
      support.position.copy(this.supportPosition);
      support.updateWorldMatrix(false,true);
    }
  }
}
