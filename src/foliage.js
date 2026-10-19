import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, landscapeAt, hash2 } from './world.js';

const palette = {
  oak: [0xb3c598, 0xa7bc91, 0xc0c99b],
  birch: [0xc0ceaa, 0xa9c59b, 0xc7cfad],
  willow: [0xaaba93, 0x99b48c, 0xbdc5a0],
  pine: [0x9bb39c, 0x879f91, 0xa9b9a3]
};
const grassTints = [0xa7ba86, 0x8fae7d, 0xb9b28b, 0x96a887];
const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
const texture = (name, srgb = false) => {
  if (!loader) return null;
  const image = loader.load(`/textures/${name}`);
  if (srgb) image.colorSpace = THREE.SRGBColorSpace;
  image.anisotropy = 4;
  return image;
};

const bark = texture('bark.jpg', true);
const leafMap = texture('broadleaf.jpg', true);
const leafAlpha = texture('broadleaf-alpha.png');
const pineMap = texture('pine.jpg', true);
const pineAlpha = texture('pine-alpha.png');
const grassMap = texture('grass.jpg', true);
const grassAlpha = texture('grass-alpha.png');

const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0xc9b99e, map: bark, roughness: 1 });
const birchMaterial = new THREE.MeshStandardMaterial({ color: 0xc5c4b3, roughness: 1 });
const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x665b48, roughness: 1 });
const foliageMaterial = (map, alphaMap) => new THREE.MeshStandardMaterial({
  color: 0xffffff, map, alphaMap, alphaTest: .46, side: THREE.DoubleSide, roughness: 1
});
const leafMaterial = foliageMaterial(leafMap, leafAlpha);
const pineMaterial = foliageMaterial(pineMap, pineAlpha);
const grassMaterial = foliageMaterial(grassMap, grassAlpha);
export const sharedFoliageMaterials = new Set([
  trunkMaterial, birchMaterial, branchMaterial, leafMaterial, pineMaterial, grassMaterial
]);

function cardGeometry(u0, v0, u1, v1) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geometry;
}

const leafCard = cardGeometry(.01, .50, .81, .99);
const pineCard = cardGeometry(.01, .62, .23, .99);
const grassCard = cardGeometry(0, .08, 1, 1);
const trunkShape = new THREE.CylinderGeometry(.25, .56, 1, 9);
const branchShape = new THREE.CylinderGeometry(.06, .16, 1, 6);
export const sharedFoliageGeometries = new Set([leafCard, pineCard, grassCard, trunkShape, branchShape]);
const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);

