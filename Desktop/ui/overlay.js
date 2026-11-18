import { setReduced } from './motion.js';
import { $, call, avatar } from './shared.js';
let state,
  last,
  seq = 0,
  phase = 'idle',
  phaseRevision = 0,
  seated = false,
  motion = 'auto',
  replayPending = false,
  dancePending = false,
  timer;
const effects = {bpm:0,weather:null,departing:0};
const revisions = {bpm:0,weather:0,departing:0};
let dragFrame, dragMove, handleStart;
function applyEffects(a) {
  a?.setMusicTempo(effects.bpm);
  a?.setWeather(effects.weather);
  const id = effects.departing;
  if (a) {
    a.onDepartureComplete = () => call('overlayDeparted',{id}).catch(()=>{});
    a.setDeparting(id>0);
  }
  document.body.toggleAttribute('data-departing',id>0);
}
function sendMove() {
  if (dragFrame) cancelAnimationFrame(dragFrame);
  dragFrame = undefined;
  if (dragMove) call('overlayDrag',dragMove).catch(()=>{});
  dragMove = undefined;
}
function drag(event) {
  if (event.type === 'move') {
    dragMove = event;
    if (!dragFrame) dragFrame = requestAnimationFrame(sendMove);
    return;
  }
  if (event.type === 'end') sendMove();
  avatar()?.setDragging(event.type === 'start');
  call('overlayDrag',event).catch(()=>{});
}
function ready() {
  clearTimeout(timer);
  const a = avatar();
  if (!a?.ready) {
    timer = setTimeout(ready, 120);
    return;
  }
  if (!state) return;
  a.setFrameRate(state.settings.fps);
  a.setState(phase, state.settings.reduced);
  a.setDesktopPose(seated);
  a.onWindowDrag = drag;
  applyEffects(a);
  a.configureChoreography(motion);
  if (replayPending) {
    replayPending = false;
    if (motion === 'dance') a.dance();
    else if (motion !== 'auto') a.replayGesture();
  }
  if (dancePending) {
    dancePending = false;
    a.dance();
  }
}
async function update() {
  const revision = phaseRevision;
  const before = {...revisions};
  state = await call('state');
  if (phaseRevision === revision) phase = state.avatarPhase;
  for (const [key,field] of Object.entries({bpm:'avatarTempo',weather:'avatarWeather',departing:'avatarDeparting'}))
    if (revisions[key] === before[key]) effects[key] = state[field];
  setReduced(state.settings.reduced);
  $('#open').textContent = state.settings.name;
  $('#avatar').title = state.settings.name;
  document.title = state.settings.name;
  seated = state.seated;
  const appearance = state.settings.avatar + '/' + (state.settings.outfit || 'original');
  if ((last || 'vita/original') !== appearance)
    $('#avatar').src = '/renderer/index.html?avatar=' + encodeURIComponent(appearance);
  last = appearance;
  ready();
}
$('#avatar').onload = ready;
$('#open').onclick = () => call('show');
$('#more').onclick = () => call('overlayMenu');
$('#hide').onclick = () => call('overlay',{open:false});
const dragHandle = $('#dragHandle');
dragHandle.onpointerdown = event => {
  if (event.button !== 0 || !event.isPrimary || effects.departing) return;
  handleStart = {id:event.pointerId,x:event.screenX,y:event.screenY};
  dragHandle.setPointerCapture(event.pointerId);
  drag({type:'start'});
};
dragHandle.onpointermove = event => {
  if (handleStart?.id === event.pointerId)
    drag({type:'move',x:event.screenX-handleStart.x,y:event.screenY-handleStart.y});
};
dragHandle.onpointerup = dragHandle.onlostpointercapture = dragHandle.onpointercancel = () => {
  if (!handleStart) return;
  handleStart = undefined;
  drag({type:'end'});
};
dragHandle.onkeydown = event => {
  const direction = {ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[event.key];
  if (!direction) return;
  event.preventDefault();
  (async () => {
    await call('overlayDrag',{type:'start'});
    await call('overlayDrag',{type:'move',x:direction[0],y:direction[1]});
    await call('overlayDrag',{type:'end'});
  })().catch(()=>{});
};
window.desk.on((e) => {
  const a = avatar();
  if (e.type === 'refresh') update();
  if (e.type === 'dance' || (e.type === 'motion' && e.temporary)) {
    dancePending = true;
    ready();
  } else if (e.type === 'motion') {
    motion = e.id;
    replayPending = true;
    ready();
  }
  if (e.type === 'phase') {
    phaseRevision++;
    phase = e.value;
    a?.setState(phase, !!state?.settings.reduced);
  }
  if (e.type === 'level') a?.setSpeech(e.value, performance.now(), ++seq);
  if (e.type === 'look') a?.lookAtPointer(e.x, e.y);
  const effect = {avatarMusic:['bpm',e.bpm],worldWeather:['weather',e.code],departure:['departing',e.value]}[e.type];
  if (effect) {
    const [key,value] = effect;
    effects[key] = value;
    revisions[key]++;
    applyEffects(a);
  }
  if (e.type === 'previewWeather' && state?.settings.characterWeather) a?.previewWeather(e.code);
  if (e.type === 'seat') {
    seated = e.value;
    a?.setDesktopPose(seated);
  }
});
update();
