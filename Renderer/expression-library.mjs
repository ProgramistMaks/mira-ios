import { REST } from './acting.mjs';

// Original small, grounded gestures: no locomotion, imported clips or random joint noise.
// Track values are offsets from the existing conversational pose, in radians.
const gesture = (id, title, phases, peak, echo = {}, duration = 7) => ({
  id, title, phases, duration,
  frames: [[0, {}], [.22, peak], [.43, echo], [.64, peak], [.84, {}], [1, {}]],
});
const all = ['idle', 'listening', 'thinking', 'speaking'];
export const GESTURES = [
  gesture('soft-nod', 'Мягкий кивок', all, { headX: .065, neckX: .012 }, { headX: -.018 }),
  gesture('double-nod', 'Двойной кивок', ['listening','speaking'], { headX: .10, chestX: .018 }, { headX: -.03 }, 5.8),
  gesture('tilt-left', 'Наклон головы влево', all, { headZ: .09, headY: -.025 }, { headZ: .055 }),
  gesture('tilt-right', 'Наклон головы вправо', all, { headZ: -.09, headY: .025 }, { headZ: -.055 }),
  gesture('look-aside', 'Взгляд в сторону', ['idle','thinking'], { headY: .13, neckX: -.018 }, { headY: .07 }),
  gesture('look-back', 'Взгляд через плечо', ['idle','thinking'], { headY: -.13, chestY: -.035 }, { headY: -.06 }),
  gesture('open-left', 'Открытая левая ладонь', ['idle','speaking'], { leftLift: .46, leftElbow: .70, leftPalm: -.48, leftCurl: -.12 }, { leftLift: .30, leftElbow: .50 }),
  gesture('open-right', 'Открытая правая ладонь', ['idle','speaking'], { rightLift: .46, rightElbow: .70, rightPalm: .48, rightCurl: -.12 }, { rightLift: .30, rightElbow: .50 }),
  gesture('both-palms', 'Обе ладони открыты', ['idle','speaking'], { leftLift: .27, rightLift: .27, leftForward: .35, rightForward: .35, leftElbow: .65, rightElbow: .65, leftPalm: -.35, rightPalm: .35 }, { leftLift: .18, rightLift: .18 }),
  gesture('explain-left', 'Объяснение левой рукой', ['speaking'], { leftLift: .58, leftElbow: .80, leftWrist: .12, chestY: .035 }, { leftLift: .35, leftElbow: .45, leftWrist: -.08 }),
  gesture('explain-right', 'Объяснение правой рукой', ['speaking'], { rightLift: .58, rightElbow: .80, rightWrist: -.12, chestY: -.035 }, { rightLift: .35, rightElbow: .45, rightWrist: .08 }),
  gesture('small-shrug', 'Лёгкое пожатие плечами', ['idle','speaking'], { leftLift: .21, rightLift: .21, leftElbow: .45, rightElbow: .45, headZ: .04 }, { headZ: -.035 }),
  gesture('hand-to-heart', 'Рука у груди', ['idle','listening','speaking'], { leftLift: .25, leftForward: .35, leftElbow: 1.35, leftCurl: -.04, chestX: .018 }, { leftElbow: 1.05, leftForward: .22 }),
  gesture('reassure', 'Поддерживающий жест', ['listening','speaking'], { rightLift: .27, rightElbow: .65, rightPalm: .28, headX: .05 }, { rightLift: .18, headX: .02 }),
  gesture('small-wave-left', 'Небольшой взмах слева', ['idle'], { leftLift: .88, leftElbow: 1.02, leftWrist: -.22, leftCurl: -.16 }, { leftLift: .86, leftElbow: 1.00, leftWrist: .20, leftCurl: -.16 }, 5.5),
  gesture('small-wave-right', 'Небольшой взмах справа', ['idle'], { rightLift: .88, rightElbow: 1.02, rightWrist: .22, rightCurl: -.16 }, { rightLift: .86, rightElbow: 1.00, rightWrist: -.20, rightCurl: -.16 }, 5.5),
  gesture('idea', 'Появилась идея', ['thinking','speaking'], { leftLift: .36, leftElbow: .92, leftCurl: .10, headX: -.04, chestX: -.015 }, { leftLift: .20, leftElbow: .64 }),
  gesture('consider', 'Обдумывание', ['idle','thinking'], { headX: -.05, headZ: .055, leftElbow: .18, leftPalm: -.15 }, { headZ: -.025 }),
  gesture('listen-close', 'Внимательно слушает', ['listening'], { chestX: .035, neckX: .025, headX: .035, rightElbow: .14 }, { headX: -.015 }),
  gesture('gentle-bow', 'Лёгкий поклон', ['idle','speaking'], { spineX: .035, chestX: .045, headX: .075, leftElbow: .12, rightElbow: .12 }, { headX: .025 }),
  gesture('self-reference', 'Жест к себе', ['speaking'], { rightLift: .26, rightForward: .32, rightElbow: 1.25, rightCurl: .06, headZ: -.035 }, { rightElbow: .85, rightForward: .18 }),
  gesture('present-left', 'Показывает слева', ['idle','speaking'], { leftLift: .55, leftForward: .50, leftElbow: .80, leftPalm: -.50, chestY: .05, headY: .05 }, { leftLift: .40, leftForward: .25, leftElbow: .65 }),
  gesture('present-right', 'Показывает справа', ['idle','speaking'], { rightLift: .55, rightForward: .50, rightElbow: .80, rightPalm: .50, chestY: -.05, headY: -.05 }, { rightLift: .40, rightForward: .25, rightElbow: .65 }),
  gesture('settle', 'Спокойная смена позы', all, { chestZ: .023, headZ: -.035, leftElbow: .22, rightWrist: .09 }, { chestZ: -.018, headZ: .02, rightElbow: .18 }, 9),
];
export const EMOTIONS = [
  { id:'neutral', title:'Нейтральная', smile:.08, angry:0, sad:0, relaxed:.06, surprise:0, headX:0, headZ:0 },
  { id:'warm', title:'Тёплая', smile:.32, angry:0, sad:0, relaxed:.08, surprise:0, headX:.008, headZ:.015 },
  { id:'joy', title:'Радостная', smile:.55, angry:0, sad:0, relaxed:.04, surprise:.06, headX:-.018, headZ:.025 },
  { id:'calm', title:'Спокойная', smile:.12, angry:0, sad:0, relaxed:.42, surprise:0, headX:.012, headZ:0 },
  { id:'curious', title:'Любопытная', smile:.14, angry:0, sad:0, relaxed:0, surprise:.24, headX:-.025, headZ:.055 },
  { id:'thoughtful', title:'Задумчивая', smile:.035, angry:.04, sad:.04, relaxed:.12, surprise:0, headX:-.015, headZ:-.035 },
  { id:'shy', title:'Застенчивая', smile:.22, angry:0, sad:.05, relaxed:.18, surprise:0, headX:.045, headZ:.04 },
  { id:'confident', title:'Уверенная', smile:.23, angry:.12, sad:0, relaxed:.02, surprise:0, headX:-.035, headZ:-.012 },
  { id:'empathetic', title:'Сочувствующая', smile:.08, angry:0, sad:.22, relaxed:.10, surprise:0, headX:.025, headZ:.045 },
  { id:'sad', title:'Грустная', smile:0, angry:0, sad:.56, relaxed:0, surprise:0, headX:.055, headZ:-.02 },
  { id:'serious', title:'Серьёзная', smile:0, angry:.38, sad:0, relaxed:.02, surprise:0, headX:-.018, headZ:0 },
  { id:'surprised', title:'Удивлённая', smile:.04, angry:0, sad:0, relaxed:0, surprise:.58, headX:-.045, headZ:.012 },
];
export const GAZES = [
  { id:'center',title:'На тебя',x:0,y:0 }, { id:'left',title:'Чуть левее',x:-.10,y:0 },
  { id:'right',title:'Чуть правее',x:.10,y:0 }, { id:'up',title:'Чуть выше',x:0,y:.065 },
  { id:'down',title:'Чуть ниже',x:0,y:-.065 }, { id:'upper-left',title:'Вверх и влево',x:-.075,y:.045 },
  { id:'upper-right',title:'Вверх и вправо',x:.075,y:.045 }, { id:'lower-side',title:'Вниз и в сторону',x:.065,y:-.045 },
];
export const STANCES = [
  { id:'balanced',title:'Ровная опора',hipsSide:0,hipsDrop:.002,hipsForward:0,hipsYaw:0,hipsRoll:0 },
  { id:'left',title:'Опора слева',hipsSide:-.008,hipsDrop:.004,hipsForward:0,hipsYaw:.012,hipsRoll:.009 },
  { id:'right',title:'Опора справа',hipsSide:.008,hipsDrop:.004,hipsForward:0,hipsYaw:-.012,hipsRoll:-.009 },
  { id:'closer',title:'Чуть ближе',hipsSide:0,hipsDrop:.004,hipsForward:.006,hipsYaw:0,hipsRoll:0 },
  { id:'relaxed-left',title:'Расслабленная слева',hipsSide:-.005,hipsDrop:.007,hipsForward:-.004,hipsYaw:-.016,hipsRoll:.005 },
  { id:'relaxed-right',title:'Расслабленная справа',hipsSide:.005,hipsDrop:.007,hipsForward:-.004,hipsYaw:.016,hipsRoll:-.005 },
];
export const VARIANT_COUNT = GESTURES.length * EMOTIONS.length * GAZES.length * STANCES.length;
export const CATALOG = { version:1, count:VARIANT_COUNT, gestures:GESTURES.map(({id,title})=>({id,title})),
  emotions:EMOTIONS.map(({id,title})=>({id,title})), gazes:GAZES.map(({id,title})=>({id,title})), stances:STANCES.map(({id,title})=>({id,title})) };
