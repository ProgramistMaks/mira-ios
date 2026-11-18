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
  state = await call('state');
  if (phaseRevision === revision) phase = state.avatarPhase;
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
  if (e.type === 'seat') {
    seated = e.value;
    a?.setDesktopPose(seated);
  }
});
update();
