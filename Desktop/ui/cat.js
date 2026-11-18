let stop;
export function syncCat(enabled, reduced) {
  if (!enabled) {
    stop?.();
    stop = null;
    return;
  }
  if (stop) return;
  const pet = document.createElement('button');
  pet.id = 'deskCat';
  pet.title = 'Погладить кота';
  pet.setAttribute('aria-label', pet.title);
  pet.innerHTML =
    '<svg viewBox="0 0 76 60" aria-hidden="true"><g stroke="#483c44" stroke-linejoin="round" stroke-width="2.2"><path class="catTail" d="M46 36Q71 49 68 25Q67 20 64 24Q66 39 48 32" fill="#bc8669"/><ellipse cx="38" cy="37" rx="20" ry="12" fill="#d9a381"/><path class="paw" d="M24 42v9h7l2-8m9 0 3 8h7l-3-10" fill="#ca9376"/><path d="m11 26-1-15 11 7q4-1 7 0l11-9-1 17q5 15-14 15Q6 40 11 26Z" fill="#e6b38e"/><path d="m15 19-1-4 4 4m13 1 5-5-1 6" stroke="#b77883"/><path d="m17 28 2-1m9 1 2-1m-8 5 2 1 2-2" fill="none" stroke-linecap="round"/></g></svg>';
  const label = document.createElement('span');
  label.textContent = '♥';
  pet.append(label);
  document.body.append(pet);
  let x = 30,
    y = Math.max(108, innerHeight - 110),
    dest = x,
    direction = 1,
    last = 0,
    next = 0,
    raf = 0,
    held = 0;
  function tick(now) {
    const dt = Math.min(0.07, (now - last) / 1000);
    last = now;
    if (now > next) {
      dest = 22 + Math.random() * Math.max(50, innerWidth - 118);
      next = now + 6500 + Math.random() * 6500;
    }
    const dist = dest - x;
    if (!reduced && Math.abs(dist) > 2 && now > held) {
      direction = Math.sign(dist);
      x += direction * Math.min(Math.abs(dist), dt * 53);
    }
    y = Math.min(Math.max(50, innerHeight - 107), innerHeight - 63);
    pet.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    pet.style.setProperty('--dir', direction < 0 ? '1' : '-1');
    pet.classList.toggle('walking', !reduced && Math.abs(dist) > 2 && now > held);
    raf = requestAnimationFrame(tick);
  }
  pet.onclick = () => {
    held = performance.now() + 1600;
    pet.animate([{ scale: '1' }, { scale: '1.13' }, { scale: '1' }], { duration: 330 });
    label.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-21px)' },
      ],
      { duration: 850 },
    );
  };
  raf = requestAnimationFrame(tick);
  stop = () => {
    cancelAnimationFrame(raf);
    pet.remove();
  };
}
