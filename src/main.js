import * as THREE from 'three';
import { createEnvironment, createBirdVisual, animateBirdVisual } from './scene.js';
import { createBird, issueCommand, updateBird } from './simulation.js';
import { CITY, terrainHeight, landscapeAt, hash2, nearestSite } from './world.js';
import { mapLandmarks, mapDistance, mapHeading, mapBearing, mapPoint } from './map.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const qs = new URLSearchParams(location.search);
const fromUrl = Number(qs.get('seed'));
const seed = Number.isSafeInteger(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 900000 + 100000);
const url = new URL(location.href); url.searchParams.set('seed', seed); history.replaceState(null, '', url);
$('#worldId').textContent = `WORLD ${String(seed).padStart(6, '0')}`;

const canvasHost = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.appendChild(renderer.domElement);
} catch {
  $('#loading').innerHTML = 'THIS WILDERNESS NEEDS A BROWSER WITH WEBGL ENABLED';
  throw new Error('WebGL is unavailable');
}

const world = createEnvironment(seed, renderer);
const bird = createBird(world.home, seed);
try {
  const saved = JSON.parse(localStorage.getItem(`wildwing:${seed}`) || 'null');
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.z)) {
    bird.x = saved.x; bird.y = saved.y; bird.z = saved.z;
    bird.heading = Number.isFinite(saved.heading) ? saved.heading : bird.heading;
    bird.nestProgress = Math.max(0, Math.min(5, Number(saved.nestProgress) || 0));
    bird.catches = Math.max(0, Number(saved.catches) || 0);
    bird.mode = 'perched'; bird.action = 'At the home tree';
    // A saved position may be in open air; settle safely on the closest ground.
    if (Math.hypot(bird.x - world.home.branch.x, bird.z - world.home.branch.z) > 5) {
      bird.mode = 'flying'; bird.speed = 12; bird.y = Math.max(bird.y, terrainHeight(bird.x, bird.z, seed) + 6);
      bird.action = 'Flying';
    }
  }
} catch { /* Optional browser storage. */ }

const player = createBirdVisual(); world.scene.add(player);
const ambient = Array.from({ length: 7 }, (_, i) => {
  const species = i < 3 ? 'kingfisher' : 'eagle';
  const visual = createBirdVisual({ small: true, species }); world.scene.add(visual);
  return { visual, x: (i - 3) * 32, y: 20 + i * 3, z: -35 - i * 20, heading: 0, bank: 0, pitch: 0, wingPhase: i * 2, mode: 'flying', species, anchorX: (i - 3) * 55, anchorZ: -35 - i * 24 };
});

const key = new Set();
let inputRevision = 0, taskStartRevision = 0;
let pointerTurn = 0, pointerClimb = 0, dragging = false, lastPointer = null;
let running = false, time = 0, lastFrame = 0, lastHud = 0, lastMap = 0, lastSave = 0, lastChirp = 0;
let audio = null, soundOn = false;
const effects = [];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const landmarks = mapLandmarks(seed);
let mapOpen = false, mapSpan = 2400, mapCenter = { x: 0, z: 0 }, selectedPlace = 'city', mapCacheKey = '';

function notice(message) {
  const el = $('#notice'); el.textContent = message; el.classList.add('visible');
  clearTimeout(notice.timeout); notice.timeout = setTimeout(() => el.classList.remove('visible'), 3600);
}

function toggleDayNight() {
  const night = world.toggleNight();
  if (running) notice(night ? 'Night' : 'Morning');
  updateHud();
}

function runCommand(command) {
  const result = issueCommand(bird, command, world.sites);
  notice(result.message);
  if (result.ok) {
    if (bird.mode === 'approaching') taskStartRevision = inputRevision;
    updateHud();
  }
  return result;
}

