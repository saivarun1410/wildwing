import { terrainHeight, WATER_LEVEL, nearestSite } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const approach = (v, target, delta) => v + clamp(target - v, -delta, delta);
function huntSite(bird, sites, range) {
  const run = bird.y > 70 ? Math.min(160, (bird.y - 30) * 1.05) : 0;
  const suitable = sites.filter(site => Math.hypot(site.x - bird.x, site.z - bird.z) >= run);
  return nearestSite(bird, suitable, range) || nearestSite(bird, sites, range);
}

export function createBird(home, seed) {
  return {
    x: home.branch.x, y: home.branch.y, z: home.branch.z,
    heading: -.4, pitch: 0, bank: 0, speed: 0, cruiseSpeed: 20,
    mode: 'perched', action: 'At the home tree', goal: null,
    catches: 0, nestProgress: 0, twigs: 0, nestSource: null, nestAuto: false, wingPhase: 0, flapStrength: 0,
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
  bird.flapStrength = 1;
  bird.nestAuto = false;
  bird.lastEvent = 'Flying.';
}

function makeLandingGoal(bird, kind, site) {
  const branch = site.branch;
  const dx = bird.x - branch.x, dz = bird.z - branch.z;
  const distance = Math.hypot(dx, dz);
  const drop = bird.y - branch.y;
  if (drop < 8) return { kind, site, stage: 'direct' };
  const run = clamp(drop * 1.65, 38, 190);
  const awayX = distance > 1 ? dx / distance : -Math.sin(bird.heading);
  const awayZ = distance > 1 ? dz / distance : Math.cos(bird.heading);
  return {
    kind, site, stage: distance < run * .72 ? 'positioning' : 'cruise', run,
    entry: { x: branch.x + awayX * run, y: bird.y, z: branch.z + awayZ * run }
  };
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
    bird.mode = 'approaching'; bird.goal = makeLandingGoal(bird, 'perch', bird.home); bird.action = 'Returning to the home tree';
    return { ok: true, message: 'Returning to the home tree.' };
  }
  if (command.type === 'perch') {
    if (bird.mode === 'perched') return { ok: true, message: 'Already perched. Press F to take off.' };
    const site = nearestSite(bird, [bird.home, ...world.trees], 190);
    if (!site) return { ok: false, message: 'No branch nearby. Fly toward a forest and try again.' };
    bird.mode = 'approaching'; bird.goal = makeLandingGoal(bird, 'perch', site); bird.action = 'Approaching a branch';
    return { ok: true, message: 'Heading for a branch.' };
  }
  if (command.type === 'hunt-water') {
    const site = huntSite(bird, world.fish, 600);
    if (!site) return { ok: false, message: 'No fish nearby. Look for a lake or follow the water.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'fish', site, startY: bird.y, startDistance: Math.max(1, Math.hypot(site.x - bird.x, site.z - bird.z)) }; bird.action = 'Hunting fish';
    return { ok: true, message: 'Diving for fish.' };
  }
  if (command.type === 'hunt-land') {
    const site = huntSite(bird, world.prey, 220);
    if (!site) return { ok: false, message: 'No land prey nearby. Fly toward the meadow.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.mode = 'approaching'; bird.goal = { kind: 'prey', site, startY: bird.y, startDistance: Math.max(1, Math.hypot(site.x - bird.x, site.z - bird.z)) }; bird.action = 'Hunting on land';
    return { ok: true, message: 'Hunting on land.' };
  }
  if (command.type === 'nest') {
    if (bird.nestProgress >= 5) return { ok: true, message: 'The nest is complete. Return home to see it.' };
    const site = bird.nestSource || nearestSite(bird, world.prey, 150);
    if (!site && bird.twigs === 0) return { ok: false, message: 'Fly closer to a meadow to gather nesting material.' };
    if (bird.mode === 'perched') takeoff(bird);
    bird.nestSource = site; bird.nestAuto = true;
    bird.mode = 'approaching'; bird.goal = bird.twigs ? makeLandingGoal(bird, 'nest', bird.home) : { kind: 'twig', site };
    bird.action = bird.twigs ? 'Carrying a twig home' : 'Gathering nesting material';
    return { ok: true, message: bird.twigs ? 'Taking a twig home.' : 'Building your nest. The bird will make five trips.' };
  }
  return { ok: false, message: 'That action is not available.' };
}

export function updateBird(bird, controls, dt) {
  dt = clamp(dt, 0, .05);
  bird.wingPhase += dt * (bird.mode === 'perched' ? .9 : 4.3 + bird.speed * .035);
  if (bird.mode === 'perched') {
    bird.speed = 0; bird.bank = approach(bird.bank, 0, dt * 2);
    if (controls.forward > 0 || controls.flap) takeoff(bird);
    else return null;
  }

  const manual = controls.overrideTask ?? (Math.abs(controls.turn) > .04 || Math.abs(controls.climb) > .04 || controls.forward !== 0 || controls.flap);
  if (manual && bird.mode === 'approaching') { bird.mode = 'flying'; bird.goal = null; bird.nestAuto = false; bird.action = 'Free flight'; }

  const flightControls = bird.mode === 'approaching' ? { turn: 0, climb: 0, forward: 0, fast: false, flap: false } : controls;
  if (bird.mode === 'flying') bird.cruiseSpeed = clamp((bird.cruiseSpeed || 20) + flightControls.forward * dt * 33, 6, 120);
  let desiredSpeed = flightControls.fast ? 120 : bird.cruiseSpeed;
  let turn = flightControls.turn, climb = flightControls.climb;
  let autopilotPoint = null;
  let huntTargetHeight = null, huntPitch = 0, landingHeight = null, landingPitch = null;
  if (bird.mode === 'approaching' && bird.goal) {
    const { kind, site } = bird.goal;
    const hunting = kind === 'fish' || kind === 'prey';
    const landing = kind === 'perch' || kind === 'nest';
    const goal = bird.goal;
    const branch = landing ? site.branch : null;
    const branchDistance = landing ? Math.hypot(branch.x - bird.x, branch.z - bird.z) : 0;
    if (landing && goal.stage === 'positioning' && Math.hypot(goal.entry.x - bird.x, goal.entry.z - bird.z) < 3) {
      goal.stage = 'final'; goal.entryY = bird.y; goal.run = Math.max(1, branchDistance);
    }
    if (landing && goal.stage === 'cruise' && branchDistance <= goal.run) {
      goal.stage = 'final'; goal.entryY = bird.y; goal.run = Math.max(1, branchDistance);
    }
    const point = landing ? goal.stage === 'positioning' ? goal.entry : branch : site;
    autopilotPoint = point;
    const dx = point.x - bird.x, dz = point.z - bird.z;
    const horizontal = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, -dz);
    turn = clamp(angleDelta(desiredHeading, bird.heading) * 2.7, -1.5, 1.5);
    const targetHeight = kind === 'fish' ? Math.max(point.y + 1.3, WATER_LEVEL + 1.2) : point.y + (landing ? .4 : 1);
    if (hunting) {
      huntTargetHeight = targetHeight + Math.min(1, horizontal / bird.goal.startDistance) * Math.max(0, bird.goal.startY - targetHeight);
      huntPitch = -Math.min(.98, Math.atan2(Math.max(0, bird.goal.startY - targetHeight), bird.goal.startDistance));
    }
    climb = clamp((targetHeight - bird.y) / Math.max(6, horizontal * .45), -.85, .75);
    desiredSpeed = hunting ? 28 : horizontal < 12 ? 5 + horizontal * .3 : 16;
    if (landing && goal.stage !== 'direct') {
      climb = 0;
      desiredSpeed = goal.stage === 'final' ? horizontal < 11 ? 9 + horizontal * 1.1 : bird.species === 'falcon' ? 56 : 43 : 29;
      bird.action = goal.stage === 'positioning' ? 'Lining up to land' : goal.stage === 'cruise' ? 'Gliding toward the branch' : horizontal < 12 ? 'Flaring onto the branch' : 'Diving toward the branch';
      if (goal.stage === 'final') {
        const fraction = clamp(horizontal / goal.run, 0, 1);
        const drop = Math.max(0, goal.entryY - (branch.y + .4));
        landingPitch = -Math.min(.85, Math.atan(drop / goal.run * 6 * fraction * (1 - fraction)));
        landingHeight = branch.y + .4 + drop * (fraction * fraction * (3 - 2 * fraction));
      }
    } else {
      bird.action = kind === 'fish' ? horizontal < 80 ? 'Diving for fish' : 'Flying to water' : kind === 'prey' ? horizontal < 80 ? 'Swooping on prey' : 'Flying to prey' : kind === 'twig' ? 'Picking up a twig' : kind === 'nest' ? 'Bringing a twig home' : 'Landing on a branch';
    }
    if ((!landing || goal.stage !== 'positioning') && horizontal < (hunting ? 4.2 : 2.3) && Math.abs(bird.y - targetHeight) < (hunting ? 2.8 : 1.5)) {
      bird.x = point.x; bird.z = point.z;
      if (kind === 'perch' || kind === 'nest') {
        bird.y = point.y; bird.speed = 0; bird.mode = 'perched'; bird.goal = null; bird.perchSite = site;
        if (kind === 'nest') {
          bird.twigs = 0; bird.nestProgress = Math.min(5, bird.nestProgress + 1);
          bird.lastEvent = bird.nestProgress === 5 ? 'Nest complete.' : `Nest: ${bird.nestProgress} of 5 twigs placed.`;
          if (bird.nestAuto && bird.nestProgress < 5 && bird.nestSource) {
            bird.mode = 'approaching'; bird.goal = { kind: 'twig', site: bird.nestSource };
            bird.perchSite = null; bird.speed = 10; bird.y += 1.4;
            bird.action = `Gathering twig ${bird.nestProgress + 1} of 5`;
          } else { bird.action = 'At the nest'; bird.nestAuto = false; }
        } else { bird.action = 'On a branch'; bird.lastEvent = 'Landed on a branch.'; }
      } else if (kind === 'twig') {
        bird.twigs = 1; bird.y += 2.5; bird.goal = makeLandingGoal(bird, 'nest', bird.home); bird.action = 'Carrying a twig home';
        bird.lastEvent = 'Carrying a twig back to the nest.';
      } else {
        bird.catches++; bird.mode = 'flying'; bird.goal = null; bird.y += 3.5; bird.speed = 20;
        bird.lastEvent = kind === 'fish' ? 'Fish caught.' : 'Prey caught.';
        bird.action = 'Free flight';
      }
      return { type: kind, siteId: site.id, message: bird.lastEvent, x: bird.x, z: bird.z };
    }
  }

  bird.heading += turn * dt * (bird.speed < 7 ? 1.25 : .95);
  bird.bank = approach(bird.bank, -turn * .45, dt * 1.8);
  const terrainBelow = terrainHeight(bird.x, bird.z, bird.seed);
  const clearance = bird.y - Math.max(WATER_LEVEL + .8, terrainBelow + 1.4);
  const diveLimit = clearance < 18 ? -clamp((clearance - 3) / 24, 0, 1) : -.72;
  const targetPitch = bird.mode === 'flying' && climb < 0
    ? Math.max(clamp(climb, -1, 0) * .72, diveLimit)
    : clamp(climb, -.9, .9) * .43;
  bird.pitch = approach(bird.pitch, targetPitch, dt * (climb < 0 ? 1.5 : 1.2));
  if (huntTargetHeight !== null) bird.pitch = approach(bird.pitch, huntPitch, dt * 2.4);
  if (landingPitch !== null) bird.pitch = approach(bird.pitch, landingPitch, dt * 3.4);
  if (bird.mode === 'flying' && climb < 0) desiredSpeed = Math.min(145, desiredSpeed + Math.max(0, -bird.pitch) * 100);
  const targetSpeed = desiredSpeed + (flightControls.flap ? 4 : 0);
  bird.speed = approach(bird.speed, targetSpeed, dt * (bird.mode === 'approaching' ? 24 : targetSpeed > bird.speed ? (flightControls.fast ? 40 : 30) : 11));
  if (autopilotPoint) {
    const dx = autopilotPoint.x - bird.x, dz = autopilotPoint.z - bird.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(distance, bird.speed * dt);
    if (distance > .001) { bird.x += dx / distance * step; bird.z += dz / distance * step; }
  } else {
    const horizontalSpeed = Math.cos(bird.pitch) * bird.speed;
    bird.x += Math.sin(bird.heading) * horizontalSpeed * dt;
    bird.z -= Math.cos(bird.heading) * horizontalSpeed * dt;
  }
  if (landingHeight !== null) {
    const point = bird.goal.site.branch;
    const fraction = clamp(Math.hypot(point.x - bird.x, point.z - bird.z) / bird.goal.run, 0, 1);
    const drop = Math.max(0, bird.goal.entryY - (point.y + .4));
    bird.y = point.y + .4 + drop * (fraction * fraction * (3 - 2 * fraction));
  } else {
    bird.y = huntTargetHeight === null ? bird.y + (Math.sin(bird.pitch) * bird.speed + (flightControls.flap ? 2.5 : 0)) * dt : approach(bird.y, huntTargetHeight, dt * 52);
  }
  const terrain = terrainHeight(bird.x, bird.z, bird.seed);
  const cruiseHeight = Math.max(terrain + 23, 125);
  const flapTarget = flightControls.flap ? 1 : bird.mode === 'flying' && (flightControls.climb > .3 || bird.y < cruiseHeight - 18) ? .24 : .035;
  bird.flapStrength = approach(bird.flapStrength, flapTarget, dt * (flapTarget > bird.flapStrength ? 1.5 : .65));
  if (bird.mode === 'flying' && flightControls.climb >= 0 && bird.y < cruiseHeight) {
    bird.y += Math.min(cruiseHeight - bird.y, dt * 11);
  }
  const floor = terrain + 1.4;
  bird.y = Math.max(bird.y, Math.max(WATER_LEVEL + .8, floor));
  return null;
}
