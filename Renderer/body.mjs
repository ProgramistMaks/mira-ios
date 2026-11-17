import { Euler, Quaternion } from 'three';
import { REST } from './acting.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const channels = [];
function channel(id, title, group, min, max, initial = 0) { channels.push({ id, title, group, min, max, initial }); }
for (const [side, title] of [['left', 'Левая'], ['right', 'Правая']]) {
  const group = `${title} рука`;
  for (const [key, label, min, max, initial] of [
    ['ShoulderLift','Плечо: подъём',-.15,.28,0], ['ShoulderForward','Плечо: вперёд',-.2,.3,0],
    ['Lift','Рука: подъём',0,1.7,0], ['Forward','Рука: вперёд',-.3,1.05,0], ['Roll','Рука: вращение',-.55,.55,0],
    ['Elbow','Локоть',.05,1.8,.1], ['Palm','Поворот предплечья',-1.2,1.2,0],
    ['Flex','Запястье: сгибание',-.45,.45,0], ['Wrist','Запястье: отклонение',-.4,.4,0],
  ]) channel(side+key,label,group,min,max,initial);
  const fingerNames = ['Большой','Указательный','Средний','Безымянный','Мизинец'];
  ['Thumb','Index','Middle','Ring','Little'].forEach((finger,f) => {
    for (let j=0;j<3;j++) channel(`${side}${finger}${j}`,`${fingerNames[f]} · сустав ${j+1}`,`${title} кисть`,0,f===0?.85:1.35,[.128,.144,.088][j]*(f===0?.45:1));
  });
  channel(side+'Spread','Разведение пальцев',`${title} кисть`,-.1,.25);
  channel(side+'ThumbOpposition','Противопоставление большого пальца',`${title} кисть`,-.15,.6);
  for (const [key,label,min,max] of [
    ['Knee','Сгибание колена',0,1.4], ['FootLift','Подъём стопы',0,.1],
    ['FootForward','Шаг вперёд / назад',-.07,.09], ['FootSide','Отведение ноги',-.04,.07],
    ['FootPitch','Стопа: носок вверх / вниз',-.4,.4], ['FootRoll','Стопа: наклон',-.2,.2], ['Toes','Пальцы стопы',-.25,.4],
  ]) channel(side+key,label,`${title} нога`,min,max);
}
for (const [id,title,min,max] of [
  ['hipsSide','Таз: перенос веса',-.025,.025], ['hipsDrop','Приседание',0,.06],
  ['hipsForward','Таз: вперёд / назад',-.02,.02], ['hipsPitch','Таз: наклон',-.12,.12],
  ['hipsYaw','Таз: поворот',-.06,.06], ['hipsRoll','Таз: вбок',-.04,.04],
  ['spineX','Поясница: наклон',-.12,.12], ['spineY','Поясница: поворот',-.18,.18], ['spineZ','Поясница: вбок',-.12,.12],
  ['chestX','Грудь: наклон',-.15,.15], ['chestY','Грудь: поворот',-.25,.25], ['chestZ','Грудь: вбок',-.12,.12],
  ['neckX','Шея: наклон',-.18,.18], ['neckY','Шея: поворот',-.22,.22], ['neckZ','Шея: вбок',-.15,.15],
  ['headX','Голова: наклон',-.3,.3], ['headY','Голова: поворот',-.45,.45], ['headZ','Голова: вбок',-.25,.25],
]) channel(id,title,'Корпус и голова',min,max);
channel('eyeYaw','Глаза: влево / вправо','Лицо',-25,25);
channel('eyePitch','Глаза: вверх / вниз','Лицо',-15,15);
for (const [id,title] of [['mouthAA','Рот: А'],['mouthIH','Рот: И'],['mouthOU','Рот: У'],['mouthEE','Рот: Э'],['mouthOH','Рот: О'],['blinkLeft','Левое веко'],['blinkRight','Правое веко']]) channel(id,title,'Лицо',0,1);
export const BODY_CHANNELS = Object.freeze(channels.map(Object.freeze));
export const BODY_MODES = Object.freeze([
  {id:'natural',title:'Живое поведение'}, {id:'hands',title:'Пальцы и запястья'},
  {id:'mobility',title:'Плечи, шея и корпус'}, {id:'legs',title:'Колени и стопы'},
  {id:'face',title:'Глаза и рот'}, {id:'manual',title:'Отдельные суставы'},
]);
export const BODY_CATALOG = {version:1,channels:BODY_CHANNELS,modes:BODY_MODES};
const neutral = Object.fromEntries(BODY_CHANNELS.map(c=>[c.id,c.initial]));