document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => runCommand(button.dataset.command)));
$('#enterButton').addEventListener('click', () => {
  $('#welcome').classList.add('hidden'); $('#hud').classList.add('visible'); $('#hud').setAttribute('aria-hidden', 'false');
  running = true; $('#loading').classList.add('hidden'); startAudio();
});
$('#helpButton').addEventListener('click', () => { $('#help').hidden = false; });
$('#closeHelp').addEventListener('click', () => { $('#help').hidden = true; });
$('#help').addEventListener('click', event => { if (event.target === $('#help')) $('#help').hidden = true; });
$('#openMap').addEventListener('click', openWorldMap);
$('#closeMap').addEventListener('click', closeWorldMap);
$('#worldMap').addEventListener('click', event => { if (event.target === $('#worldMap')) closeWorldMap(); });
$('#zoomIn').addEventListener('click', () => { mapSpan = Math.max(600, mapSpan / 1.5); drawWorldMap(); });
$('#zoomOut').addEventListener('click', () => { mapSpan = Math.min(6000, mapSpan * 1.5); drawWorldMap(); });
$('#centerBird').addEventListener('click', () => { mapCenter = { x: bird.x, z: bird.z }; drawWorldMap(); });
$('#centerHome').addEventListener('click', () => { mapCenter = { x: 0, z: 0 }; drawWorldMap(); });
$('#facePlace').addEventListener('click', () => {
  const place = landmarks.find(item => item.id === selectedPlace);
  bird.heading = mapHeading(bird, place); bird.bank = 0;
  closeWorldMap();
  notice(`Facing ${place.label.toLowerCase()} · ${mapBearing(bird, place)} · ${Math.round(mapDistance(bird, place))} m`);
});
$('#soundButton').addEventListener('click', () => {
  soundOn = !soundOn; if (soundOn) startAudio();
  if (audio) audio.master.gain.setTargetAtTime(soundOn ? .9 : 0, audio.context.currentTime, .3);
  $('#soundButton').textContent = soundOn ? '♫' : '♪';
  notice(soundOn ? 'Sound on' : 'Sound off');
});
$('#timeToggle').addEventListener('click', toggleDayNight);

