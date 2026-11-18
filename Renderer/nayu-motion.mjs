import index from './motions/nayu.json' with { type:'json' };

const captions = {
  idle_breathe:'Дыхание', idle_look:'Оглядывается', idle_hands:'Разминает кисти',
  idle_feet:'Переступает ногами', idle_stretch:'Потягивается', idle_wait:'Ждёт',
  idle_armup:'Поднимает руку', idle_hip:'Переносит вес на бедро',
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
export const NAYU_PROGRAMS = {
  nayu_welcome:[{id:'nayu_portal_appear'},{id:'nayu_greet'}],
  nayu_farewell:[{id:'nayu_portal_disappear'}],
  nayu_dance:[{id:'nayu_dance_in',loop:false},{id:'nayu_dance_loop',hold:6.4},{id:'nayu_dance_out',loop:false}],
  nayu_floor_sit:[
    {id:'nayu_sit_crosslegged_start'},{id:'nayu_sit_crosslegged',hold:5},{id:'nayu_sit_crosslegged_end'},
  ],
};
const programLabels = {
  nayu_welcome:'Появление и приветствие', nayu_farewell:'Уход через портал',
  nayu_dance:'Танец с входом и выходом', nayu_floor_sit:'Посадка на пол и подъём',
};
const nameOf = (id) => {
  const base = id.replace(/_(start|end)$/, '');
  const label = captions[base] || id;
  return base === id ? label : label + (id.endsWith('_start') ? ' · вход' : ' · выход');
};
export const NAYU_CHOREOGRAPHY = [
  ...Object.entries(programLabels).map(([id,title])=>({id,title})),
  ...Object.keys(index.clips).map(name=>({id:'nayu_'+name,title:nameOf(name)})),
];
export const NAYU_IDLE = Object.keys(index.clips).filter(name=>name.startsWith('idle_')).map(name=>'nayu_'+name);

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
      desktopChair:[{id:'nayu_seat_in',loop:false},{id:'nayu_seat_loop'}],
      chairRise:[{id:'nayu_seat_out',loop:false}],
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
