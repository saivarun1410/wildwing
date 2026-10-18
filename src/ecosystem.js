import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, hash2 } from './world.js';

const bodyShape = new THREE.SphereGeometry(1, 9, 7);
const legShape = new THREE.CylinderGeometry(.12, .16, 1, 6);
const twigShape = new THREE.CylinderGeometry(.045, .065, 1, 5);
export const sharedAnimalGeometry = new Set([bodyShape, legShape, twigShape]);
const colors = {
  deer: [0x98704e, 0xd7c09b], bear: [0x48392e, 0x71533b],
  monkey: [0x806442, 0xc6a27a], fox: [0xb16b3e, 0xf1dfbf]
};

function part(group, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale);
  mesh.castShadow = true; group.add(mesh); return mesh;
}

function makeAnimal(species) {
  const root = new THREE.Group();
  const [coat, detail] = colors[species];
  const fur = new THREE.MeshStandardMaterial({ color: coat, roughness: 1, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({ color: detail, roughness: 1, flatShading: true });
  const eye = new THREE.MeshStandardMaterial({ color: 0x161514, roughness: .25 });
  const big = species === 'bear', small = species === 'fox';
  const length = big ? 1.7 : small ? .95 : 1.3;
  part(root, bodyShape, fur, [0, big ? 1.25 : .94, 0], [big ? .82 : .43, big ? .7 : .42, length]);
  part(root, bodyShape, pale, [0, big ? 1.43 : 1.05, -length * .78], [big ? .54 : .31, big ? .48 : .31, big ? .55 : .4]);
  part(root, bodyShape, fur, [0, big ? 1.62 : 1.19, -length * .88], [big ? .52 : .31, big ? .47 : .34, big ? .54 : .37]);
  for (const side of [-1, 1]) {
    part(root, bodyShape, eye, [side * (big ? .33 : .23), big ? 1.71 : 1.27, -length * 1.12], [.045, .05, .045]);
    const ear = part(root, bodyShape, fur, [side * (big ? .38 : .25), big ? 1.99 : 1.48, -length * .88], [big ? .16 : .11, big ? .17 : species === 'fox' ? .25 : .13, .11]);
    ear.rotation.z = side * .17;
  }
  const legs = [];
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * (big ? .48 : .29), big ? .9 : .7, end * length * .58); root.add(leg);
    part(leg, legShape, fur, [0, -.35, 0], [big ? 1.65 : .75, big ? .85 : .7, big ? 1.65 : .75]);
    part(leg, bodyShape, species === 'deer' ? pale : fur, [0, -.72, -.06], [big ? .23 : .12, .09, big ? .28 : .16]);
    legs.push(leg);
  }
  if (species === 'deer') {
    for (const side of [-1, 1]) {
      const antler = part(root, twigShape, pale, [side * .21, 1.75, -1.08], [.9, .7, .9]); antler.rotation.z = side * .38;
      const tine = part(root, twigShape, pale, [side * .42, 1.93, -1.1], [.6, .38, .6]); tine.rotation.z = -side * .42;
    }
  } else if (species === 'monkey') {
    const tail = new THREE.Mesh(new THREE.TorusGeometry(.42, .07, 6, 15, Math.PI * 1.45), fur);
    tail.position.set(0, 1.08, 1.04); tail.rotation.y = Math.PI / 2; root.add(tail);
  } else if (species === 'fox') {
    const tail = part(root, bodyShape, fur, [0, .95, 1.1], [.2, .24, .7]); tail.rotation.x = -.3;
    part(root, bodyShape, pale, [0, .99, 1.66], [.11, .13, .2]);
  }
  return { root, legs };
}

export function addLandAnimals(group, tx, tz, seed) {
  const animals = [];
  const count = 1 + (hash2(tx, tz, seed + 720) > .58 ? 1 : 0);
  const species = ['deer', 'bear', 'monkey', 'fox'];
  for (let i = 0; i < count; i++) {
    const x = (tx + .18 + hash2(tx * 17 + i, tz, seed + 721) * .64) * TILE_SIZE;
    const z = (tz + .18 + hash2(tx, tz * 19 + i, seed + 722) * .64) * TILE_SIZE;
    const y = terrainHeight(x, z, seed);
    if (y < 2 || y > 26) continue;
    const kind = species[Math.floor(hash2(tx * 3 + i, tz * 5, seed + 723) * species.length)];
    const animal = makeAnimal(kind);
    animal.root.position.set(x, y, z); group.add(animal.root);
    animals.push({ ...animal, species: kind, x, z, seed, phase: hash2(tx, tz * 7 + i, seed + 724) * Math.PI * 2, radius: 2 + hash2(tx, i, seed + 725) * 4 });
  }
  return animals;
}

export function updateLandAnimals(animals, time) {
  for (const animal of animals) {
    const phase = time * .24 + animal.phase;
    const x = animal.x + Math.cos(phase) * animal.radius;
    const z = animal.z + Math.sin(phase * .73) * animal.radius;
    const y = terrainHeight(x, z, animal.seed);
    if (y < 1.5) continue;
    animal.root.position.set(x, y, z);
    animal.root.rotation.y = Math.atan2(-Math.sin(phase), Math.cos(phase * .73) * .73);
    animal.root.position.y += Math.sin(time * 3.1 + animal.phase) * .045;
    animal.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 3.1 + animal.phase + (i % 3) * Math.PI) * .24; });
  }
}

export function addWaterfalls(group, tx, tz, seed) {
  if (hash2(tx, tz, seed + 750) < .3) return [];
  let best = null;
  for (let i = 0; i < 25; i++) {
    const x = (tx + .1 + (i % 5) * .2) * TILE_SIZE;
    const z = (tz + .1 + Math.floor(i / 5) * .2) * TILE_SIZE;
    const top = terrainHeight(x, z, seed);
    if (top < 2.5 || top > 18) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = x + dx * 15, bz = z + dz * 15;
      const bottom = terrainHeight(bx, bz, seed);
      const drop = top - bottom;
      if (bottom < .5 && drop > 2.5 && (!best || drop > best.drop)) best = { x, z, bx, bz, top, drop };
    }
  }
  if (!best) return [];
  const { x, z, bx, bz, top } = best;
  const sideX = (bz - z) / 15, sideZ = -(bx - x) / 15;
  const vertices = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, cx = x + (bx - x) * t, cz = z + (bz - z) * t;
    const y = Math.max(.28, terrainHeight(cx, cz, seed) + .35 + Math.sin(t * Math.PI) * .9);
    const width = 1.3 + t * 1.8;
    vertices.push(cx - sideX * width, y, cz - sideZ * width, cx + sideX * width, y, cz + sideZ * width);
  }
  const indices = [];
  for (let i = 0; i < 12; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xbde8ed, emissive: 0x244e58, emissiveIntensity: .25, transparent: true, opacity: .82, roughness: .24, side: THREE.DoubleSide, depthWrite: false }));
  water.position.y = .1; group.add(water);
  const foam = part(group, bodyShape, new THREE.MeshBasicMaterial({ color: 0xe7f7f2, transparent: true, opacity: .72, depthWrite: false }), [bx, .38, bz], [3.1, .12, 3.1]);
  foam.castShadow = false;
  return [{ water, foam, x, z, bx, bz, top }];
}

export function updateWaterfalls(waterfalls, time) {
  for (const fall of waterfalls) {
    fall.water.material.opacity = .72 + Math.sin(time * 3 + fall.x) * .09;
    fall.foam.scale.x = 3.1 + Math.sin(time * 4 + fall.z) * .35;
  }
}