export const FACE_REST = { angry:0, sad:0, relaxed:0, surprise:0 };
export const POSE_KEYS = Object.keys({ ...REST, ...FACE_REST });
const FACE_KEYS = Object.keys(FACE_REST);
const EXPRESSION_KEYS = ['smile', ...FACE_KEYS];
const REST_KEYS = Object.keys(REST);
const smooth = t => { const x = Math.max(0, Math.min(1, t)); return x*x*(3-2*x); };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function encodeVariant(gesture, emotion, gaze, stance) {
  const inputs = [gesture, emotion, gaze, stance], limits = [GESTURES.length,EMOTIONS.length,GAZES.length,STANCES.length];
  if (!inputs.every((v,i)=>Number.isInteger(v)&&v>=0&&v<limits[i])) return -1;
  return ((gesture*EMOTIONS.length+emotion)*GAZES.length+gaze)*STANCES.length+stance;
}
export function decodeVariant(id) {
  if (!Number.isInteger(id)||id<0||id>=VARIANT_COUNT) return null;
  const stance=id%STANCES.length; id=Math.floor(id/STANCES.length);
  const gaze=id%GAZES.length;id=Math.floor(id/GAZES.length);
  const emotion=id%EMOTIONS.length;
  return { gesture:Math.floor(id/EMOTIONS.length),emotion,gaze,stance };
}
/** @returns {Record<string, number>} */
export function boundedPose(pose) {
  const out={ ...REST, ...FACE_REST };
  for(const key of POSE_KEYS) {
    let lo=-.20,hi=.20;
    if(key==='hipsSide'){lo=-.025;hi=.025;} else if(key==='hipsDrop'){lo=0;hi=.025;}
    else if(key==='hipsForward'){lo=-.02;hi=.02;} else if(key==='hipsYaw'){lo=-.06;hi=.06;}
    else if(key==='hipsRoll'){lo=-.04;hi=.04;}
    else if(key.endsWith('Elbow')){lo=0;hi=2.60;} else if(key.endsWith('Lift')){lo=0;hi=1.38;}
    else if(key.endsWith('Forward')){lo=-.1;hi=1.12;} else if(key.endsWith('Palm')){lo=-.8;hi=.8;}
    else if(key.endsWith('Wrist')){lo=-.40;hi=.40;} else if(key.endsWith('Curl')){lo=0;hi=.65;}
    else if(EXPRESSION_KEYS.includes(key)){lo=0;hi=.75;}
    out[key]=clamp(Number.isFinite(pose[key])?pose[key]:0,lo,hi);
  }
  const sum=out.smile+out.angry+out.sad+out.relaxed+out.surprise;
  if(sum>.85) for(const key of EXPRESSION_KEYS)out[key]*=.85/sum;
  return out;
}
/** @returns {Record<string, number>} */
export function sampleVariant(id, progress, base=REST, intensity=.7, gestureWeight=1) {
  const selection=decodeVariant(id);
  if(!selection)return boundedPose(base);
  const g=GESTURES[selection.gesture], e=EMOTIONS[selection.emotion], gaze=GAZES[selection.gaze], stance=STANCES[selection.stance];
  const amount=clamp(Number.isFinite(intensity)?intensity:.7,.35,1);
  const p=clamp(Number.isFinite(progress)?progress:0,0,1);
  let frame=1;while(frame<g.frames.length-1 && p>g.frames[frame][0])frame++;
  const [at,a]=g.frames[frame-1],[bt,b]=g.frames[frame], weight=smooth((p-at)/(bt-at));
  const result={ ...REST, ...FACE_REST, ...base };
  for(const key of REST_KEYS)result[key]+=((a[key]??0)+((b[key]??0)-(a[key]??0))*weight)*amount*clamp(gestureWeight,0,1);
  for(const key of ['hipsSide','hipsDrop','hipsForward','hipsYaw','hipsRoll'])result[key]+=stance[key]*amount;
  result.headX+=e.headX*amount;result.headZ+=e.headZ*amount;
  result.gazeX+=gaze.x*amount;result.gazeY+=gaze.y*amount;
  result.smile=(base.smile*.15+e.smile*.85)*amount;
  for(const key of FACE_KEYS)result[key]=e[key]*amount;
  return boundedPose(result);
}
export function mixPerformance(from,to,t) {
  if(t<=0)return {...from};
  if(t>=1)return {...to};
  const weight=smooth(t), result={...REST,...FACE_REST};
  for(const key of POSE_KEYS)result[key]=(from[key]??0)+((to[key]??0)-(from[key]??0))*weight;
  return result;
}
