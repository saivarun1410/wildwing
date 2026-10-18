import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, treeSites, fishSites, preySites, homeSite, hash2 } from './world.js';

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
    uniforms: { sunDirection: { value: v(-.7, .37, -.45).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection;
      void main(){ float y=clamp(vDir.y,0.0,1.0); vec3 horizon=vec3(.86,.78,.65); vec3 mid=vec3(.53,.68,.74); vec3 zenith=vec3(.22,.41,.59);
      vec3 c=mix(horizon,mid,smoothstep(.01,.35,y)); c=mix(c,zenith,smoothstep(.28,.96,y));
      float glow=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),14.0);
      float sun=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),730.0);
      c+=vec3(1.0,.48,.18)*glow*.35+vec3(1.0,.85,.59)*sun*1.7; gl_FragColor=vec4(c,1.0);}`
  });
  const sky = new THREE.Mesh(geometry, material); sky.renderOrder = -100; scene.add(sky); return sky;
}

function makeClouds(scene, seed) {
  const group = new THREE.Group(); scene.add(group);
  const material = new THREE.MeshLambertMaterial({ color: 0xf4eee3, transparent: true, opacity: .45, depthWrite: false });
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 33; i++) {
    const cx = (hash2(i, 4, seed) - .5) * 760, cz = (hash2(i, 7, seed) - .5) * 760;
    const cy = 75 + hash2(i, 8, seed) * 80;
    const cloud = new THREE.Group(); cloud.position.set(cx, cy, cz); group.add(cloud);
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(geometry, material);
      puff.position.set((j - 1) * 10, (j % 2) * 2, (j - 1) * 2);
      puff.scale.set(12 + hash2(i, j, seed + 33) * 13, 2.8 + hash2(i, j, seed + 34) * 3, 5 + hash2(i, j, seed + 35) * 3);
      cloud.add(puff);
    }
  }
  return group;
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
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const canopies = foliageMaterials.map(mat => new THREE.InstancedMesh(canopyGeometry, mat, trees.length * 3));
  const branchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .21, 1, 6), branchMaterial, trees.length);
  branchMesh.castShadow = true;
  const counts = [0, 0, 0, 0];
  trees.forEach((tree, i) => {
    const s = tree.scale, trunkHeight = s * 8;
    setInstance(trunks, i, [tree.x, tree.y + trunkHeight * .5, tree.z], [s, trunkHeight, s], hash2(i, tx, seed) * .4);
    const start = v(tree.x, tree.y + s * 6.9, tree.z), end = v(tree.branch.x, tree.branch.y, tree.branch.z), dir = end.clone().sub(start);
    dummy.position.copy(start).add(end).multiplyScalar(.5); dummy.quaternion.setFromUnitVectors(v(0, 1, 0), dir.clone().normalize()); dummy.scale.set(s, dir.length(), s); dummy.updateMatrix(); branchMesh.setMatrixAt(i, dummy.matrix); dummy.quaternion.identity();
    for (let j = 0; j < 3; j++) {
      const type = Math.floor(hash2(i * 3 + j, tz, seed + 200) * 4), index = counts[type]++;
      const ox = (j - 1) * s * 2.4, oz = (j % 2 ? 1 : -1) * s * 1.4;
      setInstance(canopies[type], index, [tree.x + ox, tree.y + s * (8.9 + (j % 2)), tree.z + oz], [s * 3.3, s * 2.5, s * 2.9], hash2(i, j, seed) * 6);
    }
  });
  group.add(trunks, branchMesh);
  canopies.forEach((canopy, i) => { canopy.count = counts[i]; canopy.instanceMatrix.needsUpdate = true; canopy.castShadow = innerWidth > 700; group.add(canopy); });
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
  const sky = makeSky(scene), clouds = makeClouds(scene, seed);
  const waterGeometry = new THREE.PlaneGeometry(1400, 1400, 48, 48); waterGeometry.rotateX(-Math.PI / 2);
  const water = mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: 0x467f8b, metalness: .42, roughness: .22, transparent: true, opacity: .83, clearcoat: .6, side: THREE.DoubleSide, depthWrite: false }), scene, 0, .04, 0);
  water.castShadow = false; water.receiveShadow = true;
  const home = homeSite(seed), homeVisual = makeHome(scene, home);
  const tiles = new Map(), consumed = new Set(), sites = { trees: [], fish: [], prey: [] };
  let centerX = Infinity, centerZ = Infinity;
  const radius = innerWidth < 700 ? 1 : 2;
  function disposeTile(tile) {
    scene.remove(tile.group);
    tile.group.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material && !foliageMaterials.includes(obj.material) && obj.material !== trunkMaterial && obj.material !== branchMaterial) obj.material.dispose(); });
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
  let lastNestProgress = -1;
  function update(bird, time) {
    refresh(bird.x, bird.z);
    sky.position.set(bird.x, bird.y, bird.z);
    clouds.position.set(bird.x + Math.sin(time * .018) * 30, 0, bird.z);
    water.position.set(bird.x, .04 + Math.sin(time * 1.2) * .035, bird.z);
    sun.position.set(bird.x - 75, bird.y + 150, bird.z - 105);
    sun.target.position.set(bird.x, bird.y, bird.z); sun.target.updateMatrixWorld();
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
  const beak = mesh(new THREE.ConeGeometry(.19, .62, 5), gold, root, 0, .12, -1.79); beak.rotation.x = -Math.PI / 2;
  for (const sign of [-1, 1]) {
    const eyeball = mesh(new THREE.SphereGeometry(.085, 8, 8), eye, root, sign * .39, .4, -1.38);
    feather(root, sign * .24, -.29, 1.42, .21, .1, .87, mid, sign * .23);
    const foot = segment(root, [sign * .33, -.42, .48], [sign * .43, -.74, .64], .065, gold, 5);
    foot.castShadow = false;
    for (let toe = -1; toe <= 1; toe++) segment(root, [sign * .43, -.74, .64], [sign * (.43 + toe * .12), -.79, .4], .025, gold, 4).castShadow = false;
  }
  const wings = [];
  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sign * .53, .13, -.26); root.add(pivot); wings.push(pivot);
    feather(pivot, sign * 1.24, -.03, .1, 1.57, .13, .56, dark, sign * .14);
    feather(pivot, sign * 1.0, .04, -.18, 1.18, .18, .58, mid, sign * .1);
    for (let i = 0; i < 9; i++) {
      const x = sign * (1.55 + i * .17), z = .16 + i * .13;
      feather(pivot, x, -.065, z, .36 - i * .012, .065, .64 + i * .03, i % 2 ? dark : mid, sign * (.15 + i * .04));
    }
  }
  if (small) root.scale.setScalar(species === 'kingfisher' ? .48 : .68);
  root.userData.wings = wings;
  return root;
}

export function animateBirdVisual(visual, bird, time) {
  visual.position.set(bird.x, bird.y, bird.z);
  visual.rotation.set(-bird.pitch, -bird.heading, bird.bank, 'YXZ');
  const flap = bird.mode === 'perched' ? .07 + Math.sin(time * 1.4) * .02 : .12 + Math.sin(bird.wingPhase) * .47;
  visual.userData.wings[0].rotation.z = flap;
  visual.userData.wings[1].rotation.z = -flap;
  visual.userData.wings[0].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.wings[1].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
}
