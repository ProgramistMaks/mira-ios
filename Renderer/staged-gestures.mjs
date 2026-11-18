// Distances are fractions of the avatar height. Lateral is positive on the
// performing hand's side. The palm normal and finger direction define a hand.
const hand = (anchor, position, fingers, palm, shape = 'open', elbow = .18) =>
  ({anchor, position, fingers, palm, shape, elbow});
const chest = hand('chest', [.048,.064,.092], [-.75,.65,0], [0,0,-1], 'soft');
const cheek = hand('head', [.087,-.043,.075], [-.25,1,0], [0,0,1]);
const hello = hand('neck', [.165,.056,.067], [0,1,0], [0,0,1]);
const temple = hand('head', [.145,.035,.055], [-.86,.50,0], [0,0,1], 'index', .25);
const offer = hand('chest', [.159,.012,.174], [.56,.28,.78], [0,1,0]);
const elbowFold = hand('chest', [-.040,.023,.102], [-.89,.32,-.15], [0,0,-1],'loose',.13);
const upperFold = hand('chest', [-.052,.051,.12], [-.82,.52,-.18], [0,0,-1],'loose',.14);
const point = hand('chest', [.265,.052,.125], [.82,.12,.5], [0,-1,0],'index');
const above = hand('head', [.061,.090,.049], [-.71,.70,0], [0,0,1],'loose',.17);
const low = hand('chest', [.145,-.18,.035], [.55,-.82,0], [0,0,1],'soft');
// Non-uniform timings retain a distinct preparation, arrival, hold and release.
const track = (goal, times, weights = [0,.18,1,1,.58,0]) => ({goal,times,weights});
const curve = (...pairs) => pairs;
// Shape-preserving cubic interpolation. The wrist keeps moving through an
// intermediate key in the same direction, and comes to rest at a hold or turn.
const tangents = new WeakMap();
function slopes(keys) {
  let result=tangents.get(keys);
  if (result) return result;
  result=new Float64Array(keys.length);
  for (let i=1;i<keys.length-1;i++) {
    const before=keys[i][0]-keys[i-1][0], after=keys[i+1][0]-keys[i][0];
    const incoming=(keys[i][1]-keys[i-1][1])/before, outgoing=(keys[i+1][1]-keys[i][1])/after;
    if (incoming*outgoing>0) {
      const w1=2*after+before, w2=after+2*before;
      result[i]=(w1+w2)/(w1/incoming+w2/outgoing);
    }
  }
  tangents.set(keys,result);
  return result;
}
export function at(keys,t) {
  if (!keys || t < keys[0][0]) return 0;
  for (let i=1;i<keys.length;i++) {
    const [end,b]=keys[i], [start,a]=keys[i-1];
    if (t<=end) {
      if (a===b) return a;
      const h=end-start, u=(t-start)/h, v=1-u, slope=slopes(keys);
      return a+(b-a)*u*u*(3-2*u)+h*u*v*(v*slope[i-1]-u*slope[i]);
    }
  }
  return keys.at(-1)[1];
}
export const SHOTS = {
  welcome: {title:'Приветствие', automaticOnly:true, duration:4.55,
    right:track(hand('chest',[0,0,.061],[-.26,.96,0],[0,0,1]),[0,.23,.52,3.70,4.12,4.54]),
    left:track(hand('chest',[0,0,.064],[-.35,.91,0],[0,0,1],'loose'),[0,.18,.49,.96,1.20,1.55]),
    lean:.075,turn:-.09,bow:.065},
  arrival: {title:'Приветствие двумя руками',duration:3.55,
    left:track(above,[0,.13,.49,.83,1.02,1.47]),right:track(above,[.035,.18,.54,.89,1.10,1.53]),
    shoulder:.15,lean:.028,turn:-.04,
    pitch:curve([0,0],[.22,.085],[.56,-.07],[1.04,.045],[1.50,0]),
    dip:curve([0,0],[.18,.58],[.50,0],[1.12,.38],[1.56,0])},
  sitFloor: {title:'Садится на пол', duration:4.8,
    left:track(hand('chest',[.035,-.145,.107],[-.49,-.58,.62],[0,-1,0],'soft'),
      [0,.20,.65,1.18,1.52,2.00],[0,.03,.33,.76,.95,1]),
    right:track(hand('chest',[.023,-.148,.126],[-.55,-.54,.63],[0,-1,0],'soft'),
      [0,.24,.72,1.26,1.62,2.09],[0,.04,.36,.79,.96,1]),
    floor:curve([0,0],[.18,.05],[.60,.49],[1.02,.87],[1.35,1]),
    pitch:curve([0,0],[.36,.12],[.79,.18],[1.52,.045],[1.88,.055])},
  wave: {title:'Приветственный взмах', duration:3.35, right:track(hello,[0,.22,.67,2.19,2.58,3.3]),
    left:track(low,[.1,.38,.8,2.1,2.6,3.25],[0,.12,.45,.45,.24,0]), lean:-.065,turn:.08,
    wrist:curve([0,0],[.6,0],[.9,.36],[1.18,-.3],[1.52,.27],[1.83,-.21],[2.12,.04],[2.32,0]),
    swing:curve([0,0],[.69,0],[.94,.026],[1.23,-.024],[1.54,.021],[1.82,-.016],[2.12,0])},
  heart: {title:'Рука у груди', duration:3.9, right:track(chest,[0,.19,.75,2.58,3.08,3.85]),
    left:track(low,[.18,.42,1,2.52,3.05,3.8],[0,.1,.43,.43,.22,0]), lean:.048,turn:-.09,bow:.09},
  cheek: {title:'Рука у лица', duration:4.0, right:track(cheek,[0,.27,1.04,2.85,3.36,3.98]),
    left:track(low,[.09,.31,.82,2.9,3.32,3.9],[0,.18,.62,.62,.31,0]),lean:.11,turn:-.11,bow:.05},
  fold: {title:'Складывает руки', duration:4.6, left:track(elbowFold,[0,.25,.75,3.6,4.15,4.56]),
    right:track(upperFold,[.13,.48,1.01,3.27,3.82,4.28]),lean:.07,turn:.12,bow:.06},
  palms: {title:'Раскрывает ладони',duration:3.6,left:track(offer,[0,.16,.8,2.14,2.66,3.44]),
    right:track(offer,[.13,.32,.96,2.3,2.82,3.55]),lean:-.025,turn:.035},
  options: {title:'Сравнивает два варианта',duration:4.8,left:track(offer,[0,.17,.75,1.52,1.94,2.45]),
    right:track(offer,[1.75,2.0,2.65,3.6,4.14,4.76]),lean:.063,turn:.105, alternate:true},
  point: {title:'Указывает в сторону',duration:3.5,left:track(point,[0,.23,.81,2.15,2.64,3.44]),
    lean:-.055,turn:.18},
  shrug: {title:'Пожимает плечами',duration:2.9,left:track(offer,[0,.16,.57,1.37,1.94,2.75],[0,.1,.7,.7,.25,0]),
    right:track(offer,[.06,.21,.65,1.5,2.04,2.82],[0,.14,.78,.78,.28,0]),shoulder:.23,lean:.065,bow:-.07},
  nod: {title:'Кивает',duration:2.2,pitch:curve([0,0],[.28,-.055],[.56,.21],[.91,.075],[1.24,-.025],[1.84,0])},
  no: {title:'Качает головой',duration:2.4,yaw:curve([0,0],[.40,.24],[.91,-.28],[1.38,.14],[1.79,-.055],[2.22,0])},
  temples: {title:'Указывает на виски',duration:3.7,right:track(temple,[0,.18,.76,2.57,3.02,3.59]),
    left:track(temple,[.09,.3,.89,2.47,2.97,3.67]),lean:-.075,turn:.06,bow:.075,
    // Both feet stay down as bent knees absorb the accent; the torso follows
    // the change of support while the pointing hands remain near the head.
    dip:curve([0,0],[.36,.13],[.72,.88],[1.06,.17],[1.46,.74],[1.86,.20],[2.22,.44],[2.79,0]),
    balance:curve([0,0],[.36,-.26],[.82,.86],[1.51,-.72],[2.25,.39],[2.91,0])},
  stretch: {title:'Потягивается',duration:4.25,left:track(above,[0,.28,1.08,2.5,3.17,4.19]),
    right:track(above,[.08,.36,1.21,2.63,3.26,4.23]),shoulder:.20,bow:-.105},
  skip: {title:'Игривый шаг',duration:2.75,left:track(low,[0,.2,.69,1.42,1.92,2.61],[0,.1,.75,.67,.3,0]),
    lean:.105,turn:.09,foot:curve([0,0],[.32,0],[.65,1],[1.1,.85],[1.55,0],[2.75,0])},
};
// The video opens with the hands already overhead. Ease into that pose from
// the current stance, then drop the elbows and bring only one hand to the cheek.
const welcomeX=curve([0,.07],[.55,.07],[.76,.102],[.94,.118],[1.17,.13],[1.53,.079],[1.79,.079],[3.70,.079],[4.26,.135]);
const welcomeY=curve([0,.260],[.55,.260],[.76,.230],[.94,.147],[1.16,-.021],[1.39,.042],[1.71,.153],[3.70,.153],[4.26,-.015]);
const leftWelcomeY=curve([0,.263],[.52,.263],[.71,.240],[.92,.155],[1.17,.008],[1.45,-.12]);
const raisedShoulders=curve([0,0],[.45,1],[.66,1],[.98,.32],[1.21,0]);
const relaxedWrist=curve([0,0],[.57,0],[.86,.75],[1.13,1],[1.51,0]);
export function welcomeHands(time,hands,pose) {
  for (const [side,path] of Object.entries(hands)) {
    if (!path) continue;
    path.position[0]+=at(welcomeX,time);
    path.position[1]+=at(side==='left'?leftWelcomeY:welcomeY,time);
    const curl=at(relaxedWrist,time);
    path.fingers=[path.fingers[0]+.56*curl,path.fingers[1]-1.42*curl,.8*curl];
    pose[side+'ShoulderLift']=at(raisedShoulders,time)*.24;
  }
}
// The first phrase gathers both forearms at the sternum, releases and then
// accents one side. Each wrist takes a separate height and arrival time.
const gatherHands = [
  {x:curve([0,.19],[.21,.16],[.58,.064],[.74,.064],[1.04,.106],[1.32,.19],[1.62,.095],[2,.12]),
   y:curve([0,-.08],[.24,-.045],[.58,.069],[.78,.069],[1.05,-.041],[1.32,.070],[1.62,.124],[2,-.04])},
  {x:curve([0,.18],[.28,.14],[.66,-.013],[.83,-.010],[1.1,.073],[1.39,-.085],[1.68,-.032],[2,.09]),
   y:curve([0,-.09],[.28,-.075],[.66,.032],[.83,.032],[1.10,-.058],[1.39,.045],[1.68,.086],[2,-.05])},
];
const danceLanes = [
  {left: track(hand('chest',[0,0,.101],[-.52,.72,.45],[0,0,-1],'curled'),[0,.12,.36,1.63,1.82,1.98]),
   right: track(hand('chest',[0,0,.128],[-.68,.59,.43],[0,0,-1],'curled'),[0,.16,.42,1.69,1.84,1.995])},
  {right: track(hello, [0,.13,.53,1.08,1.52,1.94]),
   left: track(offer, [.14,.35,.76,1.27,1.59,1.98],[0,.14,.8,.69,.28,0])},
  {right: track(temple, [0,.22,.65,1.28,1.61,1.96]),
   left: track(temple, [.08,.27,.77,1.17,1.54,1.92])},
];
export function danceHands(t) {
  const phrase = Math.floor(t / 2) % danceLanes.length;
  const local = t % 2;
  const lane = danceLanes[phrase];
  const mirror = Math.floor(t / 6) % 2 === 1;
  const left=sampleHand(lane.left,local), right=sampleHand(lane.right,local);
  if (phrase===0) {
    for (const [i,hand] of [left,right].entries()) {
      if (!hand) continue;
      hand.position[0]+=at(gatherHands[i].x,local);
      hand.position[1]+=at(gatherHands[i].y,local);
    }
  }
  return mirror?{left:right,right:left}:{left,right};
}
for (const shot of [...Object.values(SHOTS), ...danceLanes]) {
  for (const side of ['left','right']) {
    const lane=shot[side];
    if(lane)lane.envelope=lane.times.map((t,i)=>[t,lane.weights[i]]);
  }
}
export function sampleHand(lane,t,swing=0,wrist=0) {
  if (!lane) return undefined;
  const weight=at(lane.envelope,t);
  if (weight<=0) return undefined;
  const g=lane.goal;
  const fingerWeight=at(lane.envelope,t-.065);
  // Lead the hand around the ribcage while reaching. The outward path on
  // release has a different depth, and both arcs settle at the held pose.
  // Follow the phase clock: a supporting hand may settle at partial weight.
  // The arc has zero position and velocity where it joins the held pose.
  const arc=(start,end)=>t>start && t<end ? Math.sin(Math.PI*(t-start)/(end-start))**2 : 0;
  const approach=.022*arc(lane.times[0],lane.times[2]);
  const release=.035*arc(lane.times[3],lane.times[5]);
  const [x,y,z] = g.fingers;
  const fingers=wrist ? [x*Math.cos(wrist)+y*Math.sin(wrist),y*Math.cos(wrist)-x*Math.sin(wrist),z] : g.fingers;
  return {...g,weight,fingerWeight,fingers,position:[g.position[0]+swing+release+approach,g.position[1]-.3*approach,g.position[2]+release*.45+approach*.7]};
}
