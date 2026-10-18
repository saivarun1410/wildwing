import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, treeSites, fishSites, preySites, homeSite, hash2 } from './world.js';
import { addLandAnimals, updateLandAnimals, addWaterfalls, updateWaterfalls, sharedAnimalGeometry } from './ecosystem.js';

const color = hex => new THREE.Color(hex);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const dummy = new THREE.Object3D();
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5744, roughness: 1 });
const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x695642, roughness: 1 });
const foliageMaterials = [0x517653, 0x66875a, 0x799261, 0x426b58].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));

function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function segment(parent, start, end, radius, material, radial = 7) {
  const a = v(...start), b = v(...end), dir = b.clone().sub(a);
  const result = mesh(new THREE.CylinderGeometry(radius * .65, radius, dir.length(), radial), material, parent);
  result.position.copy(a).add(b).multiplyScalar(.5);
  result.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
  return result;
}

function makeSky(scene) {
  const geometry = new THREE.SphereGeometry(560, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: v(-.7, .37, -.45).normalize() }, night: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection; uniform float night;
      void main(){ float y=clamp(vDir.y,0.0,1.0); vec3 horizon=vec3(.86,.78,.65); vec3 mid=vec3(.53,.68,.74); vec3 zenith=vec3(.22,.41,.59);
      vec3 c=mix(horizon,mid,smoothstep(.01,.35,y)); c=mix(c,zenith,smoothstep(.28,.96,y));
      float glow=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),14.0);
      float sun=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),730.0);
      c+=vec3(1.0,.48,.18)*glow*.35+vec3(1.0,.85,.59)*sun*1.7;
      c=mix(c, mix(vec3(.065,.10,.19),vec3(.012,.025,.075),y),night); gl_FragColor=vec4(c,1.0);}`
  });
  const sky = new THREE.Mesh(geometry, material); sky.renderOrder = -100; scene.add(sky); return sky;
}

function makeClouds(scene, seed) {
  const group = new THREE.Group(); scene.add(group);
  const materials = [0xf8f5ed, 0xe8edf0, 0xd5dfe3].map(tint => new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity: .69, depthWrite: false, fog: false }));
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 29; i++) {
    const cx = (hash2(i, 4, seed) - .5) * 900, cz = (hash2(i, 7, seed) - .5) * 900;
    const cy = 95 + hash2(i, 8, seed) * 105;
    const cloud = new THREE.Group(); cloud.position.set(cx, cy, cz); group.add(cloud);
    const count = 5 + Math.floor(hash2(i, 9, seed) * 5);
    const width = 26 + hash2(i, 10, seed) * 25;
    for (let j = 0; j < count; j++) {
      const puff = new THREE.Mesh(geometry, materials[Math.floor(hash2(i, j, seed + 40) * materials.length)]);
      const spread = (j / Math.max(1, count - 1) - .5) * width;
      puff.position.set(spread + (hash2(i, j, seed + 33) - .5) * 8, (hash2(i, j, seed + 34) - .5) * 7, (hash2(i, j, seed + 35) - .5) * 17);
      puff.scale.set(10 + hash2(i, j, seed + 36) * 11, 5 + hash2(i, j, seed + 37) * 8, 7 + hash2(i, j, seed + 38) * 10);
      cloud.add(puff);
    }
  }
  return group;
}

function makeCelestial(scene, seed) {
  const group = new THREE.Group(); scene.add(group);
  const sun = mesh(new THREE.SphereGeometry(12, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe4a6, fog: false, toneMapped: false }), group);
  const moon = mesh(new THREE.SphereGeometry(8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xdce6f1, fog: false, toneMapped: false }), group);
  sun.castShadow = moon.castShadow = false;
  const positions = [];
  for (let i = 0; i < 650; i++) {
    const angle = hash2(i, 1, seed + 900) * Math.PI * 2;
    const elevation = (hash2(i, 2, seed + 901) * 1.8 - .3) * Math.PI / 2;
    positions.push(Math.cos(elevation) * Math.cos(angle) * 480, Math.sin(elevation) * 480, Math.cos(elevation) * Math.sin(angle) * 480);
  }
  const points = new THREE.BufferGeometry(); points.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xf2f4ff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(points, starMaterial); group.add(stars);
  return { group, sun, moon, stars, starMaterial };
}

function terrainTile(tx, tz, seed, consumed, detailed = true) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, detailed ? 32 : 12, detailed ? 32 : 12);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const sand = color(0xb7aa7d), grass = color(0x67815a), grass2 = color(0x829665), high = color(0x999a83), rock = color(0x88918c);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + (tx + .5) * TILE_SIZE, z = positions.getZ(i) + (tz + .5) * TILE_SIZE;
    const y = terrainHeight(x, z, seed); positions.setY(i, y);
    const variation = hash2(Math.floor(x * .8), Math.floor(z * .8), seed + 230) * .3;
    let shade;
    if (y < .7) shade = sand.clone().lerp(grass, Math.max(0, y + 1) / 3);
    else if (y < 17) shade = grass.clone().lerp(grass2, variation);
    else if (y < 30) shade = grass2.clone().lerp(high, (y - 17) / 13);
    else shade = high.clone().lerp(rock, Math.min(1, (y - 30) / 20));
    colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const land = mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, side: THREE.DoubleSide }), group,
    (tx + .5) * TILE_SIZE, 0, (tz + .5) * TILE_SIZE);
  land.castShadow = false;
  const trees = detailed ? treeSites(tx, tz, seed) : [], fish = detailed ? fishSites(tx, tz, seed) : [], prey = detailed ? preySites(tx, tz, seed) : [];
  let wildlife = null;
  if (detailed) {
    addVegetation(group, trees, tx, tz, seed);
    addGroundDetail(group, tx, tz, seed);
    wildlife = addWildlife(group, fish, prey, seed);
    wildlife.animals = addLandAnimals(group, tx, tz, seed);
    wildlife.waterfalls = addWaterfalls(group, tx, tz, seed);
    for (const kind of ['fish', 'prey']) {
      const meshes = kind === 'fish' ? wildlife.fishMeshes : wildlife.preyMeshes;
      const list = kind === 'fish' ? fish : prey;
      list.forEach((site, index) => {
        if (!consumed.has(site.id)) return;
        dummy.position.set(0, -1000, 0); dummy.quaternion.identity(); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
        meshes.forEach(instanced => instanced.setMatrixAt(index, dummy.matrix));
      });
      meshes.forEach(instanced => { instanced.instanceMatrix.needsUpdate = true; });
    }
  }
  return { group, trees, fish, prey, wildlife, consumed, detailed };
}

function setInstance(instanced, i, position, scale, rotation = 0) {
  dummy.position.set(...position); dummy.scale.set(...scale); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); instanced.setMatrixAt(i, dummy.matrix);
}

function addVegetation(group, trees, tx, tz, seed) {
  if (!trees.length) return;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.32, .5, 1, 7), trunkMaterial, trees.length);
  trunks.castShadow = true;
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 2);
  const canopies = foliageMaterials.map(mat => new THREE.InstancedMesh(canopyGeometry, mat, trees.length * 4));
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), foliageMaterials[3], trees.length * 2);
  const branchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .21, 1, 6), branchMaterial, trees.length);
  branchMesh.castShadow = true;
  const counts = [0, 0, 0, 0]; let pineCount = 0;
  trees.forEach((tree, i) => {
    const s = tree.scale, trunkHeight = s * (7.1 + hash2(i, tx, seed + 250) * 3.6);
    setInstance(trunks, i, [tree.x, tree.y + trunkHeight * .5, tree.z], [s, trunkHeight, s], hash2(i, tx, seed) * .4);
    const start = v(tree.x, tree.y + s * 6.9, tree.z), end = v(tree.branch.x, tree.branch.y, tree.branch.z), dir = end.clone().sub(start);
    dummy.position.copy(start).add(end).multiplyScalar(.5); dummy.quaternion.setFromUnitVectors(v(0, 1, 0), dir.clone().normalize()); dummy.scale.set(s, dir.length(), s); dummy.updateMatrix(); branchMesh.setMatrixAt(i, dummy.matrix); dummy.quaternion.identity();
    if (hash2(i, tz, seed + 251) < .28) {
      for (let j = 0; j < 2; j++) {
        setInstance(pines, pineCount++, [tree.x, tree.y + s * (8.5 + j * 2.2), tree.z], [s * (3.3 - j * .8), s * (6.8 - j * 1.1), s * (3.3 - j * .8)]);
      }
    } else {
      const type = Math.floor(hash2(i, tz, seed + 252) * 4);
      for (let j = 0; j < 4; j++) {
        const angle = j * 2.399 + hash2(i, j, seed + 253) * .8;
        const radius = j === 3 ? .4 : 1.2 + hash2(i, j, seed + 254) * 1.7;
        const size = 2.1 + hash2(i, j, seed + 255) * 1.5;
        setInstance(canopies[type], counts[type]++, [tree.x + Math.cos(angle) * radius * s, tree.y + s * (8.8 + hash2(i, j, seed + 256) * 2.7), tree.z + Math.sin(angle) * radius * s], [s * size, s * size * (.72 + hash2(i, j, seed + 257) * .4), s * size * (.8 + hash2(i, j, seed + 258) * .3)], angle);
      }
    }
  });
  group.add(trunks, branchMesh, pines);
  canopies.forEach((canopy, i) => { canopy.count = counts[i]; canopy.instanceMatrix.needsUpdate = true; canopy.castShadow = innerWidth > 700; group.add(canopy); });
  pines.count = pineCount; pines.instanceMatrix.needsUpdate = true; pines.castShadow = innerWidth > 700;
  trunks.instanceMatrix.needsUpdate = true; branchMesh.instanceMatrix.needsUpdate = true;
}

function addGroundDetail(group, tx, tz, seed) {
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9b87, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMaterial, 24);
  let rockCount = 0;
  for (let i = 0; i < 24; i++) {
    const x = (tx + hash2(i, tz * 17, seed + 441)) * TILE_SIZE, z = (tz + hash2(tx * 19, i, seed + 442)) * TILE_SIZE;
    const y = terrainHeight(x, z, seed), s = .3 + hash2(i, tx, seed + 443) * 1.2;
    if (y < .5) continue;
    setInstance(rocks, rockCount++, [x, y + s * .24, z], [s, s * .52, s * 1.2], hash2(i, tz, seed + 444) * 6);
  }
  rocks.count = rockCount; group.add(rocks);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x8da575, roughness: 1, side: THREE.DoubleSide });
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(.38, 1, 3), grassMat, 190);
  let grassCount = 0;
  for (let i = 0; i < 190; i++) {
    const x = (tx + hash2(i, tz * 23, seed + 511)) * TILE_SIZE, z = (tz + hash2(tx * 29, i, seed + 512)) * TILE_SIZE;
    const y = terrainHeight(x, z, seed), s = .5 + hash2(i, tx, seed + 513) * 1.2;
    if (y < .5 || y > 28) continue;
    setInstance(grass, grassCount++, [x, y + s * .4, z], [s, s, s], hash2(i, tz, seed + 514) * 6);
  }
  grass.count = grassCount; grass.castShadow = false; group.add(grass);
}

function addWildlife(group, fish, prey, seed) {
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xb6c8bb, metalness: .33, roughness: .45 });
  const fishBody = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), fishMat, fish.length);
  fishBody.userData.kind = 'fish';
  const tailGeometry = new THREE.ConeGeometry(.18, .42, 4); tailGeometry.rotateZ(-Math.PI / 2);
  const fishTail = new THREE.InstancedMesh(tailGeometry, fishMat, fish.length);
  fish.forEach((f, i) => {
    setInstance(fishBody, i, [f.x, -.2, f.z], [.56, .15, .25]);
    setInstance(fishTail, i, [f.x - .65, -.2, f.z], [1, 1, 1]);
  });
  fishBody.count = fish.length; fishTail.count = fish.length; group.add(fishBody, fishTail);
  const preyMat = new THREE.MeshStandardMaterial({ color: 0x745a3a, roughness: 1 });
  const preyBody = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), preyMat, prey.length);
  const preyHead = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), preyMat, prey.length);
  prey.forEach((p, i) => {
    setInstance(preyBody, i, [p.x, p.y, p.z], [.43, .18, .25]);
    setInstance(preyHead, i, [p.x + .35, p.y + .06, p.z], [.16, .15, .17]);
  });
  preyBody.count = prey.length; preyHead.count = prey.length; group.add(preyBody, preyHead);
  return { fishMeshes: [fishBody, fishTail], preyMeshes: [preyBody, preyHead] };
}

function animateWildlife(tile, time, consumed) {
  const { fish, prey, wildlife } = tile;
  if (!wildlife) return;
  fish.forEach((f, i) => {
    if (consumed.has(f.id)) return;
    const phase = time * 2.4 + i * 1.73;
    const x = f.x + Math.sin(phase) * .85, z = f.z + Math.cos(phase * .8) * .55;
    const breach = Math.max(0, Math.sin(phase * .33 - 1.3)) ** 9;
    const y = -.55 - Math.sin(phase * .62) * .4 + breach * 1.35;
    const heading = Math.atan2(Math.cos(phase), -Math.sin(phase * .8));
    setInstance(wildlife.fishMeshes[0], i, [x, y, z], [.56, .16, .25], heading);
    setInstance(wildlife.fishMeshes[1], i, [x - Math.cos(heading) * .62, y, z - Math.sin(heading) * .62], [1, 1, 1], heading + Math.sin(phase * 5) * .4);
  });
  wildlife.fishMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  prey.forEach((p, i) => {
    if (consumed.has(p.id)) return;
    const phase = time * 1.9 + i * 2.3;
    const x = p.x + Math.sin(phase) * .55, z = p.z + Math.cos(phase * .7) * .45;
    setInstance(wildlife.preyMeshes[0], i, [x, p.y, z], [.43, .18, .25], phase);
    setInstance(wildlife.preyMeshes[1], i, [x + Math.cos(phase) * .35, p.y + .06, z + Math.sin(phase) * .35], [.16, .15, .17]);
  });
  wildlife.preyMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  updateLandAnimals(wildlife.animals, time);
  updateWaterfalls(wildlife.waterfalls, time);
}

function makeHome(scene, site) {
  const root = new THREE.Group(); scene.add(root);
  const { x, y, z, scale: s } = site;
  segment(root, [x, y, z], [x, y + 16, z], 1.1, trunkMaterial, 9);
  segment(root, [x, y + 10.8, z], [site.branch.x, site.branch.y - .4, site.branch.z], .48, branchMaterial);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2, radius = 4.2 + hash2(i, 11, 1) * 3;
    const tx = x + Math.cos(angle) * radius, tz = z + Math.sin(angle) * radius, ty = y + 13 + (i % 3) * 1.6;
    segment(root, [x, y + 11 + (i % 3)], [tx, ty, tz], .3, branchMaterial);
    const leaves = mesh(new THREE.IcosahedronGeometry(2.8 + (i % 3) * .35, 1), foliageMaterials[i % foliageMaterials.length], root, tx, ty + .7, tz);
    leaves.scale.set(1.15, .85, 1); leaves.castShadow = false;
  }
  const crown = mesh(new THREE.IcosahedronGeometry(4.2, 1), foliageMaterials[1], root, x, y + 17, z); crown.scale.set(1.1, .7, 1); crown.castShadow = false;
  const nest = new THREE.Group(); nest.position.set(site.branch.x - .3, site.branch.y + .1, site.branch.z); root.add(nest);
  const nestMat = new THREE.MeshStandardMaterial({ color: 0x745638, roughness: 1, side: THREE.DoubleSide });
  const ring = mesh(new THREE.TorusGeometry(1.2, .22, 5, 16), nestMat, nest); ring.rotation.x = Math.PI / 2;
  const base = mesh(new THREE.CylinderGeometry(1.1, .85, .3, 12), nestMat, nest, 0, -.12, 0);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.399, radius = .65 + (i % 4) * .16;
    const twig = mesh(new THREE.CylinderGeometry(.035, .045, 1.4, 4), nestMat, nest, Math.cos(angle) * radius, .12 + (i % 3) * .05, Math.sin(angle) * radius);
    twig.rotation.set(Math.PI / 2, 0, angle);
  }
  nest.visible = false;
  return { root, nest, ring, base, site };
}

export function createEnvironment(seed, renderer) {
  const scene = new THREE.Scene(); scene.background = color(0x9cb2bd); scene.fog = new THREE.FogExp2(0xb6c2b4, .0026);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .1, 900);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.65;
  const hemi = new THREE.HemisphereLight(0xd9e9fb, 0x66714c, 2.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfaa, 3.1); sun.position.set(-75, 150, -105); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -85; sun.shadow.camera.right = 85; sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 380; sun.shadow.bias = -.0003; scene.add(sun, sun.target);
  const sky = makeSky(scene), clouds = makeClouds(scene, seed), celestial = makeCelestial(scene, seed);
  const waterGeometry = new THREE.PlaneGeometry(1400, 1400, 48, 48); waterGeometry.rotateX(-Math.PI / 2);
  const water = mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: 0x5a98a3, metalness: .22, roughness: .21, transparent: true, opacity: .66, clearcoat: .45, side: THREE.DoubleSide, depthWrite: false }), scene, 0, .04, 0);
  water.castShadow = false; water.receiveShadow = true;
  const home = homeSite(seed), homeVisual = makeHome(scene, home);
  const tiles = new Map(), consumed = new Set(), sites = { trees: [], fish: [], prey: [] };
  let centerX = Infinity, centerZ = Infinity;
  const radius = innerWidth < 700 ? 1 : 2;
  function disposeTile(tile) {
    scene.remove(tile.group);
    tile.group.traverse(obj => { if (obj.geometry && !sharedAnimalGeometry.has(obj.geometry)) obj.geometry.dispose(); if (obj.material && !foliageMaterials.includes(obj.material) && obj.material !== trunkMaterial && obj.material !== branchMaterial) obj.material.dispose(); });
  }
  function refresh(x, z) {
    const tx = Math.floor(x / TILE_SIZE), tz = Math.floor(z / TILE_SIZE);
    if (tx === centerX && tz === centerZ) return;
    centerX = tx; centerZ = tz;
    const wanted = new Set();
    for (let dx = -radius - 2; dx <= radius + 2; dx++) for (let dz = -radius - 2; dz <= radius + 2; dz++) {
      const px = tx + dx, pz = tz + dz, key = `${px}:${pz}`; wanted.add(key);
      const detailed = Math.max(Math.abs(dx), Math.abs(dz)) <= radius;
      if (tiles.has(key) && tiles.get(key).detailed !== detailed) { disposeTile(tiles.get(key)); tiles.delete(key); }
      if (!tiles.has(key)) { const tile = terrainTile(px, pz, seed, consumed, detailed); tiles.set(key, tile); scene.add(tile.group); }
    }
    for (const [key, tile] of tiles) if (!wanted.has(key)) {
      disposeTile(tile);
      tiles.delete(key);
    }
    sites.trees = []; sites.fish = []; sites.prey = [];
    for (const tile of tiles.values()) { sites.trees.push(...tile.trees); sites.fish.push(...tile.fish.filter(site => !consumed.has(site.id))); sites.prey.push(...tile.prey.filter(site => !consumed.has(site.id))); }
  }
  function consume(kind, siteId) {
    if (kind !== 'fish' && kind !== 'prey') return;
    consumed.add(siteId);
    sites[kind] = sites[kind].filter(site => site.id !== siteId);
    for (const tile of tiles.values()) {
      const index = tile[kind].findIndex(site => site.id === siteId);
      if (index < 0) continue;
      const meshes = kind === 'fish' ? tile.wildlife.fishMeshes : tile.wildlife.preyMeshes;
      dummy.position.set(0, -1000, 0); dummy.quaternion.identity(); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
      meshes.forEach(instanced => { instanced.setMatrixAt(index, dummy.matrix); instanced.instanceMatrix.needsUpdate = true; });
      break;
    }
  }
  refresh(home.branch.x, home.branch.z);
  let lastNestProgress = -1, lastEcology = -1;
  function update(bird, time) {
    refresh(bird.x, bird.z);
    sky.position.set(bird.x, bird.y, bird.z);
    clouds.position.set(bird.x + Math.sin(time * .018) * 30, 0, bird.z);
    celestial.group.position.set(bird.x, bird.y, bird.z);
    const angle = .72 + time * .018;
    const elevation = Math.sin(angle);
    const night = Math.max(0, Math.min(1, (.1 - elevation) * 2.2));
    const sunDirection = v(Math.cos(angle), elevation, -.22).normalize();
    celestial.sun.position.copy(sunDirection).multiplyScalar(430);
    celestial.moon.position.copy(sunDirection).multiplyScalar(-430);
    celestial.starMaterial.opacity = night * .9;
    sky.material.uniforms.sunDirection.value.copy(sunDirection);
    sky.material.uniforms.night.value = night;
    hemi.intensity = 2.5 - night * 1.9;
    sun.intensity = 3.1 - night * 2.9;
    scene.fog.color.copy(color(0xb6c2b4)).lerp(color(0x24334a), night);
    water.position.set(bird.x, .04 + Math.sin(time * 1.2) * .035, bird.z);
    sun.position.copy(v(bird.x, bird.y, bird.z)).addScaledVector(sunDirection, 210);
    sun.target.position.set(bird.x, bird.y, bird.z); sun.target.updateMatrixWorld();
    if (time - lastEcology > .065) {
      lastEcology = time;
      for (const tile of tiles.values()) if (tile.detailed) animateWildlife(tile, time, consumed);
    }
    if (bird.nestProgress !== lastNestProgress) {
      homeVisual.nest.visible = bird.nestProgress > 0;
      homeVisual.nest.scale.setScalar(.4 + bird.nestProgress * .13);
      lastNestProgress = bird.nestProgress;
    }
  }
  return { scene, camera, home, sites, update, refresh, consume, homeVisual };
}

function feather(parent, x, y, z, sx, sy, sz, material, tilt = 0) {
  const f = mesh(new THREE.SphereGeometry(1, 7, 5), material, parent, x, y, z);
  f.scale.set(sx, sy, sz); f.rotation.y = tilt; return f;
}

export function createBirdVisual({ small = false, species = 'eagle' } = {}) {
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: species === 'kingfisher' ? 0x1c748b : 0x4b352a, roughness: .88 });
  const mid = new THREE.MeshStandardMaterial({ color: species === 'kingfisher' ? 0x2e91a5 : 0x76513a, roughness: .86 });
  const light = new THREE.MeshStandardMaterial({ color: species === 'kingfisher' ? 0xc7733e : 0xe7dbba, roughness: .9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd3a34d, roughness: .7 });
  const eye = new THREE.MeshPhysicalMaterial({ color: 0x111716, roughness: .1, clearcoat: 1 });
  feather(root, 0, 0, 0, .75, .56, 1.48, dark);
  feather(root, 0, -.23, -.48, .55, .34, .93, light);
  feather(root, 0, .31, -1.14, .47, .46, .53, light);
  feather(root, 0, -.03, -.86, .5, .32, .64, mid);
  for (let i = -2; i <= 2; i++) feather(root, i * .18, -.31, -.76 + Math.abs(i) * .09, .16, .11, .42, light, i * .11);
  const beak = mesh(new THREE.ConeGeometry(.19, .62, 5), gold, root, 0, .12, -1.79); beak.rotation.x = -Math.PI / 2;
  for (let i = -3; i <= 3; i++) {
    const tail = feather(root, i * .18, .04, 1.82 + (3 - Math.abs(i)) * .13, .16, .07, .88, i % 2 ? dark : mid, i * .13);
    tail.rotation.x = -.09;
  }
  const feet = [];
  for (const sign of [-1, 1]) {
    mesh(new THREE.SphereGeometry(.11, 8, 8), light, root, sign * .39, .4, -1.38);
    mesh(new THREE.SphereGeometry(.075, 8, 8), eye, root, sign * .43, .41, -1.4);
    feather(root, sign * .24, -.29, 1.42, .21, .1, .87, mid, sign * .23);
    const footGroup = new THREE.Group(); footGroup.position.set(sign * .33, -.42, .48); root.add(footGroup); feet.push(footGroup);
    const foot = segment(footGroup, [0, 0, 0], [sign * .1, -.32, .16], .065, gold, 5);
    foot.castShadow = false;
    for (let toe = -1; toe <= 1; toe++) segment(footGroup, [sign * .1, -.32, .16], [sign * (.1 + toe * .12), -.37, -.08], .025, gold, 4).castShadow = false;
  }
  const wings = [];
  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sign * .53, .13, -.26); root.add(pivot); wings.push(pivot);
    feather(pivot, sign * 1.24, -.03, .1, 1.57, .13, .56, dark, sign * .14);
    feather(pivot, sign * 1.0, .04, -.18, 1.18, .18, .58, mid, sign * .1);
    for (let i = 0; i < 5; i++) feather(pivot, sign * (.74 + i * .38), .13, -.28 + i * .05, .42, .08, .42, light, sign * .12);
    for (let i = 0; i < 9; i++) {
      const x = sign * (1.55 + i * .17), z = .16 + i * .13;
      feather(pivot, x, -.065, z, .36 - i * .012, .065, .64 + i * .03, i % 2 ? dark : mid, sign * (.15 + i * .04));
    }
  }
  if (small) root.scale.setScalar(species === 'kingfisher' ? .48 : .68);
  root.userData.wings = wings; root.userData.feet = feet;
  return root;
}

export function animateBirdVisual(visual, bird, time) {
  visual.position.set(bird.x, bird.y, bird.z);
  const hunting = bird.goal?.kind === 'fish' || bird.goal?.kind === 'prey';
  visual.rotation.set(-bird.pitch + (hunting ? .17 : 0), -bird.heading, bird.bank, 'YXZ');
  const flap = bird.mode === 'perched' ? .07 + Math.sin(time * 1.4) * .02 : hunting ? .08 + Math.sin(bird.wingPhase * 1.6) * .16 : .12 + Math.sin(bird.wingPhase) * .47;
  visual.userData.wings[0].rotation.z = flap;
  visual.userData.wings[1].rotation.z = -flap;
  visual.userData.wings[0].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.wings[1].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.feet.forEach((foot, i) => { foot.rotation.x = hunting ? -.65 + Math.sin(time * 14 + i) * .06 : 0; });
}