export class BodyController {
  constructor() { this.mode='natural'; this.controls={}; this.physics=true; this.wind=0; this.softness=.5; this.detail='standard'; this.time=0; this.current={...REST,...neutral}; }
  configure(settings={}) {
    if (!settings || typeof settings!=='object') return;
    if (BODY_MODES.some(m=>m.id===settings.mode) && this.mode!==settings.mode) { this.mode=settings.mode; this.time=0; }
    if (settings.controls && typeof settings.controls==='object') {
      this.controls={};
      for(const c of BODY_CHANNELS) if(Number.isFinite(settings.controls[c.id])) this.controls[c.id]=clamp(settings.controls[c.id],c.min,c.max);
    }
    if(typeof settings.physics==='boolean')this.physics=settings.physics;
    if(Number.isFinite(settings.wind))this.wind=clamp(settings.wind,0,1);
    if(Number.isFinite(settings.softness))this.softness=clamp(settings.softness,0,1);
    if(['standard','high'].includes(settings.detail))this.detail=settings.detail;
  }
  update(base,delta,reduced=false) {
    const dt=Number.isFinite(delta)?clamp(delta,0,.05):0; this.time+=reduced?0:dt;
    const t=this.time, wave=(speed,offset=0)=>.5-.5*Math.cos(t*speed+offset);
    const pose={...REST,...neutral,...base};
    for(const [s,index] of [['left',0],['right',1]]) {
      const curl=Number.isFinite(base[s+'Curl'])?base[s+'Curl']:.16;
      ['Thumb','Index','Middle','Ring','Little'].forEach((f,i)=>{
        for(let j=0;j<3;j++) pose[`${s}${f}${j}`]=clamp(curl*[.8,.9,.55][j]*(f==='Thumb'?.45:1+i*.025)+(reduced?0:.009*Math.sin(t*1.3-i*.6-j*.18+index)),0,f==='Thumb'?.85:1.35);
      });
      pose[s+'ShoulderLift']=reduced?0:.014*Math.sin(t*.8+index*.5)+Math.max(0,pose[s+'Lift'])*.055;
      pose[s+'ShoulderForward']=reduced?0:pose[s+'Forward']*.08;
      pose[s+'Spread']=reduced?0:.018+.012*Math.sin(t*.7+index);
      pose[s+'ThumbOpposition']=reduced?0:.08+curl*.12;
    }
    if(!reduced){pose.hipsPitch=.008*Math.sin(t*.65);pose.neckY=(pose.headY??0)*.25;pose.neckZ=(pose.headZ??0)*.2;pose.spineY=(pose.chestY??0)*.18;}
    if(this.mode!=='natural') {
      Object.assign(pose,REST,neutral);
      if(this.mode==='hands') for(const [s,index]of [['left',0],['right',1]]) {
        pose[s+'Lift']=.48;pose[s+'Forward']=.5;pose[s+'Elbow']=1.05;
        pose[s+'Palm']=.7*Math.sin(t*.7+index);pose[s+'Flex']=.23*Math.sin(t*.8+index);
        pose[s+'Wrist']=.18*Math.sin(t*.65+index);pose[s+'Spread']=.1*wave(.7,index);
        pose[s+'ThumbOpposition']=.3*wave(.8,index);
        ['Thumb','Index','Middle','Ring','Little'].forEach((f,i)=>{for(let j=0;j<3;j++)pose[`${s}${f}${j}`]=(f==='Thumb'?.5:1)*wave(1.4,-i*.65-j*.22-index*.6);});
      }
      if(this.mode==='mobility') {
        pose.leftShoulderLift=.16*wave(.9);pose.rightShoulderForward=.18*wave(.8);
        pose.leftLift=.45*wave(.7);pose.rightElbow=.1+.7*wave(.8);pose.rightPalm=.6*Math.sin(t*.7);
        pose.neckY=.12*Math.sin(t*.65);pose.neckZ=.07*Math.sin(t*.45);pose.headX=.12*Math.sin(t*.7);
        pose.headY=.22*Math.sin(t*.65);pose.chestY=.12*Math.sin(t*.55);pose.spineY=.06*Math.sin(t*.55);
        pose.hipsPitch=.07*Math.sin(t*.7);pose.hipsDrop=.02*wave(.8);
      }
      if(this.mode==='legs') {
        // Alternate a raised leg; never ask both feet to leave the ground.
        const cycle=t%12,s=cycle<6?'left':'right',u=(cycle%6)/6;
        const lift=Math.sin(Math.PI*u)**2;
        pose[s+'Knee']=.95*lift;pose[s+'FootForward']=.025*lift;
        pose[s+'FootPitch']=.22*Math.sin(2*Math.PI*u)*lift;pose[s+'Toes']=.2*lift;
        pose.hipsSide=(s==='left'?-.008:.008)*lift;
      }
      if(this.mode==='face'){pose.eyeYaw=20*Math.sin(t*.65);pose.eyePitch=10*Math.sin(t*.9);pose.mouthAA=.45*wave(1.5);pose.mouthOU=.25*wave(1.5,Math.PI);}
      if(this.mode==='manual') Object.assign(pose,this.controls);
    }
    // Accessibility overrides both automatic movement and deliberately animated test loops.
    const target=reduced?{...REST,...neutral}:pose;
    const alpha=reduced?1:1-Math.exp(-dt*12);
    for(const c of BODY_CHANNELS){const value=Number.isFinite(target[c.id])?clamp(target[c.id],c.min,c.max):c.initial;this.current[c.id]=reduced?value:this.current[c.id]+(value-this.current[c.id])*alpha;pose[c.id]=this.current[c.id];}
    return pose;
  }
}