addEventListener('keydown', event => {
  if (event.key === 'Escape') { $('#help').hidden = true; if (mapOpen) closeWorldMap(); return; }
  if (event.target instanceof HTMLInputElement) return;
  if (event.key.toLowerCase() === 'm' && running && !event.repeat) { event.preventDefault(); mapOpen ? closeWorldMap() : openWorldMap(); return; }
  if (mapOpen) { event.preventDefault(); return; }
  if (event.key.toLowerCase() === 't' && running && !event.repeat) { event.preventDefault(); toggleDayNight(); return; }
  if (event.repeat && ['f', 'p', 'h', 'j', 'n'].includes(event.key.toLowerCase())) return;
  const shortcuts = { f: 'fly', p: 'perch', h: 'hunt fish', j: 'hunt land', n: 'build nest' };
  const command = shortcuts[event.key.toLowerCase()];
  if (command && running) { event.preventDefault(); runCommand(command); return; }
  if (!event.repeat && ['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(event.key.toLowerCase())) inputRevision++;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  key.add(event.key.toLowerCase());
});
addEventListener('keyup', event => key.delete(event.key.toLowerCase()));
addEventListener('blur', () => key.clear());

const sceneCanvas = renderer.domElement;
sceneCanvas.addEventListener('pointerdown', event => {
  if (!running) return;
  inputRevision++;
  dragging = true; lastPointer = { x: event.clientX, y: event.clientY };
  sceneCanvas.setPointerCapture(event.pointerId);
  if (bird.mode === 'perched') runCommand('fly');
});
sceneCanvas.addEventListener('pointermove', event => {
  if (!dragging || !lastPointer) return;
  inputRevision++;
  pointerTurn = Math.max(-1, Math.min(1, pointerTurn + (event.clientX - lastPointer.x) * .018));
  pointerClimb = Math.max(-1, Math.min(1, pointerClimb - (event.clientY - lastPointer.y) * .018));
  lastPointer = { x: event.clientX, y: event.clientY };
});
const endDrag = () => { dragging = false; lastPointer = null; };
sceneCanvas.addEventListener('pointerup', endDrag); sceneCanvas.addEventListener('pointercancel', endDrag);
sceneCanvas.addEventListener('contextmenu', event => event.preventDefault());

function controls() {
  const turn = (key.has('d') || key.has('arrowright') ? 1 : 0) - (key.has('a') || key.has('arrowleft') ? 1 : 0) + pointerTurn;
  const climb = (key.has('arrowup') ? 1 : 0) - (key.has('arrowdown') ? 1 : 0) + pointerClimb;
  return { turn: Math.max(-1, Math.min(1, turn)), climb: Math.max(-1, Math.min(1, climb)), forward: (key.has('w') ? 1 : 0) - (key.has('s') ? 1 : 0), fast: key.has('shift'), flap: key.has(' '), overrideTask: inputRevision > taskStartRevision };
}

function updateAmbient(dt) {
  ambient.forEach((other, i) => {
    const angle = time * (.18 + i * .014) + i * 2.4;
    const radius = 28 + i * 8;
    if (Math.hypot(other.anchorX - bird.x, other.anchorZ - bird.z) > 330) {
      other.anchorX = bird.x + (hash2(i, Math.floor(time), seed) - .5) * 150;
      other.anchorZ = bird.z + (hash2(i, Math.floor(time), seed + 17) - .5) * 150;
    }
    const phase = (time + i * 7) % 54;
    let x = other.anchorX + Math.cos(angle) * radius, z = other.anchorZ + Math.sin(angle) * radius;
    let y = Math.max(terrainHeight(x, z, seed) + 13, other.species === 'kingfisher' ? 12 : 24) + Math.sin(time * .9 + i) * 2;
    let restTarget = null;
    if (phase > 31 && phase < 43) {
      restTarget = nearestSite(other, world.sites.trees, 90) || world.home;
      x = restTarget.branch.x; z = restTarget.branch.z; y = restTarget.branch.y;
    } else if (other.species === 'kingfisher' && phase >= 43 && phase < 47) {
      const fish = nearestSite(other, world.sites.fish, 110);
      if (fish) { x = fish.x; z = fish.z; y = Math.max(1.4, 14 - (phase - 43) * 4); }
    }
    other.heading = Math.atan2(x - other.x, -(z - other.z));
    other.x += (x - other.x) * Math.min(1, dt * (restTarget ? 1.4 : 2.5));
    other.z += (z - other.z) * Math.min(1, dt * (restTarget ? 1.4 : 2.5));
    other.y += (y - other.y) * Math.min(1, dt * (restTarget ? 1.4 : 2.5));
    other.bank = Math.sin(angle) * .18; other.wingPhase += dt * (other.species === 'kingfisher' ? 16 : 7);
    other.mode = restTarget && Math.hypot(other.x - x, other.z - z, other.y - y) < 1.5 ? 'perched' : 'flying';
    animateBirdVisual(other.visual, other, time);
  });
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(bird.heading), 0, -Math.cos(bird.heading));
  const distance = 20 + bird.speed * .18;
  const targetPosition = new THREE.Vector3(bird.x, bird.y, bird.z).addScaledVector(forward, -distance).add(new THREE.Vector3(0, 6, 0));
  const lookAt = new THREE.Vector3(bird.x, bird.y + 1.5, bird.z).addScaledVector(forward, 10);
  if (bird.mode === 'perched' && bird.perchSite) {
    const outward = new THREE.Vector3(bird.x - bird.perchSite.x, 0, bird.z - bird.perchSite.z).normalize();
    targetPosition.set(bird.x + outward.x * 11, bird.y + 5, bird.z + outward.z * 11);
    lookAt.set(bird.x, bird.y + 1, bird.z);
  }
  world.camera.position.lerp(targetPosition, Math.min(1, dt * 2.1));
  world.camera.lookAt(lookAt);
}

function updateHud() {
  const nextTime = world.isNight() ? 'DAY' : 'NIGHT';
  $('#dayLabel').textContent = world.isNight() ? 'NIGHT' : 'DAY';
  $('#timeToggleLabel').textContent = nextTime;
  $('#timeToggle').setAttribute('aria-label', `Press T for ${nextTime.toLowerCase()}`);
  const mode = bird.mode === 'perched' ? 'Perched' : bird.mode === 'approaching' ? 'On the way' : 'Flying';
  $('#modeTitle').textContent = mode;
  const target = bird.goal?.site && (bird.goal.site.branch || bird.goal.site);
  const remaining = target ? Math.round(Math.hypot(target.x - bird.x, target.z - bird.z)) : 0;
  $('#modeDescription').textContent = bird.action + (target ? ` · ${remaining} m away` : bird.mode === 'perched' ? '. Press F to fly.' : '.');
  $('#speedValue').textContent = bird.mode === 'perched' ? '0 M/S' : `${Math.round(bird.speed)} M/S`;
  $('#altitudeValue').textContent = `${Math.round(Math.max(0, bird.y - terrainHeight(bird.x, bird.z, seed)))} M`;
  $('#distanceValue').textContent = `${Math.round(Math.hypot(bird.x, bird.z))} M`;
  $('#catchesValue').textContent = String(bird.catches);
  $('#nestValue').textContent = `${bird.nestProgress} / 5 TWIGS`;
  $('#nestTrack').style.width = `${bird.nestProgress * 20}%`;
  $('#fieldEvent').textContent = bird.lastEvent;
  $('#actionPrompt').textContent = bird.mode === 'perched' ? 'PRESS F TO FLY' : bird.mode === 'approaching' ? bird.action.toUpperCase() : 'DRAG OR USE THE KEYS TO STEER';
  $('#compassLabel').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((Math.round(bird.heading / (Math.PI / 4)) % 8) + 8) % 8];
  const city = landmarks[0];
  $('#cityRoute').textContent = `CITY CENTER · ${Math.round(mapDistance(bird, city))} M ${mapBearing(bird, city)}`;
}

