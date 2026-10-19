import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, landscapeAt, mountainFallsSites, hash2 } from './world.js';

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
    if (y < 2 || y > 26 || landscapeAt(x, z, seed, y) === 'city') continue;
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
  let best = null;
  for (const site of mountainFallsSites(seed)) {
    const x = site.x, z = site.z - 17;
    if (Math.floor(x / TILE_SIZE) !== tx || Math.floor(z / TILE_SIZE) !== tz) continue;
    const bx = x, bz = site.z + 24;
    const top = terrainHeight(x, z, seed), bottom = terrainHeight(bx, bz, seed);
    if (top - bottom > 12) best = { x, z, bx, bz, top, bottom, drop: top - bottom, width: 6.4, mountain: true };
  }
  if (!best && hash2(tx, tz, seed + 750) >= .45) {
    for (let i = 0; i < 25; i++) {
      const x = (tx + .1 + (i % 5) * .2) * TILE_SIZE;
      const z = (tz + .1 + Math.floor(i / 5) * .2) * TILE_SIZE;
      const top = terrainHeight(x, z, seed);
      if (top < 4 || top > 25) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const bx = x + dx * 18, bz = z + dz * 18;
        const bottom = terrainHeight(bx, bz, seed);
        const drop = top - bottom;
        if (bottom < 1 && drop > 3.5 && (!best || drop > best.drop)) best = { x, z, bx, bz, top, bottom, drop, width: 2.4, mountain: false };
      }
    }
  }
  if (!best) return [];
  const { x, z, bx, bz, top, bottom, mountain } = best;
  const length = Math.hypot(bx - x, bz - z);
  const forwardX = (bx - x) / length, forwardZ = (bz - z) / length;
  const sideX = forwardZ, sideZ = -forwardX;
  const ribbons = [];
  function waterRibbon(from, to, width, offset, pale, number) {
    const rows = 26, vertices = [], shades = [], indices = [];
    const base = new THREE.Color(pale ? 0xb6d1d0 : 0x6e9fa8);
    const foam = new THREE.Color(0xe5eee9);
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, distance = from + (to - from) * t;
      const cx = x + forwardX * distance + sideX * offset;
      const cz = z + forwardZ * distance + sideZ * offset;
      const ground = terrainHeight(cx, cz, seed);
      const surface = ground + .25 + (pale ? .36 : .16) + Math.sin(t * Math.PI) * (mountain ? .48 : .18);
      for (let side = 0; side <= 4; side++) {
        const across = (side / 4 - .5) * width * (1 + t * .18);
        const waviness = Math.sin(t * 31 + side * 1.7 + number) * .11;
        vertices.push(cx + sideX * (across + waviness), surface + Math.sin(t * 24 + side) * .08, cz + sideZ * (across + waviness));
        const streak = Math.pow(Math.abs(Math.sin(t * 23 + side * 2.5 + number)), 8) * .38 + (side === 0 || side === 4 ? .15 : 0);
        const shade = base.clone().lerp(foam, streak);
        shades.push(shade.r, shade.g, shade.b);
        if (row < rows && side < 4) {
          const a = row * 5 + side;
          indices.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: .05, roughness: pale ? .35 : .24, transparent: true, opacity: pale ? .65 : .8, side: THREE.DoubleSide, depthWrite: false });
    const ribbon = new THREE.Mesh(geometry, material); ribbon.castShadow = false; group.add(ribbon); ribbons.push(ribbon);
    return ribbon;
  }
  const upstream = waterRibbon(mountain ? -37 : -13, 0, best.width * .88, 0, false, 0);
  const water = waterRibbon(0, length, best.width, 0, false, 1);
  for (let i = -1; i <= 1; i++) waterRibbon(1, length - 1, best.width * .18, i * best.width * .25, true, i + 3);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(mountain ? 8.5 : 4.8, 32), new THREE.MeshPhysicalMaterial({ color: 0x5f9297, transparent: true, opacity: .72, roughness: .28, depthWrite: false, side: THREE.DoubleSide }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(bx, bottom + .24, bz + (mountain ? 2 : 0)); pool.castShadow = false; group.add(pool);
  const foam = new THREE.Mesh(new THREE.RingGeometry(mountain ? 2.3 : 1.4, mountain ? 4.2 : 2.8, 36), new THREE.MeshBasicMaterial({ color: 0xe1ece8, transparent: true, opacity: .52, depthWrite: false, side: THREE.DoubleSide }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(bx, bottom + .28, bz); foam.castShadow = false; group.add(foam);
  const sprayPositions = [];
  for (let i = 0; i < (mountain ? 78 : 32); i++) {
    const spread = (hash2(i, 2, seed + 760) - .5) * best.width * 1.6;
    sprayPositions.push(bx + sideX * spread + (hash2(i, 3, seed + 761) - .5) * 2,
      bottom + .6 + hash2(i, 4, seed + 762) * Math.min(10, best.drop * .35),
      bz + sideZ * spread + (hash2(i, 5, seed + 763) - .5) * 2);
  }
  const sprayGeometry = new THREE.BufferGeometry(); sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sprayPositions, 3));
  const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xe3ede8, size: mountain ? .8 : .45, transparent: true, opacity: .46, depthWrite: false }));
  group.add(spray);
  return [{ water, upstream, ribbons, pool, foam, spray, x, z, bx, bz, top, bottom, drop: best.drop, mountain }];
}

export function updateWaterfalls(waterfalls, time) {
  for (const fall of waterfalls) {
    fall.ribbons.forEach((ribbon, i) => { ribbon.material.opacity = (i < 2 ? .76 : .61) + Math.sin(time * 2.5 + i + fall.x) * .035; });
    fall.foam.scale.setScalar(1 + Math.sin(time * 2.4 + fall.z) * .055);
    fall.spray.material.opacity = .41 + Math.sin(time * 2.1 + fall.x) * .045;
  }
}