export class ArticulationRig {
  constructor(bone,armSign=1) {
    this.bone=bone;this.sign=armSign;this.entries=[];this.q=new Quaternion();this.euler=new Euler();
    const add=(name,kind,side,index,joint)=>{const node=bone(name);if(node)this.entries.push({node,kind,side,index,joint,rest:node.quaternion.clone()});};
    for(const side of ['left','right']){
      add(side+'Shoulder','shoulder',side);add(side+'Toes','toes',side);
      ['Thumb','Index','Middle','Ring','Little'].forEach((finger,index)=>{
        const joints=finger==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'];
        joints.forEach((joint,j)=>add(side+finger+joint,'finger',side,index,`${side}${finger}${j}`));
      });
    }
  }
  apply(pose){
    for(const {node,kind,side,index,joint,rest}of this.entries){
      const sign=(side==='left'?-1:1)*this.sign;let x=0,y=0,z=0;
      if(kind==='shoulder'){z=sign*(pose[side+'ShoulderLift']??0);y=-sign*(pose[side+'ShoulderForward']??0);}
      if(kind==='toes')x=this.sign*(pose[side+'Toes']??0);
      if(kind==='finger'){
        z=sign*(pose[joint]??0);
        if(joint.endsWith('0'))y=sign*((index-2)*(pose[side+'Spread']??0)*.45);
        if(index===0){ // The thumb's first joint also opposes across the palm.
          x=(pose[joint]??0)*.32;
          if(joint.endsWith('0'))y=sign*(pose[side+'ThumbOpposition']??0);
        }
      }
      node.quaternion.copy(rest).multiply(this.q.setFromEuler(this.euler.set(x,y,z,'XYZ')));
    }
  }
}