const map = $('#map'), mapCtx = map.getContext('2d');
function drawMap() {
  const width = map.width, height = map.height, span = 320, cells = 40, cell = width / cells;
  mapCtx.fillStyle = '#789569'; mapCtx.fillRect(0, 0, width, height);
  for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) {
    const x = bird.x + (ix / cells - .5) * span, z = bird.z + (iz / cells - .5) * span;
    const h = terrainHeight(x, z, seed);
    mapCtx.fillStyle = landscapeAt(x, z, seed, h) === 'city' ? '#777b76' : h < 0 ? '#517e8a' : h < 2 ? '#c7b68c' : h > 28 ? '#a6a9a2' : h > 15 ? '#8e9c77' : '#6f8b62';
    mapCtx.fillRect(ix * cell, iz * cell, cell + .4, cell + .4);
  }
  for (const tree of world.sites.trees) {
    const px = width / 2 + (tree.x - bird.x) / span * width, py = height / 2 + (tree.z - bird.z) / span * height;
    if (px >= 0 && px <= width && py >= 0 && py <= height) { mapCtx.fillStyle = '#315c46'; mapCtx.beginPath(); mapCtx.arc(px, py, 1.5, 0, Math.PI * 2); mapCtx.fill(); }
  }
  const hx = width / 2 + (world.home.x - bird.x) / span * width, hy = height / 2 + (world.home.z - bird.z) / span * height;
  if (hx >= 0 && hx < width && hy >= 0 && hy < height) { mapCtx.fillStyle = '#ffdfa9'; mapCtx.font = '16px serif'; mapCtx.fillText('✺', hx - 7, hy + 6); }
  mapCtx.save(); mapCtx.translate(width / 2, height / 2); mapCtx.rotate(bird.heading);
  mapCtx.fillStyle = '#fff6df'; mapCtx.strokeStyle = '#193741'; mapCtx.lineWidth = 2;
  mapCtx.beginPath(); mapCtx.moveTo(0, -10); mapCtx.lineTo(-6, 7); mapCtx.lineTo(0, 3); mapCtx.lineTo(6, 7); mapCtx.closePath(); mapCtx.stroke(); mapCtx.fill(); mapCtx.restore();
}

const worldMapCanvas = $('#worldMapCanvas'), worldMapCtx = worldMapCanvas.getContext('2d');
const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 720;
const mapBaseCtx = mapBase.getContext('2d');

function openWorldMap() {
  if (!running) return;
  mapOpen = true; key.clear(); pointerTurn = pointerClimb = 0;
  $('#worldMap').hidden = false;
  drawWorldMap();
  $('#closeMap').focus();
}

function closeWorldMap() {
  mapOpen = false;
  $('#worldMap').hidden = true;
  $('#openMap').focus();
}

