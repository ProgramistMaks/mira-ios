import index from './motions/nayu.json' with { type:'json' };

const captions = {
  idle_breathe:'Дыхание', idle_look:'Оглядывается', idle_hands:'Разминает кисти',
  idle_feet:'Переступает ногами', idle_stretch:'Потягивается', idle_wait:'Ждёт',
  idle_armup:'Поднимает руку', idle_hip:'Переносит вес на бедро',
  idle_lean:'Наклоняется', idle_shy:'Смущается', drag_pose:'Поза при перетаскивании',
  greet:'Приветствие', portal_appear:'Появление', portal_disappear:'Исчезновение',
  sit_crosslegged:'Сидит по-турецки', sit_crosslegs:'Сидит нога на ногу',
  sit_swinglegs:'Качает ногами', sit_toes:'Сидит на носках', sit_legsup:'Сидит с поднятыми ногами',
  sit_handbetween:'Сидит с руками между коленями', sit_listless:'Сидит в расслабленной позе',
  sit_sorrow:'Грустная посадка', sit_lookingaround:'Оглядывается сидя',
  drag:'Приподнята', dance_in:'Вход в танец', dance_loop:'Танец',
  dance_out:'Выход из танца', sit_dance_loop:'Танец сидя',
  seat_in:'Садится на край', seat_loop:'Сидит на краю', seat_out:'Встаёт с края',
  walk:'Ходьба', jog:'Бег трусцой', sprint:'Спринт', air_loop:'В воздухе', air_land:'Приземление',
};
const motion = (clip, options={})=>({id:'nayu_'+clip,...options});
const oneShot = clip=>motion(clip,{loop:false});
const loop = (clip, cycles=1, rate=1)=>motion(clip,{loop:true,cycles,rate});
const sequence = (state, main)=>[
  ...(state.start ? [oneShot(state.start)] : []),
  main,
  ...(state.end ? [oneShot(state.end)] : []),
];
const states = index.states;
const previews = {};
const add = (id,title,actions)=>{previews[id]={title,actions};};

add('nayu_welcome','Появление и приветствие',sequence(states.greet,oneShot(states.greet.clip)));
add('nayu_farewell','Уход через портал',[oneShot(states.depart.clip)]);
add('nayu_seat','Посадка на край и подъём',sequence(states.seat,loop(states.seat.clip,2)));
add('nayu_air','Полёт и приземление',sequence(states.air,loop(states.air.clip)));
add('nayu_move','Ходьба, бег и спринт',states.move.variants[0].blend.points.map(point=>loop(point.clip,2)));
for (const pose of states.sit.variants) {
  if (!pose.start && !pose.end) continue;
  const id = pose.clip==='sit_crosslegged' ? 'nayu_floor_sit' : 'nayu_sequence_'+pose.clip;
  add(id,captions[pose.clip]+' · полная последовательность',sequence(pose,loop(pose.clip)));
}
for (const [name,title,bpm] of [
  ['dance_slow','Танец · 75 BPM',75],
  ['dance_mid','Танец · 150 BPM',150],
  ['dance_fast','Танец · 180 BPM',180],
  ['sit_dance_slow','Танец сидя · 60 BPM',60],
  ['sit_dance_mid','Танец сидя · 120 BPM',120],
  ['sit_dance_fast','Танец сидя · 165 BPM',165],
]) {
  const state=states[name];
  const {clip,blend:{points,maxRate}}=state.variants[0];
  const rate=Math.min(maxRate ?? Infinity,bpm/points[0].at);
  add(name==='dance_mid'?'nayu_dance':'nayu_program_'+name,title,
    sequence(state,loop(clip,name.startsWith('sit_')?1:8,rate)));
}
export const NAYU_PROGRAMS = Object.fromEntries(Object.entries(previews).map(([id,item])=>[id,item.actions]));
const nameOf = (id) => {
  const base = id.replace(/_(start|end)$/, '');
  const label = captions[base] || id;
  return base === id ? label : label + (id.endsWith('_start') ? ' · вход' : ' · выход');
};
export const NAYU_CHOREOGRAPHY = [
  ...Object.entries(previews).map(([id,{title}])=>({id,title,sequence:true})),
  ...Object.keys(index.clips).map(name=>({id:'nayu_'+name,title:nameOf(name),sequence:false})),
];
export const NAYU_IDLE = states.idle.variants.map(variant=>({id:'nayu_'+variant.clip,weight:variant.weight}));

export function musicMotion(bpm, seated) {
  const tempo = bpm < 92 ? 'slow' : bpm < 148 ? 'mid' : 'fast';
  const id = (seated ? 'sit_dance_' : 'dance_') + tempo;
  const state = states[id];
  const {clip,blend:{points,maxRate}} = state.variants[0];
  return {id, clip:'nayu_'+clip, rate:Math.min(maxRate ?? Infinity,bpm/points[0].at)};
}

const frameStride = 16 + 20*index.bones.length;
export class NayuMotion {
  constructor(buffer) {
    const clips = Object.values(index.clips);
    const last = clips.at(-1);
    if (buffer.byteLength !== last.offset + last.frames*frameStride)
      throw Error('Incomplete Nayu motion data');
    this.clips = Object.fromEntries(Object.entries(index.clips).map(([id,clip])=>['nayu_'+id,clip]));
    this.sequences = {
      ...Object.fromEntries(Object.keys(this.clips).map(id=>[id,[{id}]])),
      ...NAYU_PROGRAMS,
      desktopChair:[oneShot(states.seat.start),motion(states.seat.clip)],
      chairRise:[oneShot(states.seat.end)],
    };
    this.bones = index.bones;
    this.data = new DataView(buffer);
  }
  blend(clip, time) {
    let low = 0;
    let high = clip.frames-1;
    const offset = clip.offset;
    const timeAt = (i)=>this.data.getFloat32(offset+i*frameStride,true);
    while (high-low>1) {
      const mid = (low+high)>>1;
      if (timeAt(mid) <= time) low=mid;
      else high=mid;
    }
    const left = timeAt(low);
    const right = timeAt(high);
    const alpha = right>left ? Math.max(0,Math.min(1,(time-left)/(right-left))) : 0;
    return { from:offset+low*frameStride, to:offset+high*frameStride, alpha };
  }
  position(frame, vector) {
    const d=this.data;
    return vector.set(d.getFloat32(frame+4,true),d.getFloat32(frame+8,true),d.getFloat32(frame+12,true));
  }
  translation(frame,bone,vector) {
    const p=frame+24+bone*20;
    const d=this.data;
    return vector.set(d.getFloat32(p,true),d.getFloat32(p+4,true),d.getFloat32(p+8,true));
  }
  rotation(frame, bone, quaternion) {
    const p=frame+16+bone*20;
    const d=this.data;
    return quaternion.set(d.getInt16(p,true),d.getInt16(p+2,true),d.getInt16(p+4,true),d.getInt16(p+6,true)).normalize();
  }
}
