import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnvironment, createBirdVisual, animateBirdVisual } from '../src/scene.js';
import { createBird } from '../src/simulation.js';
import * as THREE from 'three';
import { addLandAnimals, updateLandAnimals, addWaterfalls } from '../src/ecosystem.js';
import { addCity, updateCity } from '../src/city.js';
import { treeSites, terrainHeight, landscapeAt, mountainFallsSites } from '../src/world.js';
import { roundParticleTexture } from '../src/weather.js';

test('snow and stars use a soft round particle sprite', () => {
  const texture = roundParticleTexture();
  const pixels = texture.image.data;
  assert.equal(pixels[3], 0, 'corners must be transparent');
  assert.equal(pixels[(16 * 32 + 16) * 4 + 3], 255, 'particle center must be opaque');
});

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
    bird.x = -750; bird.z = 320; bird.y = 125;
    world.update(bird, 6);
    let cityBuildings = 0, roadVehicles = 0;
    world.scene.traverse(object => {
      if (object.userData.kind === 'city-building') cityBuildings++;
      if (object.userData.kind === 'car' || object.userData.kind === 'truck') roadVehicles++;
    });
    assert.ok(cityBuildings > 20 && roadVehicles > 0, 'the streamed city should be visible and active');
    bird.x = 2000; bird.z = 2000;
    world.update(bird, 10);
    assert.equal(world.sites.trees.length, 0, 'the ocean should not contain trees');
    assert.ok(world.sites.fish.length > 0, 'ocean tiles should contain fish');
    assert.ok(world.scene.children.length < 100);
  } finally {
    globalThis.innerWidth = oldWidth; globalThis.innerHeight = oldHeight;
  }
});

test('bird choices have distinct silhouettes and weather updates the scene', () => {
  const oldWidth = globalThis.innerWidth, oldHeight = globalThis.innerHeight;
  globalThis.innerWidth = 900; globalThis.innerHeight = 600;
  try {
    const world = createEnvironment(123456, { shadowMap: {} });
    const bird = createBird(world.home, 123456);
    const visuals = ['eagle', 'falcon', 'owl', 'kingfisher'].map(species => createBirdVisual({ species }));
    assert.deepEqual(visuals.map(visual => visual.userData.species), ['eagle', 'falcon', 'owl', 'kingfisher']);
    assert.ok(visuals[2].children.length > visuals[0].children.length, 'owl should have facial details');
    assert.ok(visuals[3].scale.x < visuals[0].scale.x, 'kingfisher should be smaller than eagle');
    for (const visual of visuals) animateBirdVisual(visual, { ...bird, mode: 'flying', speed: 40, flapStrength: .2, wingPhase: 2 }, 1);
    animateBirdVisual(visuals[1], { ...bird, mode: 'approaching', goal: { kind: 'perch', stage: 'final' }, pitch: -.45, speed: 54, flapStrength: .05, wingPhase: 3 }, 2);
    assert.ok(visuals[1].rotation.x < -.4, 'falcon must point down during the landing dive');
    const rain = world.scene.children.find(object => object.userData.kind === 'weather-rain');
    const snow = world.scene.children.find(object => object.userData.kind === 'weather-snow');
    world.setWeather('rainy'); world.update(bird, 1);
    assert.equal(rain.visible, true); assert.equal(snow.visible, false);
    world.setWeather('snowy'); world.update(bird, 2);
    assert.equal(rain.visible, false); assert.equal(snow.visible, true);
    world.setWeather('stormy'); world.update(bird, 3);
    assert.equal(rain.visible, true);
    world.setWeather('pleasant'); world.update(bird, 4);
    assert.equal(rain.visible, false); assert.equal(snow.visible, false);
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

test('mountain slopes, woodland, and coast form distinct explorable landscapes', () => {
  const regions = new Set();
  for (let x = -5; x <= 5; x++) for (let z = -9; z <= 5; z++) {
    const px = x * 96 + 20, pz = z * 96 + 20;
    regions.add(landscapeAt(px, pz, 123456));
  }
  for (const region of ['mountain', 'alpine', 'woodland', 'meadow', 'coast', 'water']) assert.ok(regions.has(region), `missing ${region}`);
  for (const site of mountainFallsSites(123456)) {
    const upper = terrainHeight(site.x, site.z - 17, 123456);
    const lower = terrainHeight(site.x, site.z + 24, 123456);
    assert.ok(upper - lower > 12, 'mountain waterfall needs a real terrain drop');
    const group = new THREE.Group();
    const falls = addWaterfalls(group, Math.floor(site.x / 96), Math.floor((site.z - 17) / 96), 123456);
    assert.ok(falls.some(fall => fall.mountain && fall.upstream && fall.pool && fall.spray));
  }
});

test('southwestern city has buildings and moving cars and trucks, without forest trees', () => {
  const kinds = new Set(); let traffic = 0, buildings = 0;
  assert.equal(landscapeAt(-750, 320, 123456), 'city');
  for (let x = -11; x <= -5; x++) for (let z = 0; z <= 6; z++) {
    const group = new THREE.Group();
    const city = addCity(group, x, z, 123456, true);
    if (!city) continue;
    group.traverse(object => { if (object.userData.kind) kinds.add(object.userData.kind); if (object.userData.kind === 'city-building') buildings++; });
    if (city.vehicles.length) {
      const before = city.vehicles[0].root.position.clone();
      updateCity(city, 2);
      if (city.vehicles[0].root.position.distanceTo(before) > .1) traffic++;
    }
  }
  assert.ok(buildings > 30);
  assert.ok(kinds.has('car') && kinds.has('truck') && kinds.has('city-road'));
  assert.ok(traffic > 0);
  assert.equal(treeSites(-8, 3, 123456).length, 0);
});
