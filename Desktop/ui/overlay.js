import { $, call, avatar } from './shared.js';
let state,
  last,
  seq = 0,
  phase = 'idle',
  seated = false,
  motion = 'auto',
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
}
async function update() {
  state = await call('state');
  seated = state.seated;
  if ((last || 'vita') !== state.settings.avatar)
    $('#avatar').src = '/renderer/index.html?avatar=' + encodeURIComponent(state.settings.avatar);
  last = state.settings.avatar;
  ready();
}
$('#avatar').onload = ready;
$('#open').onclick = () => call('show');
$('#more').onclick = () => call('overlayMenu');
window.desk.on((e) => {
  const a = avatar();
  if (e.type === 'refresh') update();
  if (e.type === 'dance') a?.dance();
  if (e.type === 'motion') {
    motion = e.id;
    if (e.id === 'dance') a?.dance();
    else a?.configureChoreography(e.id);
  }
  if (e.type === 'phase') {
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
