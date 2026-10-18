import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnvironment, createBirdVisual, animateBirdVisual } from '../src/scene.js';
import { createBird } from '../src/simulation.js';
import * as THREE from 'three';
import { addLandAnimals, updateLandAnimals, addWaterfalls } from '../src/ecosystem.js';
import { treeSites } from '../src/world.js';

test('3D world constructs, streams terrain, and animates bird models', () => {
  const oldWidth = globalThis.innerWidth, oldHeight = globalThis.innerHeight;
  globalThis.innerWidth = 900; globalThis.innerHeight = 600;
  try {
    const renderer = { shadowMap: {} };
    const world = createEnvironment(123456, renderer);
    const bird = createBird(world.home, 123456);
    bird.nestProgress = 2;
    world.update(bird, 0);
    assert.equal(world.homeVisual.nest.visible, true);
    assert.deepEqual(world.homeVisual.stages.map(stage => stage.visible), [true, true, false, false, false]);
    const visual = createBirdVisual();
    world.scene.add(visual);
    world.update(bird, 0);
    animateBirdVisual(visual, bird, 0);
    let fishMesh, stars, sky, horizon;
    world.scene.traverse(object => {
      if (object.userData.kind === 'fish' && object.count > 0 && !fishMesh) fishMesh = object;
      if (object.userData.kind === 'stars') stars = object;
      if (object.userData.kind === 'sky') sky = object;
      if (object.userData.kind === 'horizon-terrain') horizon = object;
    });
    assert.ok(fishMesh && stars && sky && horizon);
    assert.ok(horizon.geometry.attributes.position.count > 2000, 'distant terrain should hide the streamed tile boundary');
    assert.ok(sky.material.fragmentShader.includes('seamFreeBlend'), 'sky image should wrap without a hard join');
    let grandFalls;
    world.scene.traverse(object => { if (object.userData.landmark === 'grand-falls') grandFalls = object; });
    assert.ok(grandFalls, 'the coastal waterfall should be present in the world');
    const beforeFish = fishMesh.instanceMatrix.array.slice(0, 16);
    world.update(bird, .2);
    assert.notDeepEqual([...fishMesh.instanceMatrix.array.slice(0, 16)], [...beforeFish], 'fish should move in water');
    world.update(bird, 180);
    assert.ok(stars.material.opacity > .5, 'stars should appear at night');
    assert.equal(world.isNight(), true);
    assert.equal(world.toggleNight(), false);
    world.update(bird, 0);
    assert.ok(stars.material.opacity < .1, 'time shortcut should return to day from a natural night');
    assert.equal(world.toggleNight(), true);
    world.update(bird, 0);
    assert.ok(stars.material.opacity > .5, 'time shortcut should restore night');
    assert.ok(world.sites.trees.length > 20);
    assert.ok(world.sites.fish.length > 0);
    assert.equal(visual.position.x, bird.x);
    const firstFish = world.sites.fish[0];
    world.consume('fish', firstFish.id);
    assert.ok(!world.sites.fish.some(site => site.id === firstFish.id));
    bird.x = 2000; bird.z = 2000;
    world.update(bird, 10);
    assert.equal(world.sites.trees.length, 0, 'the ocean should not contain trees');
    assert.ok(world.sites.fish.length > 0, 'ocean tiles should contain fish');
    assert.ok(world.scene.children.length < 100);
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;
  }
});

test('tree distribution makes mixed groves rather than one repeated tree', () => {
  const sites = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) sites.push(...treeSites(x, z, 123456));
  assert.deepEqual([...new Set(sites.map(tree => tree.species))].sort(), ['birch', 'oak', 'pine', 'willow']);
  assert.ok(sites.length > 150 && sites.length < 600);
});

test('land animals and waterfalls populate streamed terrain', () => {
  const kinds = new Set(); let falls = 0, moving = false;
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    const group = new THREE.Group();
    const animals = addLandAnimals(group, x, z, 123456);
    animals.forEach(animal => kinds.add(animal.species));
    if (animals.length) {
      const before = animals[0].root.position.clone();
      updateLandAnimals(animals, 5);
      moving ||= animals[0].root.position.distanceTo(before) > .1;
    }
    falls += addWaterfalls(group, x, z, 123456).length;
  }
  assert.deepEqual([...kinds].sort(), ['bear', 'deer', 'fox', 'monkey']);
  assert.ok(moving, 'animals should move across terrain');
  assert.ok(falls > 0, 'nearby terrain should include waterfalls');
});
