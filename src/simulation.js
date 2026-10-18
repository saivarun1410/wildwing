import { terrainHeight, WATER_LEVEL, nearestSite } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const approach = (v, target, delta) => v + clamp(target - v, -delta, delta);

export function createBird(home, seed) {
  return {
    x: home.branch.x, y: home.branch.y, z: home.branch.z,
    heading: -.4, pitch: 0, bank: 0, speed: 0,
    mode: 'perched', action: 'At the home tree', goal: null,
    catches: 0, nestProgress: 0, twigs: 0, wingPhase: 0,
    home, perchSite: home, seed, lastEvent: 'Perched at the home tree.'
  };
}

export function parseCommand(raw) {
  const text = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(f|fly|take off|takeoff|soar)$/.test(text)) return { type: 'fly' };
  if (/^(p|perch|land|sit|sit on branch)$/.test(text)) return { type: 'perch' };
  if (/^(h|hunt|hunt fish|hunt water|fish|dive)$/.test(text)) return { type: 'hunt-water' };
  if (/^(j|hunt land|hunt insect|hunt prey|forage)$/.test(text)) return { type: 'hunt-land' };
  if (/^(n|nest|build nest|make nest|gather twigs)$/.test(text)) return { type: 'nest' };
  if (/^(home|return home)$/.test(text)) return { type: 'home' };
  const direction = /^fly (north|south|east|west)$/.exec(text);
  if (direction) return { type: 'direction', direction: direction[1] };
  return { type: 'unknown', text };
}

function takeoff(bird) {
  if (bird.mode === 'perched') { bird.y += 1.4; bird.speed = 10; }
  bird.mode = 'flying'; bird.goal = null; bird.perchSite = null; bird.action = 'Free flight';
  bird.lastEvent = 'Flying.';
}