function drawWorldMap() {
  const size = worldMapCanvas.width, cells = 120, step = size / cells;
  const cacheKey = `${mapCenter.x}:${mapCenter.z}:${mapSpan}`;
  if (cacheKey !== mapCacheKey) {
    mapBaseCtx.fillStyle = '#527b82'; mapBaseCtx.fillRect(0, 0, size, size);
    const colors = { water: '#4d7e8d', wetland: '#668d78', meadow: '#83996d', woodland: '#426b52', coast: '#bfad81', mountain: '#728571', alpine: '#d6dad5', city: '#777d78' };
    for (let iz = 0; iz < cells; iz++) for (let ix = 0; ix < cells; ix++) {
      const x = mapCenter.x + ((ix + .5) / cells - .5) * mapSpan;
      const z = mapCenter.z + ((iz + .5) / cells - .5) * mapSpan;
      const y = terrainHeight(x, z, seed);
      mapBaseCtx.fillStyle = colors[landscapeAt(x, z, seed, y)];
      mapBaseCtx.fillRect(ix * step, iz * step, step + .5, step + .5);
    }
    const topLeft = mapPoint(CITY.minX, CITY.minZ, mapCenter, mapSpan, size);
    const bottomRight = mapPoint(CITY.maxX, CITY.maxZ, mapCenter, mapSpan, size);
    mapBaseCtx.strokeStyle = '#e7be91'; mapBaseCtx.lineWidth = 2;
    mapBaseCtx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    mapCacheKey = cacheKey;
  }
  worldMapCtx.drawImage(mapBase, 0, 0);
  const selected = landmarks.find(place => place.id === selectedPlace);
  const birdPoint = mapPoint(bird.x, bird.z, mapCenter, mapSpan, size);
  const targetPoint = mapPoint(selected.x, selected.z, mapCenter, mapSpan, size);
  worldMapCtx.strokeStyle = '#fff1cc'; worldMapCtx.lineWidth = 3;
  worldMapCtx.setLineDash([10, 8]); worldMapCtx.beginPath(); worldMapCtx.moveTo(birdPoint.x, birdPoint.y); worldMapCtx.lineTo(targetPoint.x, targetPoint.y); worldMapCtx.stroke(); worldMapCtx.setLineDash([]);
  const homePoint = mapPoint(0, 0, mapCenter, mapSpan, size);
  worldMapCtx.fillStyle = '#ffdfa9'; worldMapCtx.font = 'bold 17px Barlow, sans-serif';
  worldMapCtx.fillText('✺ HOME', homePoint.x + 8, homePoint.y - 9);
  for (const place of landmarks) {
    const p = mapPoint(place.x, place.z, mapCenter, mapSpan, size);
    worldMapCtx.beginPath(); worldMapCtx.arc(p.x, p.y, place.id === selectedPlace ? 9 : 6, 0, Math.PI * 2);
    worldMapCtx.fillStyle = place.color; worldMapCtx.fill();
    worldMapCtx.strokeStyle = '#173036'; worldMapCtx.lineWidth = 2; worldMapCtx.stroke();
    worldMapCtx.font = 'bold 17px Barlow, sans-serif'; worldMapCtx.lineWidth = 4;
    worldMapCtx.strokeStyle = '#10282b'; worldMapCtx.strokeText(place.label.toUpperCase(), p.x + 12, p.y + 5);
    worldMapCtx.fillStyle = '#fff7e8'; worldMapCtx.fillText(place.label.toUpperCase(), p.x + 12, p.y + 5);
  }
  worldMapCtx.save(); worldMapCtx.translate(birdPoint.x, birdPoint.y); worldMapCtx.rotate(bird.heading);
  worldMapCtx.beginPath(); worldMapCtx.moveTo(0, -13); worldMapCtx.lineTo(-8, 9); worldMapCtx.lineTo(0, 4); worldMapCtx.lineTo(8, 9); worldMapCtx.closePath();
  worldMapCtx.fillStyle = '#fff7dc'; worldMapCtx.strokeStyle = '#1a3840'; worldMapCtx.lineWidth = 3; worldMapCtx.stroke(); worldMapCtx.fill(); worldMapCtx.restore();
  $('#mapScale').textContent = `${(mapSpan / 1000).toFixed(1)} KM ACROSS`;
  const places = $('#mapPlaces'); places.replaceChildren();
  for (const place of landmarks) {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-pressed', String(selectedPlace === place.id));
    const label = document.createElement('span'); label.textContent = place.label;
    const route = document.createElement('span'); route.textContent = `${Math.round(mapDistance(bird, place))} M ${mapBearing(bird, place)}`;
    button.append(label, route);
    button.addEventListener('click', () => { selectedPlace = place.id; drawWorldMap(); });
    places.append(button);
  }
}

