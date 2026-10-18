import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnvironment, createBirdVisual, animateBirdVisual } from '../src/scene.js';
import { createBird } from '../src/simulation.js';

test('3D world constructs, streams terrain, and animates bird models', () => {
  const oldWidth = globalThis.innerWidth, oldHeight = globalThis.innerHeight;
  globalThis.innerWidth = 900; globalThis.innerHeight = 600;
  try {
    const renderer = { shadowMap: {} };
    const world = createEnvironment(123456, renderer);
    const bird = createBird(world.home, 123456);
    const visual = createBirdVisual();
    world.scene.add(visual);
    world.update(bird, 0);
    animateBirdVisual(visual, bird, 0);
    assert.ok(world.sites.trees.length > 20);
    assert.ok(world.sites.fish.length > 0);
    assert.equal(visual.position.x, bird.x);
    const firstFish = world.sites.fish[0];
    world.consume('fish', firstFish.id);
    assert.ok(!world.sites.fish.some(site => site.id === firstFish.id));
    bird.x = 2000; bird.z = 2000;
    world.update(bird, 10);
    assert.ok(world.sites.trees.length > 0);
    assert.ok(world.scene.children.length < 100);
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;
  }
});
