(() => {
  'use strict';
  const canvas = document.querySelector('#world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (selector) => document.querySelector(selector);
  const qs = new URLSearchParams(location.search);
  const initialSeed = Number(qs.get('seed'));
  let seed = Number.isSafeInteger(initialSeed) && initialSeed > 0 ? initialSeed : Math.floor(Math.random() * 900000 + 100000);
  let paletteIndex = Math.max(0, Math.min(2, Number(qs.get('p')) || 0));
  const palettes = [
    { name: 'Blue hour', top: '#060b23', middle: '#25375b', horizon: '#b37781', water: '#111b3b', aurora: ['#73cfc6', '#8e9ae6', '#efb7aa'], glow: '#f8d4a9' },
    { name: 'Velvet dusk', top: '#160d31', middle: '#493758', horizon: '#dc8e8e', water: '#251936', aurora: ['#f7a7c4', '#b99ded', '#f5cf9a'], glow: '#ffe4b5' },
    { name: 'Emerald night', top: '#031b2b', middle: '#214d58', horizon: '#9fac9f', water: '#092c36', aurora: ['#9ae9b8', '#87d4d1', '#e4e4b2'], glow: '#f7e4b0' }
  ];
  const notes = [
    'Every sky begins with a single point of light.',
    'The night remembers where you chose to pause.',
    'A few small lights can make a place feel infinite.',
    'Some constellations are made without a name.',
    'There is no map until someone begins to wander.',
    'Perhaps this is what a memory looks like from afar.'
  ];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const rand = (n) => {
    let x = n >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const r = (i, salt = 0) => rand(seed + Math.imul(i + 1, 6287) + salt);
  const stars = Array.from({ length: 290 }, (_, i) => ({ x: r(i, 2), y: .025 + r(i, 3) * .57, size: .4 + r(i, 4) * 1.55, phase: r(i, 5) * TAU }));
  const dust = Array.from({ length: 66 }, (_, i) => ({ x: r(i, 920), y: r(i, 921), phase: r(i, 922) * TAU, speed: .2 + r(i, 923) * .8, size: .5 + r(i, 924) * 1.2 }));
  let marks = [];
  try {
    const fromUrl = qs.get('marks');
    const saved = fromUrl || localStorage.getItem(`afterglow:${seed}`);
    if (saved) marks = saved.split(';').slice(0, 40).map((part) => part.split(',').map(Number)).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= .61).map(([x, y]) => ({ x, y, born: -100 }));
  } catch { /* Storage can be unavailable in private browsing. */ }

  const state = { w: 0, h: 0, dpr: 1, time: 0, last: 0, started: false, paused: matchMedia('(prefers-reduced-motion: reduce)').matches, pointerAt: -100, targetX: .56, targetY: .48, lanternX: .56, lanternY: .48, trail: [], blooms: [], sound: false, audio: null, raf: 0 };
  if (state.paused) { $('#pauseButton').textContent = '▶'; $('#pauseButton').setAttribute('aria-label', 'Resume animation'); }
  $('#seedLabel').textContent = `WORLD ${String(seed).padStart(6, '0')}`;
  updateCount();
  replaceUrl(false);

  function replaceUrl(withMarks) {
    const url = new URL(location.href);
    url.searchParams.set('seed', seed);
    if (paletteIndex) url.searchParams.set('p', paletteIndex); else url.searchParams.delete('p');
    if (withMarks && marks.length) url.searchParams.set('marks', marks.map(m => `${m.x.toFixed(3)},${m.y.toFixed(3)}`).join(';'));
    else url.searchParams.delete('marks');
    history.replaceState(null, '', url);
    return url.href;
  }
  function resize() {
    state.dpr = Math.min(2, devicePixelRatio || 1);
    state.w = innerWidth; state.h = innerHeight;
    canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.paused) draw();
  }
  addEventListener('resize', resize, { passive: true }); resize();

  function glow(x, y, radius, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.globalAlpha = 1;
  }
  function drawSky(p, t, w, h, horizon) {
    const bg = ctx.createLinearGradient(0, 0, 0, horizon);
    bg.addColorStop(0, p.top); bg.addColorStop(.62, p.middle); bg.addColorStop(1, p.horizon);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    glow(w * .48, horizon * .68, w * .56, '#e58f9b', .13);
    glow(w * .14, horizon * .2, w * .48, '#83bada', .09);
    drawAurora(p, t, w, horizon);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i], x = star.x * w, y = star.y * h;
      if (y > horizon - 15) continue;
      const a = .32 + .47 * (.5 + .5 * Math.sin(t * (.6 + star.size * .3) + star.phase));
      if (star.size > 1.5 && i % 4 === 0) glow(x, y, star.size * 8, '#fff7d8', a * .18);
      ctx.fillStyle = `rgba(255,246,223,${a})`; ctx.beginPath(); ctx.arc(x, y, star.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
    drawMoon(p, t, w, h);
  }
  function drawAurora(p, t, w, horizon) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 3; band++) {
      const base = horizon * (.23 + band * .10);
      const color = p.aurora[band];
      for (let layer = 8; layer >= 0; layer--) {
        ctx.beginPath();
        for (let x = -40; x <= w + 40; x += 13) {
          const u = x / w;
          const wave = Math.sin(u * 5.2 + t * .13 + band * 1.7) * 27 + Math.sin(u * 10.5 - t * .09 + band) * 11;
          const y = base + wave + layer * (6 + band * 2) + Math.sin(u * 3 + band) * 17;
          if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.lineWidth = 3 + layer * 1.3;
        ctx.globalAlpha = (.045 + layer * .008) * (band === 0 ? 1 : .7);
        ctx.shadowColor = color; ctx.shadowBlur = 30 + layer * 4; ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawMoon(p, t, w, h) {
    const x = w * .76, y = h * .26, rad = Math.max(27, Math.min(w, h) * .048);
    glow(x, y, rad * 5, p.glow, .25);
    glow(x, y, rad * 2.4, p.glow, .21);
    ctx.save(); ctx.shadowColor = p.glow; ctx.shadowBlur = 25;
    const g = ctx.createRadialGradient(x - rad * .3, y - rad * .4, 1, x, y, rad);
    g.addColorStop(0, '#fffbed'); g.addColorStop(.76, '#ffe1bb'); g.addColorStop(1, '#e6b9a4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = '#9d93a8';
    for (let i = 0; i < 5; i++) { const dx = (r(i, 411) - .5) * rad * 1.15, dy = (r(i, 412) - .5) * rad * 1.2; ctx.beginPath(); ctx.arc(x + dx, y + dy, rad * (.055 + r(i, 413) * .09), 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawHorizon(p, t, w, h, horizon) {
    // Fine silhouettes create depth without competing with the sky.
    for (let layer = 0; layer < 3; layer++) {
      const base = horizon + layer * 18;
      ctx.beginPath(); ctx.moveTo(0, h);
      ctx.lineTo(0, base);
      for (let x = 0; x <= w + 25; x += 25) {
        const u = x / w;
        const y = base - Math.sin(u * (8 + layer) + layer * 2.1) * (17 + layer * 8) - Math.sin(u * 19 + layer * 1.4) * (6 + layer * 2);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = ['#2b3d59', '#1a2e4b', p.water][layer]; ctx.globalAlpha = [ .37, .67, 1 ][layer]; ctx.fill();
    }
    ctx.globalAlpha = 1;
    const wg = ctx.createLinearGradient(0, horizon, 0, h); wg.addColorStop(0, 'rgba(233,181,163,.12)'); wg.addColorStop(.35, 'rgba(87,111,151,.12)'); wg.addColorStop(1, 'rgba(4,10,29,.7)');
    ctx.fillStyle = wg; ctx.fillRect(0, horizon, w, h - horizon);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const mx = w * .76;
    for (let i = 0; i < 76; i++) {
      const depth = i / 76, y = horizon + 8 + depth * depth * (h - horizon);
      const width = (12 + depth * 105) * (.2 + r(i, 555) * .9);
      const x = mx + Math.sin(i * 3.7 + t * .45) * (4 + depth * 35) + (r(i, 556) - .5) * depth * 110;
      ctx.strokeStyle = `rgba(255,216,172,${(.08 + .19 * (1 - depth)) * (1 - depth * .35)})`;
      ctx.lineWidth = .5 + depth * 1.7; ctx.beginPath(); ctx.moveTo(x - width / 2, y); ctx.lineTo(x + width / 2, y); ctx.stroke();
    }
    for (let i = 0; i < 120; i++) {
      const y = horizon + r(i, 644) * (h - horizon), x = r(i, 645) * w, width = 2 + r(i, 646) * (7 + (y - horizon) / 16);
      ctx.strokeStyle = `rgba(182,208,218,${.024 + r(i, 647) * .055})`; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(x + Math.sin(t * .5 + i) * 3, y); ctx.lineTo(x + width + Math.sin(t * .5 + i) * 3, y); ctx.stroke();
    }
    ctx.restore();
  }
  function drawMarks(t, w, h) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], x = m.x * w, y = m.y * h;
      if (i > 0) {
        const prev = marks[i - 1], px = prev.x * w, py = prev.y * h;
        const distance = Math.hypot(px - x, py - y);
        if (distance < Math.min(w * .32, 370)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y);
          ctx.strokeStyle = 'rgba(255,224,191,.24)'; ctx.lineWidth = .7; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      const pulse = 1 + Math.sin(t * 1.5 + i * 1.3) * .13;
      glow(x, y, 35 * pulse, '#ffd3a4', .36);
      ctx.strokeStyle = 'rgba(255,229,196,.7)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(x, y, 7 * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff5df'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,241,217,.6)'; ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
      const age = t - m.born;
      if (age >= 0 && age < 1.2) { ctx.strokeStyle = `rgba(255,232,195,${(1 - age / 1.2) * .55})`; ctx.beginPath(); ctx.arc(x, y, 13 + age * 55, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawDust(t, w, h) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const d of dust) {
      const x = (d.x * w + Math.sin(t * d.speed + d.phase) * 28 + w) % w;
      const y = d.y * h * .88 + Math.cos(t * d.speed * .7 + d.phase) * 22;
      const alpha = .08 + .27 * (.5 + .5 * Math.sin(t * .8 + d.phase));
      ctx.fillStyle = `rgba(255,226,192,${alpha})`; ctx.beginPath(); ctx.arc(x, y, d.size, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawLantern(t, w, h) {
    const x = state.lanternX * w, y = state.lanternY * h;
    const bob = Math.sin(t * 1.6) * 5;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < state.trail.length; i++) {
      const pt = state.trail[i], life = (t - pt.t) / 3;
      if (life < 0 || life > 1) continue;
      const radius = (1 - life) * (pt.big ? 3 : 1.6);
      glow(pt.x * w, pt.y * h, radius * 8, '#f8c993', (1 - life) * .13);
      ctx.fillStyle = `rgba(255,227,186,${(1 - life) * .6})`; ctx.beginPath(); ctx.arc(pt.x * w, pt.y * h, radius, 0, TAU); ctx.fill();
    }
    glow(x, y + bob, 106, '#ffa96e', .2);
    glow(x, y + bob, 48, '#ffe1ac', .41);
    ctx.translate(x, y + bob); ctx.rotate(Math.sin(t * .8) * .075);
    // A little brass-and-glass vessel, rather than an animal avatar.
    ctx.shadowColor = '#ffdeb0'; ctx.shadowBlur = 27;
    ctx.strokeStyle = '#f8d5a1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -37); ctx.lineTo(0, -43); ctx.stroke();
    ctx.fillStyle = '#fff4d8'; ctx.beginPath(); ctx.arc(0, -45, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-18, -20); ctx.quadraticCurveTo(0, -37, 18, -20); ctx.lineTo(13, 16); ctx.quadraticCurveTo(0, 28, -13, 16); ctx.closePath();
    const glass = ctx.createLinearGradient(-15, -25, 17, 25); glass.addColorStop(0, '#fce0b2'); glass.addColorStop(.5, '#fff9df'); glass.addColorStop(1, '#e7a96c');
    ctx.fillStyle = glass; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#7f5766'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffbd78'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff7d7'; ctx.beginPath(); ctx.ellipse(-2, -3, 4, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c58b70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -19); ctx.lineTo(18, -19); ctx.moveTo(-13, 17); ctx.lineTo(13, 17); ctx.stroke();
    ctx.restore();
  }
  function drawBlooms(t, w, h) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    state.blooms = state.blooms.filter(b => t - b.t < 1.3);
    for (const b of state.blooms) {
      const age = t - b.t, x = b.x * w, y = b.y * h;
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * TAU + r(i, 300) * .1, dist = age * (35 + r(i, 301) * 58);
        ctx.fillStyle = `rgba(255,225,175,${(.8 - age * .6) * (1 - r(i, 302) * .4)})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, (1 - age / 1.3) * (1 + r(i, 303) * 2), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function draw() {
    const { w, h, time: t } = state;
    const p = palettes[paletteIndex], horizon = h * .64;
    drawSky(p, t, w, h, horizon);
    drawHorizon(p, t, w, h, horizon);
    drawDust(t, w, h); drawMarks(t, w, h); drawBlooms(t, w, h); drawLantern(t, w, h);
    const vignette = ctx.createRadialGradient(w * .5, h * .49, Math.min(w, h) * .25, w * .5, h * .49, Math.max(w, h) * .8);
    vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, 'rgba(2,7,21,.51)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  }
  function tick(now) {
    if (state.paused) { state.raf = 0; draw(); return; }
    const dt = Math.min(.04, (now - (state.last || now)) / 1000);
    state.last = now; state.time += dt;
    const t = state.time;
    if (t - state.pointerAt > 4) { state.targetX = .53 + Math.sin(t * .23) * .15; state.targetY = .46 + Math.sin(t * .31) * .06; }
    state.lanternX = lerp(state.lanternX, state.targetX, Math.min(1, dt * 1.7));
    state.lanternY = lerp(state.lanternY, state.targetY, Math.min(1, dt * 1.7));
    if (!state.trail.length || t - state.trail[state.trail.length - 1].t > .07) state.trail.push({ x: state.lanternX, y: state.lanternY, t, big: Math.random() > .73 });
    state.trail = state.trail.filter(pt => t - pt.t < 3);
    draw(); state.raf = requestAnimationFrame(tick);
  }
  function startLoop() { if (!state.raf && !state.paused) { state.last = 0; state.raf = requestAnimationFrame(tick); } else draw(); }
  function updateCount() {
    $('#starCount').textContent = marks.length;
    $('#fieldNumber').textContent = String(Math.min(999, Math.floor(marks.length / 3) + 1)).padStart(3, '0');
    $('#storyText').textContent = notes[Math.min(notes.length - 1, Math.floor(marks.length / 2))];
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 2500);
  }
  function remember() { try { localStorage.setItem(`afterglow:${seed}`, marks.map(m => `${m.x.toFixed(3)},${m.y.toFixed(3)}`).join(';')); } catch { /* Optional persistence. */ } }
  function plant(x, y) {
    if (!state.started || state.paused) return;
    const nx = clamp(x / state.w, .035, .965), ny = clamp(y / state.h, .06, .60);
    marks.push({ x: nx, y: ny, born: state.time });
    if (marks.length > 40) marks.shift();
    state.blooms.push({ x: nx, y: ny, t: state.time });
    remember(); updateCount(); playBell();
    if (marks.length === 1) toast('Your first star is in the sky.');
  }
  canvas.addEventListener('pointermove', (event) => {
    if (!state.started) return;
    state.targetX = clamp(event.clientX / state.w, .1, .9);
    state.targetY = clamp(event.clientY / state.h, .16, .77);
    state.pointerAt = state.time;
  }, { passive: true });
  canvas.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; plant(event.clientX, event.clientY); }, { passive: true });

  function ensureAudio() {
    if (!state.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC(), master = ac.createGain(); master.gain.value = .0001; master.connect(ac.destination);
      const nodes = [110, 164.81, 220].map((freq, i) => {
        const osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = i === 1 ? 'triangle' : 'sine'; osc.frequency.value = freq; gain.gain.value = [.05, .021, .012][i]; osc.connect(gain).connect(master); osc.start(); return osc;
      });
      state.audio = { ac, master, nodes };
    }
    state.audio.ac.resume().catch(() => {});
  }
  function setSound(on) {
    state.sound = on; if (on) ensureAudio();
    if (state.audio) state.audio.master.gain.setTargetAtTime(on && !state.paused ? 1 : .0001, state.audio.ac.currentTime, .7);
    $('#soundButton').textContent = on ? '♫' : '♪'; $('#soundButton').setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  }
  function playBell() {
    if (!state.sound || !state.audio) return;
    const { ac, master } = state.audio, oscillator = ac.createOscillator(), gain = ac.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = [523.25, 659.25, 783.99, 1046.5][marks.length % 4];
    gain.gain.setValueAtTime(.0001, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.06, ac.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + 1.7);
    oscillator.connect(gain).connect(master); oscillator.start(); oscillator.stop(ac.currentTime + 1.8);
  }
  $('#beginButton').addEventListener('click', () => {
    state.started = true;
    $('#intro').classList.add('hidden'); $('#experienceUi').classList.add('visible'); $('#experienceUi').setAttribute('aria-hidden', 'false');
    setSound(true); startLoop();
  });
  $('#soundButton').addEventListener('click', () => setSound(!state.sound));
  $('#pauseButton').addEventListener('click', togglePause);
  function togglePause() {
    state.paused = !state.paused;
    $('#pauseButton').textContent = state.paused ? '▶' : 'Ⅱ';
    $('#pauseButton').setAttribute('aria-label', state.paused ? 'Resume animation' : 'Pause animation');
    if (state.audio) state.audio.master.gain.setTargetAtTime(state.sound && !state.paused ? 1 : .0001, state.audio.ac.currentTime, .25);
    startLoop();
  }
  $('#paletteButton').addEventListener('click', () => { paletteIndex = (paletteIndex + 1) % palettes.length; replaceUrl(false); draw(); toast(palettes[paletteIndex].name); });
  $('#newButton').addEventListener('click', () => { const next = Math.floor(Math.random() * 900000 + 100000); location.href = `?seed=${next}`; });
  $('#saveButton').addEventListener('click', () => {
    draw(); const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `afterglow-atlas-${seed}.png`; link.click(); toast('Your night has been saved.');
  });
  $('#shareButton').addEventListener('click', async () => {
    const url = replaceUrl(true);
    try { await navigator.clipboard.writeText(url); toast('A link to your sky is copied.'); }
    catch { prompt('Copy this link to your sky:', url); }
  });
  addEventListener('keydown', (event) => {
    if (!state.started || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    if (event.key.toLowerCase() === 's') $('#saveButton').click();
    if (event.key.toLowerCase() === 'm') $('#soundButton').click();
    if (event.key.startsWith('Arrow')) {
      event.preventDefault(); state.pointerAt = state.time;
      state.targetX = clamp(state.targetX + (event.key === 'ArrowRight' ? .04 : event.key === 'ArrowLeft' ? -.04 : 0), .1, .9);
      state.targetY = clamp(state.targetY + (event.key === 'ArrowDown' ? .04 : event.key === 'ArrowUp' ? -.04 : 0), .16, .77);
    }
  });
  draw();
})();
