import { terrainHeight, WATER_LEVEL, nearestSite } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const approach = (v, target, delta) => v + clamp(target - v, -delta, delta);

export function createBird(home, seed) {
  return {
    x: home.branch.x, y: home.branch.y, z: home.branch.z,
    heading: -.4, pitch: 0, bank: 0, speed: 0,
    mode: 'perched', action: 'Resting in the canopy', goal: null,
    catches: 0, nestProgress: 0, twigs: 0, wingPhase: 0,
    home, seed, lastEvent: 'A broad world is waiting beyond the trees.'
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
  bird.mode = 'flying'; bird.goal = null; bird.action = 'Free flight';
  bird.lastEvent = 'Wings open. The air is yours.';
}

export function issueCommand(bird, raw, world) {
  const command = typeof raw === 'string' ? parseCommand(raw) : raw;
  if (command.type === 'unknown') return { ok: false, message: 'Try: fly, perch, hunt fish, hunt land, build nest, or home.' };
  if (command.type === 'fly') { takeoff(bird); return { ok: true, message: 'Takeoff — steer with W/A/S/D and the arrow keys.' }; }
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
    return { ok: true, message: 'Seeking a branch to perch on.' };
  }
  if (command.type === 'hunt-water') {
    const site = nearestSite(bird, world.fish, 220);
    if (!site) return { ok: false, message: 'No fish nearby. Look for a lake or follow the water.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'fish', site }; bird.action = 'Scanning the water';
    return { ok: true, message: 'A fish is moving below. Diving to hunt.' };
  }
  if (command.type === 'hunt-land') {
    const site = nearestSite(bird, world.prey, 220);
    if (!site) return { ok: false, message: 'No land prey nearby. Fly toward the meadow.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'prey', site }; bird.action = 'Hunting over the meadow';
    return { ok: true, message: 'A movement in the grass. Going in.' };
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

  const manual = Math.abs(controls.turn) > .04 || Math.abs(controls.climb) > .04 || controls.forward !== 0 || controls.flap;
  if (manual && bird.mode === 'approaching') { bird.mode = 'flying'; bird.goal = null; bird.action = 'Free flight'; }

  let desiredSpeed = controls.fast ? 27 : controls.forward < 0 ? 8 : controls.forward > 0 ? 20 : 14;
  let turn = controls.turn, climb = controls.climb;
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
    bird.action = kind === 'fish' ? 'Diving toward the lake' : kind === 'prey' ? 'Closing on land prey' : kind === 'twig' ? 'Collecting a twig' : kind === 'nest' ? 'Returning with a twig' : 'Settling onto a branch';
    if (horizontal < (kind === 'fish' ? 3.5 : 2.3) && Math.abs(bird.y - targetHeight) < (kind === 'fish' ? 2.4 : 1.5)) {
      bird.x = point.x; bird.z = point.z;
      if (kind === 'perch' || kind === 'nest') {
        bird.y = point.y; bird.speed = 0; bird.mode = 'perched'; bird.goal = null;
        if (kind === 'nest') {
          bird.twigs = 0; bird.nestProgress = Math.min(5, bird.nestProgress + 1);
          bird.lastEvent = bird.nestProgress === 5 ? 'The nest is complete.' : `Twig ${bird.nestProgress} of 5 woven into the nest.`;
          bird.action = 'Building at the home tree';
        } else { bird.action = 'Resting on a branch'; bird.lastEvent = 'A quiet moment in the canopy.'; }
      } else if (kind === 'twig') {
        bird.twigs = 1; bird.goal = { kind: 'nest', site: bird.home }; bird.action = 'Carrying a twig home'; bird.y += 2.5;
        bird.lastEvent = 'A twig is tucked carefully in the beak.';
      } else {
        bird.catches++; bird.mode = 'flying'; bird.goal = null; bird.y += 3.5; bird.speed = 12;
        bird.lastEvent = kind === 'fish' ? 'A silver fish caught from the water.' : 'A small meal caught in the grass.';
        bird.action = 'Free flight';
      }
      return { type: kind, siteId: site.id, message: bird.lastEvent, x: bird.x, z: bird.z };
    }
  }

  bird.heading += turn * dt * (bird.speed < 7 ? 1.25 : .95);
  bird.bank = approach(bird.bank, -turn * .45, dt * 1.8);
  bird.pitch = approach(bird.pitch, clamp(climb, -.9, .9) * .43, dt * 1.2);
  bird.speed = approach(bird.speed, desiredSpeed + (controls.flap ? 4 : 0), dt * 12);
  if (autopilotPoint) {
    const dx = autopilotPoint.x - bird.x, dz = autopilotPoint.z - bird.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, bird.speed * dt);
    if (distance > .001) { bird.x += dx / distance * step; bird.z += dz / distance * step; }
  } else {
    bird.x += Math.sin(bird.heading) * bird.speed * dt;
    bird.z -= Math.cos(bird.heading) * bird.speed * dt;
  }
  bird.y += (Math.sin(bird.pitch) * bird.speed + (controls.flap ? 2.5 : 0)) * dt;
  const floor = terrainHeight(bird.x, bird.z, bird.seed) + 1.4;
  bird.y = Math.max(bird.y, Math.max(WATER_LEVEL + .8, floor));
  return null;
}