function startAudio() {
  if (audio) { audio.context.resume().catch(() => {}); return; }
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  const context = new Audio(), master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
  const length = context.sampleRate * 2, buffer = context.createBuffer(1, length, context.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .4;
  const wind = context.createBufferSource(); wind.buffer = buffer; wind.loop = true;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520;
  const windGain = context.createGain(); windGain.gain.value = .085; wind.connect(filter).connect(windGain).connect(master); wind.start();
  audio = { context, master };
  soundOn = true; master.gain.setTargetAtTime(.9, context.currentTime, .4); $('#soundButton').textContent = '♫';
}

function chirp() {
  if (!audio || !soundOn || document.hidden) return;
  const { context, master } = audio, osc = context.createOscillator(), gain = context.createGain();
  const now = context.currentTime, frequency = 900 + Math.random() * 450;
  osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + .06); osc.frequency.exponentialRampToValueAtTime(frequency * .8, now + .19);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.025, now + .03); gain.gain.exponentialRampToValueAtTime(.0001, now + .21);
  osc.connect(gain).connect(master); osc.start(); osc.stop(now + .23);
}

function saveProgress() {
  try { localStorage.setItem(`wildwing:${seed}`, JSON.stringify({ x: bird.x, y: bird.y, z: bird.z, heading: bird.heading, nestProgress: bird.nestProgress, catches: bird.catches })); } catch { /* Optional storage. */ }
}
function spawnEffect(event) {
  if (event.type !== 'fish' && event.type !== 'prey') return;
  const watery = event.type === 'fish';
  const group = new THREE.Group();
  group.position.set(event.x, watery ? .16 : terrainHeight(event.x, event.z, seed) + .12, event.z);
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.78, .94, 40), new THREE.MeshBasicMaterial({ color: watery ? 0xe4f8f2 : 0xcdbb93, transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .02 + i * .02; group.add(ring); rings.push(ring);
  }
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2, speed = 2.3 + (i % 4) * .6;
    const particle = new THREE.Mesh(new THREE.SphereGeometry(watery ? .11 : .085, 5, 4), new THREE.MeshBasicMaterial({ color: watery ? 0xe6f9f5 : 0xd7bc88, transparent: true, opacity: .85, depthWrite: false }));
    particle.position.y = .15; group.add(particle);
    particles.push({ mesh: particle, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 2.7 + (i % 3) * .75 });
  }
  world.scene.add(group); effects.push({ group, rings, particles, born: time });
}
function updateEffects() {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i], age = time - effect.born;
    if (age > 1.5) {
      world.scene.remove(effect.group);
      effect.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
      effects.splice(i, 1);
    } else {
      effect.rings.forEach((ring, j) => { ring.scale.setScalar(.45 + Math.max(0, age - j * .18) * 2.8); ring.material.opacity = Math.max(0, .75 * (1 - age / 1.5)); });
      effect.particles.forEach(({ mesh, vx, vy, vz }) => {
        mesh.position.set(vx * age, .15 + vy * age - 5 * age * age, vz * age);
        mesh.material.opacity = Math.max(0, .85 * (1 - age / 1.5));
      });
    }
  }
}
addEventListener('beforeunload', saveProgress);
addEventListener('resize', () => {
  world.camera.aspect = innerWidth / innerHeight; world.camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.65));
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - (lastFrame || now)) / 1000); lastFrame = now;
  if (running && !document.hidden && !mapOpen) {
    const simDt = motionPreference.matches ? dt * .55 : dt;
    time += simDt;
    const control = controls();
    const event = updateBird(bird, control, simDt);
    if (event) { if (event.siteId) world.consume(event.type, event.siteId); spawnEffect(event); notice(event.message); saveProgress(); }
    pointerTurn *= Math.pow(.91, dt * 60); pointerClimb *= Math.pow(.91, dt * 60);
    updateAmbient(simDt);
    updateEffects();
    if (time - lastSave > 5) { lastSave = time; saveProgress(); }
    if (time - lastChirp > 3.5 + hash2(Math.floor(time), 4, seed) * 4) { lastChirp = time; chirp(); }
  }
  world.update(bird, time);
  animateBirdVisual(player, bird, time);
  updateCamera(dt || .016);
  if (now - lastHud > 180) { lastHud = now; updateHud(); }
  if (now - lastMap > 440) { lastMap = now; drawMap(); }
  renderer.render(world.scene, world.camera);
}
world.camera.position.set(bird.x + 7, bird.y + 7, bird.z + 19);
$('#loading').classList.add('hidden');
requestAnimationFrame(frame);