export function issueCommand(bird, raw, world) {
  const command = typeof raw === 'string' ? parseCommand(raw) : raw;
  if (command.type === 'unknown') return { ok: false, message: 'Try: fly, perch, hunt fish, hunt land, build nest, or home.' };
  if (command.type === 'fly') { takeoff(bird); return { ok: true, message: 'Flying. Use W/A/S/D or drag to steer.' }; }
  if (command.type === 'direction') {
    takeoff(bird);
    bird.heading = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 }[command.direction];
    return { ok: true, message: `Flying ${command.direction}.` };
  }
  if (command.type === 'home') {
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'perch', site: bird.home }; bird.action = 'Returning to the home tree';
    return { ok: true, message: 'Returning to the home tree.' };
  }
  if (command.type === 'perch') {
    if (bird.mode === 'perched') return { ok: true, message: 'Already perched. Press F to take off.' };
    const site = nearestSite(bird, [bird.home, ...world.trees], 190);
    if (!site) return { ok: false, message: 'No branch nearby. Fly toward a forest and try again.' };
    bird.mode = 'approaching'; bird.goal = { kind: 'perch', site }; bird.action = 'Approaching a branch';
    return { ok: true, message: 'Heading for a branch.' };
  }
  if (command.type === 'hunt-water') {
    const site = nearestSite(bird, world.fish, 600);
    if (!site) return { ok: false, message: 'No fish nearby. Look for a lake or follow the water.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'fish', site }; bird.action = 'Hunting fish';
    return { ok: true, message: 'Diving for fish.' };
  }
  if (command.type === 'hunt-land') {
    const site = nearestSite(bird, world.prey, 220);
    if (!site) return { ok: false, message: 'No land prey nearby. Fly toward the meadow.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'prey', site }; bird.action = 'Hunting on land';
    return { ok: true, message: 'Hunting on land.' };
  }
  if (command.type === 'nest') {
    if (bird.nestProgress >= 5) return { ok: true, message: 'The nest is complete. Return home to see it.' };
    const site = nearestSite(bird, world.prey, 150);
    if (!site && bird.twigs === 0) return { ok: false, message: 'Fly closer to a meadow to gather nesting material.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = bird.twigs ? { kind: 'nest', site: bird.home } : { kind: 'twig', site };
    bird.action = bird.twigs ? 'Carrying a twig home' : 'Gathering nesting material';
    return { ok: true, message: bird.twigs ? 'Taking a twig to the nest.' : 'Searching the ground for a twig.' };
  }
  return { ok: false, message: 'That action is not available.' };
}

export function updateBird(bird, controls, dt) {
  dt = clamp(dt, 0, .05);
  bird.wingPhase += dt * (bird.mode === 'perched' ? .9 : 8 + bird.speed * .17);
  if (bird.mode === 'perched') {
    bird.speed = 0; bird.bank = approach(bird.bank, 0, dt * 2);
    if (controls.forward > 0 || controls.flap) takeoff(bird);
    else return null;
  }

  const manual = controls.overrideTask ?? (Math.abs(controls.turn) > .04 || Math.abs(controls.climb) > .04 || controls.forward !== 0 || controls.flap);
  if (manual && bird.mode === 'approaching') { bird.mode = 'flying'; bird.goal = null; bird.action = 'Free flight'; }

  const flightControls = bird.mode === 'approaching' ? { turn: 0, climb: 0, forward: 0, fast: false, flap: false } : controls;
  let desiredSpeed = flightControls.fast ? 27 : flightControls.forward < 0 ? 8 : flightControls.forward > 0 ? 20 : 14;
  let turn = flightControls.turn, climb = flightControls.climb;
  let autopilotPoint = null;
  if (bird.mode === 'approaching' && bird.goal) {
    const { kind, site } = bird.goal;
    const point = kind === 'perch' || kind === 'nest' ? site.branch : site;
    autopilotPoint = point;
    const dx = point.x - bird.x, dz = point.z - bird.z;
    const horizontal = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, -dz);
    turn = clamp(angleDelta(desiredHeading, bird.heading) * 2.7, -1.5, 1.5);
    const targetHeight = kind === 'fish' ? Math.max(point.y + 2, WATER_LEVEL + 1.1) : point.y + (kind === 'perch' || kind === 'nest' ? .4 : 1);
    climb = clamp((targetHeight - bird.y) / Math.max(6, horizontal * .45), -.85, .75);
    desiredSpeed = horizontal < 12 ? 5 + horizontal * .3 : kind === 'fish' ? 23 : 16;
    bird.action = kind === 'fish' ? horizontal < 25 ? 'Diving for fish' : 'Flying to water' : kind === 'prey' ? horizontal < 25 ? 'Closing on prey' : 'Flying to prey' : kind === 'twig' ? 'Picking up a twig' : kind === 'nest' ? 'Bringing a twig home' : 'Landing on a branch';
    if (horizontal < (kind === 'fish' ? 3.5 : 2.3) && Math.abs(bird.y - targetHeight) < (kind === 'fish' ? 2.4 : 1.5)) {
      bird.x = point.x; bird.z = point.z;
      if (kind === 'perch' || kind === 'nest') {
        bird.y = point.y; bird.speed = 0; bird.mode = 'perched'; bird.goal = null; bird.perchSite = site;
        if (kind === 'nest') {
          bird.twigs = 0; bird.nestProgress = Math.min(5, bird.nestProgress + 1);
          bird.lastEvent = bird.nestProgress === 5 ? 'Nest complete.' : `Nest: ${bird.nestProgress} of 5 twigs.`;
          bird.action = 'At the nest';
        } else { bird.action = 'On a branch'; bird.lastEvent = 'Landed on a branch.'; }
      } else if (kind === 'twig') {
        bird.twigs = 1; bird.goal = { kind: 'nest', site: bird.home }; bird.action = 'Carrying a twig home'; bird.y += 2.5;
        bird.lastEvent = 'Twig collected.';
      } else {
        bird.catches++; bird.mode = 'flying'; bird.goal = null; bird.y += 3.5; bird.speed = 12;
        bird.lastEvent = kind === 'fish' ? 'Fish caught.' : 'Prey caught.';
        bird.action = 'Free flight';
      }
      return { type: kind, siteId: site.id, message: bird.lastEvent, x: bird.x, z: bird.z };
    }
  }

  bird.heading += turn * dt * (bird.speed < 7 ? 1.25 : .95);
  bird.bank = approach(bird.bank, -turn * .45, dt * 1.8);
  bird.pitch = approach(bird.pitch, clamp(climb, -.9, .9) * .43, dt * 1.2);
  bird.speed = approach(bird.speed, desiredSpeed + (flightControls.flap ? 4 : 0), dt * 12);
  if (autopilotPoint) {
    const dx = autopilotPoint.x - bird.x, dz = autopilotPoint.z - bird.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, bird.speed * dt);
    if (distance > .001) { bird.x += dx / distance * step; bird.z += dz / distance * step; }
  } else {
    bird.x += Math.sin(bird.heading) * bird.speed * dt;
    bird.z -= Math.cos(bird.heading) * bird.speed * dt;
  }
  bird.y += (Math.sin(bird.pitch) * bird.speed + (flightControls.flap ? 2.5 : 0)) * dt;
  const terrain = terrainHeight(bird.x, bird.z, bird.seed);
  if (bird.mode === 'flying' && flightControls.climb >= 0 && bird.y < terrain + 20) {
    bird.y += Math.min(terrain + 20 - bird.y, dt * 5.5);
  }
  const floor = terrain + 1.4;
  bird.y = Math.max(bird.y, Math.max(WATER_LEVEL + .8, floor));
  return null;
}
