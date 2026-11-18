export function open(p) {
  p.innerHTML =
    '<div id="shadowStage"><iframe id="stage" title="Танец Виты" src="/renderer/index.html"></iframe><canvas id="shadowCanvas" hidden></canvas></div><video hidden></video><p id="tools"><button id="dance">Танец Виты</button><label class="pick">Открыть видео<input id="videoFile" type="file" accept="video/*"></label><button id="original">Bad Apple!! · Niconico</button><button id="pause">Пауза</button><label>Порог <input type="range" min="10" max="245" value="126" id="threshold"></label></p>';
  const frame = p.querySelector('iframe'),
    canvas = p.querySelector('canvas'),
    video = p.querySelector('video'),
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  let url,
    raf = 0,
    paused = false;
  let player;
  function clearPlayer() {
    player?.remove();
    player = null;
    p.querySelector('#pause').disabled = false;
  }
  p.querySelector('#original').onclick = () => {
    clearPlayer();
    video.pause();
    cancelAnimationFrame(raf);
    frame.hidden = true;
    frame.contentWindow.companion?.setActive(false);
    canvas.hidden = true;
    player = document.createElement('iframe');
    player.title = 'Bad Apple!! · официальный плеер Niconico';
    player.id = 'originalPlayer';
    player.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    player.allow = 'autoplay; fullscreen';
    player.allowFullscreen = true;
    player.src = 'https://embed.nicovideo.jp/watch/sm8628149';
    p.querySelector('#shadowStage').append(player);
    p.querySelector('#pause').disabled = true;
  };
  function vita() {
    const c = frame.contentWindow?.companion;
    if (c?.ready) c.configureChoreography('dance');
    else if (frame.isConnected) setTimeout(vita, 150);
  }
  frame.onload = vita;
  function render() {
    if (!video.paused && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const im = ctx.getImageData(0, 0, canvas.width, canvas.height),
        a = im.data,
        t = +p.querySelector('#threshold').value;
      for (let i = 0; i < a.length; i += 4)
        a[i] = a[i + 1] = a[i + 2] = 0.213 * a[i] + 0.715 * a[i + 1] + 0.072 * a[i + 2] > t ? 250 : 12;
      ctx.putImageData(im, 0, 0);
    }
    raf = requestAnimationFrame(render);
  }
  p.querySelector('#videoFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    clearPlayer();
    cancelAnimationFrame(raf);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    video.src = url;
    try {
      await video.play();
      canvas.width = Math.min(video.videoWidth, 520);
      canvas.height = Math.max(1, Math.round((canvas.width * video.videoHeight) / video.videoWidth));
      frame.hidden = true;
      frame.contentWindow.companion?.setActive(false);
      canvas.hidden = false;
      paused = false;
      p.querySelector('#pause').textContent = 'Пауза';
      render();
    } catch {
      p.querySelector('#tools').insertAdjacentText('afterend', 'Этот видеофайл не удалось открыть.');
    }
  };
  p.querySelector('#dance').onclick = () => {
    clearPlayer();
    video.pause();
    cancelAnimationFrame(raf);
    frame.hidden = false;
    canvas.hidden = true;
    paused = false;
    frame.contentWindow.companion?.setActive(true);
    vita();
    p.querySelector('#pause').textContent = 'Пауза';
  };
  p.querySelector('#pause').onclick = () => {
    paused = !paused;
    if (canvas.hidden) frame.contentWindow.companion?.setActive(!paused);
    else if (paused) video.pause();
    else video.play().catch(() => {});
    p.querySelector('#pause').textContent = paused ? 'Продолжить' : 'Пауза';
  };
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    video.pause();
    if (url) URL.revokeObjectURL(url);
  });
}
