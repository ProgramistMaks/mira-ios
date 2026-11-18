import { Vector3 } from 'three';

// Drive the existing VRM springs, retaining the artist's chains and colliders.
// Installed as the manager update hook so VRM.update still owns update order
// (humanoid -> gaze -> expressions -> constraints -> physics -> materials).
export class SecondaryPhysics {
  constructor(manager) {
    this.manager=manager;this.time=0;this.accumulator=0;this.enabled=true;this.reduced=false;this.wind=0;this.softness=.5;this.sleeping=false;
    this.originalUpdate=manager?.update.bind(manager);
    this.entries=[...(manager?.joints??[])].map(joint=>({joint,
      category:/hair/i.test(joint.bone.name)?'hair':/skirt/i.test(joint.bone.name)?'skirt':/sleeve/i.test(joint.bone.name)?'sleeves':/^J_Sec_[LR]_Bust[12]$/.test(joint.bone.name)?'chest':'other',
      stiffness:joint.settings.stiffness,drag:joint.settings.dragForce,
      gravity:joint.settings.gravityPower,direction:joint.settings.gravityDir.clone(),force:new Vector3(),
    }));
    if(manager)manager.update=delta=>this.update(delta);
  }
  configure({physics=true,wind=0,softness=.5},reduced=false){
    this.enabled=physics;this.reduced=reduced;this.wind=wind;this.softness=softness;
  }
  reset(){this.manager?.reset();this.time=0;this.accumulator=0;}
  get counts(){return Object.fromEntries(['hair','skirt','sleeves','chest','other'].map(category=>[category,this.entries.filter(e=>e.category===category).length]));}
  update(delta){
    if(!this.manager)return;
    if(!this.enabled||this.reduced){if(!this.sleeping)this.reset();this.sleeping=true;return;}
    if(this.sleeping){this.reset();this.sleeping=false;}
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.05,delta)):0;
    if(!dt)return;
    this.accumulator=Math.min(.05,this.accumulator+dt);
    const step=1/120,steps=Math.floor((this.accumulator+1e-10)/step);
    this.accumulator-=steps*step;
    for(let i=0;i<steps;i++){
      this.time+=step;
      if(this.wind!==0 || this.lastWind!==this.wind || this.lastSoftness!==this.softness){
        const windX=this.wind*.16*(.7+.3*Math.sin(this.time*1.3));
        const windZ=this.wind*.05*Math.sin(this.time*.7);
        for(const e of this.entries){
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
      this.originalUpdate(step);
    }
  }
}