function place(mesh, index, x, y, z, sx, sy, sz, angle = 0, tilt = 0) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(tilt, angle, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function placeBranch(mesh, index, start, end, width) {
  const delta = new THREE.Vector3().subVectors(end, start);
  dummy.position.copy(start).add(end).multiplyScalar(.5);
  dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize());
  dummy.scale.set(width, delta.length(), width);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function makeInstances(geometry, material, capacity, parent) {
  const instances = new THREE.InstancedMesh(geometry, material, capacity);
  instances.castShadow = material !== grassMaterial && innerWidth > 700;
  instances.receiveShadow = true;
  parent.add(instances);
  return instances;
}

function addTrunks(parent, trees, seed) {
  const trunks = makeInstances(trunkShape, trunkMaterial, trees.length, parent);
  const birches = makeInstances(trunkShape, birchMaterial, trees.length, parent);
  const branches = makeInstances(branchShape, branchMaterial, trees.length * 8, parent);
  let trunkCount = 0, birchCount = 0, branchCount = 0;
  for (const [i, tree] of trees.entries()) {
    const height = tree.scale * (tree.species === 'willow' ? 8.4 : 10.5);
    const stem = tree.species === 'birch' ? birches : trunks;
    const stemIndex = stem === birches ? birchCount++ : trunkCount++;
    place(stem, stemIndex, tree.x, tree.y + height * .5, tree.z, tree.scale, height, tree.scale);
    for (let j = 0; j < 7; j++) {
      const angle = j * 2.399 + hash2(i, j, seed + 371);
      const reach = tree.scale * (tree.species === 'pine' ? 2.7 : 4.5);
      const base = new THREE.Vector3(tree.x, tree.y + height * (.48 + j * .055), tree.z);
      const tip = new THREE.Vector3(tree.x + Math.cos(angle) * reach, base.y + tree.scale * (1 + j * .36), tree.z + Math.sin(angle) * reach);
      placeBranch(branches, branchCount++, base, tip, tree.scale * (.21 - j * .012));
    }
  }
  for (const [mesh, count] of [[trunks, trunkCount], [birches, birchCount], [branches, branchCount]]) {
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
  }
}

function fillCanopy(instances, trees, seed, species, countPerTree, startIndex = 0) {
  let count = startIndex;
  for (const [i, tree] of trees.entries()) {
    if ((tree.species || 'oak') !== species) continue;
    for (let j = 0; j < countPerTree; j++) {
      const angle = j * 2.399 + hash2(i, j, seed + 410) * .8;
      const radius = Math.sqrt(hash2(i, j, seed + 411)) * tree.scale * (species === 'pine' ? 3.1 : 4.8);
      const level = species === 'pine' ? 5 + j / countPerTree * 8 : 9 + hash2(i, j, seed + 412) * 4.5;
      const x = tree.x + Math.cos(angle) * radius, z = tree.z + Math.sin(angle) * radius;
      const homeTree = tree.id === 'home';
      if (homeTree && Math.hypot(x - tree.branch.x, z - tree.branch.z) < 5.8) continue;
      const width = tree.scale * (species === 'pine' ? 2.1 : 3.1) * (.75 + hash2(i, j, seed + 413) * .55) * (homeTree ? .72 : 1);
      const height = width * (species === 'pine' ? 1.6 : 1.04);
      const tilt = j % 3 === 0 ? 1.1 + hash2(j, i, seed + 414) * .3 : (hash2(j, i, seed + 414) - .5) * 1.25;
      place(instances, count, x, tree.y + tree.scale * level, z, width, height, 1, angle + j * .71, tilt);
      instances.setColorAt(count++, new THREE.Color(palette[species][j % palette[species].length]));
    }
  }
  instances.count = count;
  instances.instanceMatrix.needsUpdate = true;
  if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  return count;
}

export function addVegetation(parent, trees, seed) {
  if (!trees.length) return;
  addTrunks(parent, trees, seed);
  const broadleaf = makeInstances(leafCard, leafMaterial, trees.length * 44, parent);
  const conifers = makeInstances(pineCard, pineMaterial, trees.length * 58, parent);
  let count = 0;
  for (const species of ['oak', 'birch', 'willow']) count = fillCanopy(broadleaf, trees, seed, species, 38, count);
  fillCanopy(conifers, trees, seed, 'pine', 54);
}

export function addGroundDetail(parent, tx, tz, seed) {
  const grass = makeInstances(grassCard, grassMaterial, 780, parent);
  grass.castShadow = false;
  let count = 0;
  for (let i = 0; i < 780; i++) {
    const x = (tx + hash2(i, tz * 23, seed + 511)) * TILE_SIZE;
    const z = (tz + hash2(tx * 29, i, seed + 512)) * TILE_SIZE;
    const y = terrainHeight(x, z, seed);
    if (y < .4 || y > 105) continue;
    const landscape = landscapeAt(x, z, seed, y);
    if (landscape === 'city' || landscape === 'alpine') continue;
    const size = .75 + hash2(i, tx, seed + 513) * 1.4;
    place(grass, count, x, y + size * .45, z, size * 1.1, size, 1, hash2(i, tz, seed + 514) * 6.28);
    grass.setColorAt(count++, new THREE.Color(grassTints[i % grassTints.length]));
  }
  grass.count = count;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
}
