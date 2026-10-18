import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeSite, terrainHeight, fishSites, preySites, treeSites } from '../src/world.js';
import { createBird, issueCommand, parseCommand, updateBird } from '../src/simulation.js';

const idle = { turn: 0, climb: 0, forward: 0, fast: false, flap: false };
const seed = 123456;
const home = homeSite(seed);
const world = { trees: [], fish: [], prey: [] };
for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
  world.trees.push(...treeSites(x, z, seed));
  world.fish.push(...fishSites(x, z, seed));
  world.prey.push(...preySites(x, z, seed));
}

function until(bird, predicate, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    updateBird(bird, idle, 1 / 60);
    if (predicate()) return true;
  }
  return false;
}

test('terrain is deterministic and the home tree begins above water', () => {
  assert.equal(terrainHeight(88, 0, seed), terrainHeight(88, 0, seed));
  for (const sampleSeed of [1, 42, 123456, 999999]) assert.ok(homeSite(sampleSeed).y >= 8.9);
  assert.ok(world.fish.some(site => Math.hypot(site.x - home.x, site.z - home.z) < 220));
  assert.ok(world.prey.some(site => Math.hypot(site.x - home.x, site.z - home.z) < 150));
});

test('keyboard and typed commands resolve to bird actions', () => {
  assert.deepEqual(parseCommand('  HUNT   FISH '), { type: 'hunt-water' });
  assert.deepEqual(parseCommand('fly east'), { type: 'direction', direction: 'east' });
  assert.equal(parseCommand('build nest').type, 'nest');
  assert.equal(parseCommand('perch').type, 'perch');
});

test('bird begins perched, then steers and climbs under manual control', () => {
  const bird = createBird(home, seed), start = { x: bird.x, y: bird.y, z: bird.z };
  for (let i = 0; i < 100; i++) updateBird(bird, idle, 1 / 60);
  assert.deepEqual([bird.x, bird.y, bird.z], [start.x, start.y, start.z]);
  issueCommand(bird, 'fly east', world);
  for (let i = 0; i < 180; i++) updateBird(bird, { ...idle, forward: 1, climb: .6 }, 1 / 60);
  assert.equal(bird.mode, 'flying');
  assert.ok(bird.x > start.x + 20);
  assert.ok(bird.y > start.y + 3);
});

test('bird can hunt water, perch, and return home', () => {
  const bird = createBird(home, seed);
  assert.ok(issueCommand(bird, 'hunt fish', world).ok);
  assert.ok(until(bird, () => bird.catches === 1), 'fish hunt should finish');
  assert.ok(issueCommand(bird, 'perch', world).ok);
  assert.ok(until(bird, () => bird.mode === 'perched'), 'perch approach should finish');
  assert.ok(issueCommand(bird, 'home', world).ok);
  assert.ok(until(bird, () => bird.mode === 'perched' && Math.hypot(bird.x - home.branch.x, bird.z - home.branch.z) < 2), 'home approach should finish');
});

test('nest building gathers and places five separate twigs', () => {
  const bird = createBird(home, seed);
  for (let i = 1; i <= 5; i++) {
    assert.ok(issueCommand(bird, 'build nest', world).ok);
    assert.ok(until(bird, () => bird.nestProgress === i), `nesting trip ${i} should finish`);
    assert.equal(bird.mode, 'perched');
  }
  assert.match(bird.lastEvent, /complete/);
});

test('held steering does not cancel a hunt or nest task until new input arrives', () => {
  const held = { ...idle, forward: 1, flap: true, overrideTask: false };
  const bird = createBird(home, seed);
  assert.ok(issueCommand(bird, 'hunt land', world).ok);
  for (let i = 0; i < 4000 && bird.catches === 0; i++) updateBird(bird, held, 1 / 60);
  assert.equal(bird.catches, 1);
  assert.ok(issueCommand(bird, 'build nest', world).ok);
  for (let i = 0; i < 4000 && bird.nestProgress === 0; i++) updateBird(bird, held, 1 / 60);
  assert.equal(bird.nestProgress, 1);
  assert.ok(issueCommand(bird, 'hunt fish', world).ok);
  updateBird(bird, { ...held, overrideTask: true }, 1 / 60);
  assert.equal(bird.mode, 'flying');
  assert.equal(bird.goal, null);
});

test('free flight clears the trees and can climb above clouds or dive deliberately', () => {
  const bird = createBird(home, seed);
  issueCommand(bird, 'fly', world);
  for (let i = 0; i < 300; i++) updateBird(bird, idle, 1 / 60);
  assert.ok(bird.y >= terrainHeight(bird.x, bird.z, seed) + 19);
  for (let i = 0; i < 2400; i++) updateBird(bird, { ...idle, climb: 1, fast: true }, 1 / 60);
  assert.ok(bird.y > 200, 'bird can fly higher than the cloud layer');
  for (let i = 0; i < 2400; i++) updateBird(bird, { ...idle, climb: -1, fast: true }, 1 / 60);
  assert.ok(bird.y < 80, 'deliberate dive is not blocked by the canopy cruise height');
});
