import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, treeSites, fishSites, preySites, homeSite, hash2, noise, greatFallsSite } from './world.js';
import { addLandAnimals, updateLandAnimals, addWaterfalls, updateWaterfalls, sharedAnimalGeometry } from './ecosystem.js';

const color = hex => new THREE.Color(hex);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const dummy = new THREE.Object3D();
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5744, roughness: 1 });
const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x695642, roughness: 1 });
const foliageMaterials = [0x596749, 0x697657, 0x7b805b, 0x4b604d].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
const birchMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b2a0, roughness: 1 });
const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
const canopyPalettes = {
  oak: [0x4d6043, 0x596a48, 0x6e7652, 0x656b45],
  birch: [0x71805b, 0x89916b, 0x697b5e, 0x8d8d65],
  pine: [0x34483f, 0x3b5148, 0x4a5a4e, 0x475446],
  willow: [0x627251, 0x74815c, 0x89906b, 0x687b56]
};

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
  const cloudMap = new THREE.DataTexture(new Uint8Array([112, 172, 216, 255]), 1, 1);
  cloudMap.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: v(-.7, .37, -.45).normalize() }, fogColor: { value: color(0xb4c2c2) }, night: { value: 0 }, cloudMap: { value: cloudMap }, cloudAmount: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection; uniform vec3 fogColor; uniform float night; uniform sampler2D cloudMap; uniform float cloudAmount;
      void main(){ float y=clamp(vDir.y,0.0,1.0); vec3 mid=vec3(.49,.68,.78); vec3 zenith=vec3(.25,.48,.72);
      vec3 c=mix(fogColor,mid,smoothstep(.0,.48,y)); c=mix(c,zenith,smoothstep(.3,1.0,y));
      float u=atan(vDir.z,vDir.x)/6.2831853+.5;
      float latitude=acos(clamp(vDir.y,-1.0,1.0))/3.1415926;
      vec3 first=texture2D(cloudMap,vec2(fract(u),latitude)).rgb;
      vec3 second=texture2D(cloudMap,vec2(fract(u+.5),latitude)).rgb;
      float seamFreeBlend=pow(sin(3.1415926*u),2.0);
      vec3 photograph=mix(second,first,seamFreeBlend);
      float horizonFade=smoothstep(.02,.45,vDir.y)*(1.0-smoothstep(.9,1.0,vDir.y));
      c=mix(c,photograph,cloudAmount*horizonFade);
      float glow=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),14.0);
      float sun=pow(max(dot(normalize(vDir),normalize(sunDirection)),0.0),730.0);
      c+=vec3(1.0,.48,.18)*glow*.35+vec3(1.0,.85,.59)*sun*1.7;
      c=mix(c, mix(vec3(.065,.10,.19),vec3(.012,.025,.075),y),night); gl_FragColor=vec4(c,1.0);}`
  });
  if (typeof document !== 'undefined') {
    new THREE.TextureLoader().load('/sky-wisps.png', texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      material.uniforms.cloudMap.value = texture;
      material.uniforms.cloudAmount.value = 1;
    });
  }
  const sky = new THREE.Mesh(geometry, material); sky.userData.kind = 'sky'; sky.renderOrder = -100; scene.add(sky); return sky;
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
  const stars = new THREE.Points(points, starMaterial); stars.userData.kind = 'stars'; group.add(stars);
  return { group, sun, moon, stars, starMaterial };
}

function makeWaveTexture(seed) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const wave = Math.sin(x * .22 + Math.sin(z * .12) * 1.6) * 30 + Math.sin(z * .34 + x * .07) * 20;
    const grain = (hash2(x, z, seed + 681) - .5) * 27;
    const level = Math.max(0, Math.min(255, 128 + wave + grain));
    const index = (z * size + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = level; pixels[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(50, 50); texture.needsUpdate = true;
  return texture;
}

function terrainTile(tx, tz, seed, consumed, detailed = true) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE, detailed ? 32 : 12, detailed ? 32 : 12);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const sand = color(0xb9a783), grass = color(0x69764f), grass2 = color(0x88895d), high = color(0x8d8e72), rock = color(0x777e7b), snow = color(0xe7e8e2);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + (tx + .5) * TILE_SIZE, z = positions.getZ(i) + (tz + .5) * TILE_SIZE;
    const y = terrainHeight(x, z, seed); positions.setY(i, y);
    const variation = .15 + (noise(x / 31, z / 31, seed + 230) + 1) * .23;
    const dry = Math.max(0, noise(x / 165, z / 165, seed + 231) * .34 + .2);
    let shade;
    if (y < .7) shade = sand.clone().lerp(grass, Math.max(0, y + 1) / 3);
    else if (y < 17) shade = grass.clone().lerp(grass2, Math.min(.85, variation + dry));
    else if (y < 30) shade = grass2.clone().lerp(high, (y - 17) / 13);
    else if (y < 50) shade = high.clone().lerp(rock, Math.min(1, (y - 30) / 20));
    else shade = rock.clone().lerp(snow, Math.min(1, (y - 50) / 21));
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
  const trunkGeometry = new THREE.CylinderGeometry(.31, .53, 1, 8);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const birches = new THREE.InstancedMesh(trunkGeometry, birchMaterial, trees.length);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.08, .18, 1, 6), branchMaterial, trees.length * 6);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), canopyMaterial, trees.length * 18);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.5); leafShape.quadraticCurveTo(.39, -.13, .14, .36); leafShape.lineTo(0, .56);
  leafShape.quadraticCurveTo(-.35, .13, 0, -.5);
  const leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape, 3), leafMaterial, trees.length * 72);
  let trunkCount = 0, birchCount = 0, branchCount = 0, crownCount = 0, leafCount = 0;
  const setBranch = (start, end, radius) => {
    const a = v(...start), b = v(...end), delta = b.clone().sub(a);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(v(0, 1, 0), delta.clone().normalize());
    dummy.scale.set(radius, delta.length(), radius);
    dummy.updateMatrix(); branches.setMatrixAt(branchCount++, dummy.matrix);
  };
  trees.forEach((tree, i) => {
    const s = tree.scale, species = tree.species || 'oak';
    const trunkHeight = s * (species === 'birch' ? 11.5 : species === 'pine' ? 10.5 : species === 'willow' ? 8 : 9.4);
    const stem = species === 'birch' ? birches : trunks;
    setInstance(stem, species === 'birch' ? birchCount++ : trunkCount++, [tree.x, tree.y + trunkHeight * .5, tree.z], [s * (species === 'birch' ? .55 : .95), trunkHeight, s * (species === 'birch' ? .55 : .95)]);
    const start = v(tree.x, tree.y + s * 6.9, tree.z), end = v(tree.branch.x, tree.branch.y, tree.branch.z);
    setBranch([start.x, start.y, start.z], [end.x, end.y, end.z], s * .65);
    const forkCount = species === 'pine' ? 4 : 5;
    for (let j = 0; j < forkCount; j++) {
      const angle = j * 2.399 + hash2(i, j, seed + 251);
      const radius = s * (species === 'birch' ? 1.9 : species === 'pine' ? 2.5 : 3.7);
      const y = tree.y + s * (species === 'willow' ? 7.8 : 8.2) + j * s * .62;
      setBranch([tree.x, tree.y + trunkHeight * (.6 + j * .065), tree.z], [tree.x + Math.cos(angle) * radius, y, tree.z + Math.sin(angle) * radius], s * .32);
    }
    const clusters = species === 'willow' ? 16 : species === 'pine' ? 15 : species === 'birch' ? 11 : 17;
    const spread = species === 'birch' ? 1.85 : species === 'pine' ? 2.45 : species === 'willow' ? 3.4 : 3.7;
    const palette = canopyPalettes[species];
    for (let j = 0; j < clusters; j++) {
      const angle = j * 2.399 + hash2(i, j, seed + 252) * .9;
      const radial = Math.sqrt((j + .5) / clusters) * spread * s;
      const cx = tree.x + Math.cos(angle) * radial;
      const cz = tree.z + Math.sin(angle) * radial;
      const cy = tree.y + s * (species === 'pine' ? 8.2 + j * .42 : species === 'birch' ? 10.2 + hash2(i, j, seed + 253) * 3.4 : species === 'willow' ? 8.2 + hash2(i, j, seed + 253) * 2.2 - radial * .45 / s : 9.1 + hash2(i, j, seed + 253) * 3.6);
      const size = s * (species === 'pine' ? .9 + (1 - j / clusters) * .65 : .9 + hash2(i, j, seed + 254) * .7);
      dummy.position.set(cx, cy, cz);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(size * (species === 'pine' ? 1.7 : 1.2), size * (species === 'pine' ? .57 : .82), size * (species === 'pine' ? 1.3 : 1.05));
      dummy.updateMatrix(); crowns.setMatrixAt(crownCount, dummy.matrix);
      crowns.setColorAt(crownCount++, new THREE.Color(palette[j % palette.length]));
      for (let k = 0; k < 4; k++) {
        const a = angle + k * 1.57 + hash2(i + j, k, seed + 255) * .8;
        const offset = size * (.45 + hash2(i + k, j, seed + 256) * .55);
        dummy.position.set(cx + Math.cos(a) * offset, cy + (hash2(i, j + k, seed + 257) - .5) * size, cz + Math.sin(a) * offset);
        dummy.rotation.set((hash2(i, j + k, seed + 258) - .5) * 2.3, a, (hash2(i + j, k, seed + 259) - .5) * 1.3);
        dummy.scale.set(size * .72, size * .95, size * .72);
        dummy.updateMatrix(); leaves.setMatrixAt(leafCount, dummy.matrix);
        leaves.setColorAt(leafCount++, new THREE.Color(palette[(j + k + 1) % palette.length]));
      }
    }
  });
  for (const [object, count] of [[trunks, trunkCount], [birches, birchCount], [branches, branchCount], [crowns, crownCount], [leaves, leafCount]]) {
    object.count = count; object.instanceMatrix.needsUpdate = true; object.castShadow = object !== leaves && innerWidth > 700; group.add(object);
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
  }
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
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  const grassColors = [0x66734d, 0x7b8057, 0x8d8860, 0x929071];
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(.38, 1, 3), grassMat, 190);
  let grassCount = 0;
  for (let i = 0; i < 190; i++) {
    const x = (tx + hash2(i, tz * 23, seed + 511)) * TILE_SIZE, z = (tz + hash2(tx * 29, i, seed + 512)) * TILE_SIZE;
    const y = terrainHeight(x, z, seed), s = .5 + hash2(i, tx, seed + 513) * 1.2;
    if (y < .5 || y > 28) continue;
    setInstance(grass, grassCount, [x, y + s * .4, z], [s, s, s], hash2(i, tz, seed + 514) * 6);
    grass.setColorAt(grassCount++, new THREE.Color(grassColors[Math.floor(hash2(i, tx + tz, seed + 515) * grassColors.length)]));
  }
  grass.count = grassCount; grass.castShadow = false; if (grass.instanceColor) grass.instanceColor.needsUpdate = true; group.add(grass);
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
  const clump = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.399, radius = 3.1 + hash2(i, 11, 1) * 3.6;
    const tx = x + Math.cos(angle) * radius, tz = z + Math.sin(angle) * radius;
    const ty = y + 11.8 + hash2(i, 12, 1) * 4.2;
    segment(root, [x, y + 9.8 + (i % 4)], [tx, ty, tz], .16 + (i % 3) * .05, branchMaterial);
    for (let j = 0; j < 4; j++) {
      const a = angle + j * 1.57;
      const leaf = mesh(clump, foliageMaterials[(i + j) % foliageMaterials.length], root,
        tx + Math.cos(a) * (j % 2 ? 1.1 : .62), ty + (j % 3) * .64, tz + Math.sin(a) * (j % 2 ? 1.1 : .62));
      leaf.scale.set(1.3 + (j % 2) * .3, .88 + (j % 3) * .12, 1.2);
      leaf.castShadow = false;
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 2.399;
    const crown = mesh(clump, foliageMaterials[(i + 1) % foliageMaterials.length], root, x + Math.cos(a) * 1.5, y + 16.8 + (i % 3) * .7, z + Math.sin(a) * 1.5);
    crown.scale.set(1.5, 1.05, 1.4); crown.castShadow = false;
  }
  const nest = new THREE.Group(); nest.position.set(site.branch.x + 1.25, site.branch.y + .13, site.branch.z + .45); root.add(nest);
  const nestMat = new THREE.MeshStandardMaterial({ color: 0x745638, roughness: 1, side: THREE.DoubleSide });
  const ring = mesh(new THREE.TorusGeometry(1.2, .22, 5, 16), nestMat, nest); ring.rotation.x = Math.PI / 2;
  const base = mesh(new THREE.CylinderGeometry(1.1, .85, .3, 12), nestMat, nest, 0, -.12, 0);
  const stages = [];
  for (let stage = 0; stage < 5; stage++) {
    const bundle = new THREE.Group(); nest.add(bundle); stages.push(bundle);
    for (let j = 0; j < 5; j++) {
      const i = stage * 5 + j, angle = i * 2.399, radius = .55 + (i % 5) * .13;
      const twig = mesh(new THREE.CylinderGeometry(.035, .045, 1.4, 4), nestMat, bundle, Math.cos(angle) * radius, .12 + stage * .035 + (i % 3) * .035, Math.sin(angle) * radius);
      twig.rotation.set(Math.PI / 2, 0, angle);
    }
  }
  nest.visible = false;
  return { root, nest, ring, base, stages, site };
}

function makeGrandFalls(scene, seed) {
  const site = greatFallsSite(seed);
  const root = new THREE.Group(); root.userData.landmark = 'grand-falls'; scene.add(root);
  const ribbons = [];
  function ribbon(x0, x1, centerZ, width, falling, bright = false) {
    const rows = falling ? 36 : 28, columns = 8;
    const vertices = [], colors = [], indices = [];
    const deep = color(bright ? 0xeaf8ec : 0x72b9c2), pale = color(0xf4f8ed);
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
      const t = r / rows, u = c / columns;
      const x = x0 + (x1 - x0) * t;
      const z = centerZ + (u - .5) * width + Math.sin(t * 10 + u * 7) * .35;
      const ground = terrainHeight(x, z, seed);
      const y = Math.max(falling ? .42 : ground + .34, ground + (falling ? .48 : .34)) + Math.sin(t * 22 + u * 13) * .12;
      vertices.push(x, y + (bright ? .23 : 0), z);
      const streak = Math.pow(Math.abs(Math.sin(u * 19 + t * 4)), 7) * .55 + (c === 0 || c === columns ? .22 : 0);
      const shade = deep.clone().lerp(pale, bright ? .68 + streak * .24 : .1 + streak);
      colors.push(shade.r, shade.g, shade.b);
      if (r < rows && c < columns) {
        const a = r * (columns + 1) + c;
        indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .2, metalness: .08, transparent: true, opacity: bright ? .82 : .9, side: THREE.DoubleSide, depthWrite: false });
    const flow = new THREE.Mesh(geometry, material); flow.castShadow = false; root.add(flow); ribbons.push(flow);
  }
  ribbon(site.x - 125, site.x - 5, site.z, site.width * .76, false);
  ribbon(site.x - 5, site.x + 31, site.z, site.width, true);
  for (let i = -2; i <= 2; i++) ribbon(site.x - 4, site.x + 30, site.z + i * 6.4, 1.25 + (i % 2) * .35, true, true);
  const sprayPositions = [];
  for (let i = 0; i < 180; i++) {
    sprayPositions.push(site.x + 18 + (hash2(i, 10, seed) - .5) * 22,
      .5 + hash2(i, 11, seed) * 13,
      site.z + (hash2(i, 12, seed) - .5) * (site.width + 20));
  }
  const sprayGeometry = new THREE.BufferGeometry(); sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sprayPositions, 3));
  const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xeaf5ef, size: 2.2, sizeAttenuation: true, transparent: true, opacity: .65, depthWrite: false }));
  root.add(spray);
  return { root, ribbons, spray, site };
}

function makeHorizonTerrain(tx, tz, seed, innerRadius) {
  const positions = [], colors = [], indices = [];
  const grass = color(0x818967), stone = color(0x898b82), snow = color(0xd8ddd8), seaFloor = color(0x64818a);
  const outerRadius = 10, divisions = 2;
  for (let dx = -outerRadius; dx <= outerRadius; dx++) for (let dz = -outerRadius; dz <= outerRadius; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= innerRadius) continue;
    const first = positions.length / 3;
    for (let iz = 0; iz <= divisions; iz++) for (let ix = 0; ix <= divisions; ix++) {
      const x = (tx + dx + ix / divisions) * TILE_SIZE;
      const z = (tz + dz + iz / divisions) * TILE_SIZE;
      const y = terrainHeight(x, z, seed);
      const shade = y < 0 ? seaFloor : y < 34 ? grass : y < 62 ? grass.clone().lerp(stone, (y - 34) / 28) : stone.clone().lerp(snow, Math.min(1, (y - 62) / 25));
      positions.push(x, y, z); colors.push(shade.r, shade.g, shade.b);
    }
    for (let iz = 0; iz < divisions; iz++) for (let ix = 0; ix < divisions; ix++) {
      const a = first + iz * (divisions + 1) + ix, b = a + 1, c = a + divisions + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const result = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  result.userData.kind = 'horizon-terrain';
  result.frustumCulled = false;
  return result;
}

export function createEnvironment(seed, renderer) {
  const scene = new THREE.Scene(); scene.background = color(0xb4c2c2); scene.fog = new THREE.FogExp2(0xb4c2c2, .0031);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .1, 900);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32;
  const hemi = new THREE.HemisphereLight(0xe4e7dc, 0x666c4b, 2.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd3a2, 2.6); sun.position.set(-75, 150, -105); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -85; sun.shadow.camera.right = 85; sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 380; sun.shadow.bias = -.0003; scene.add(sun, sun.target);
  const sky = makeSky(scene), celestial = makeCelestial(scene, seed);
  const waveTexture = makeWaveTexture(seed);
  const waterGeometry = new THREE.PlaneGeometry(2800, 2800, 96, 96); waterGeometry.rotateX(-Math.PI / 2);
  const water = mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: 0x4a7c8b, metalness: .22, roughness: .21, transparent: true, opacity: .7, clearcoat: .55, bumpMap: waveTexture, bumpScale: .32, side: THREE.DoubleSide, depthWrite: false }), scene, 0, .04, 0);
  water.castShadow = false; water.receiveShadow = true;
  const home = homeSite(seed), homeVisual = makeHome(scene, home), grandFalls = makeGrandFalls(scene, seed);
  const tiles = new Map(), consumed = new Set(), sites = { trees: [], fish: [], prey: [] };
  let centerX = Infinity, centerZ = Infinity, horizonTerrain = null;
  const radius = innerWidth < 700 ? 1 : 2;
  function disposeTile(tile) {
    scene.remove(tile.group);
    tile.group.traverse(obj => { if (obj.geometry && !sharedAnimalGeometry.has(obj.geometry)) obj.geometry.dispose(); if (obj.material && !foliageMaterials.includes(obj.material) && ![trunkMaterial, branchMaterial, birchMaterial, canopyMaterial, leafMaterial].includes(obj.material)) obj.material.dispose(); });
  }
  function refresh(x, z) {
    const tx = Math.floor(x / TILE_SIZE), tz = Math.floor(z / TILE_SIZE);
    if (tx === centerX && tz === centerZ) return;
    centerX = tx; centerZ = tz;
    if (horizonTerrain) { scene.remove(horizonTerrain); horizonTerrain.geometry.dispose(); horizonTerrain.material.dispose(); }
    horizonTerrain = makeHorizonTerrain(tx, tz, seed, radius + 2); scene.add(horizonTerrain);
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
  let lastNestProgress = -1, lastEcology = -1, skyMode = 'cycle';
  function toggleNight() { skyMode = skyMode === 'night' ? 'day' : 'night'; return skyMode === 'night'; }
  function update(bird, time) {
    refresh(bird.x, bird.z);
    sky.position.set(bird.x, bird.y, bird.z);
    celestial.group.position.set(bird.x, bird.y, bird.z);
    const angle = skyMode === 'night' ? Math.PI * 1.5 : skyMode === 'day' ? .55 : .26 + time * .018;
    const elevation = Math.sin(angle);
    const night = Math.max(0, Math.min(1, (.1 - elevation) * 2.2));
    const sunDirection = v(Math.cos(angle), elevation, -.22).normalize();
    celestial.sun.position.copy(sunDirection).multiplyScalar(430);
    celestial.moon.position.copy(sunDirection).multiplyScalar(-430);
    celestial.starMaterial.opacity = night * .9;
    grandFalls.spray.material.opacity = .52 + Math.sin(time * 2.5) * .08;
    grandFalls.ribbons.forEach((ribbon, i) => { ribbon.material.opacity = (i < 2 ? .85 : .75) + Math.sin(time * 2.8 + i) * .045; });
    sky.material.uniforms.sunDirection.value.copy(sunDirection);
    sky.material.uniforms.night.value = night;
    hemi.intensity = 2.1 - night * 1.55;
    sun.intensity = 2.6 - night * 2.42;
    scene.fog.color.copy(color(0xb4c2c2)).lerp(color(0x24334a), night);
    sky.material.uniforms.fogColor.value.copy(scene.fog.color);
    water.position.set(bird.x, .04 + Math.sin(time * 1.2) * .035, bird.z);
    waveTexture.offset.set(time * .004, time * .002);
    sun.position.copy(v(bird.x, bird.y, bird.z)).addScaledVector(sunDirection, 210);
    sun.target.position.set(bird.x, bird.y, bird.z); sun.target.updateMatrixWorld();
    if (time - lastEcology > .065) {
      lastEcology = time;
      for (const tile of tiles.values()) if (tile.detailed) animateWildlife(tile, time, consumed);
    }
    if (bird.nestProgress !== lastNestProgress) {
      homeVisual.nest.visible = bird.nestProgress > 0;
      homeVisual.nest.scale.setScalar(.75 + bird.nestProgress * .05);
      homeVisual.stages.forEach((stage, i) => { stage.visible = i < bird.nestProgress; });
      lastNestProgress = bird.nestProgress;
    }
  }
  return { scene, camera, home, sites, update, refresh, consume, homeVisual, toggleNight };
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
    const outline = [[0, -.48], [.72, -.71], [1.55, -.66], [2.38, -.47], [3.12, -.27], [3.44, .12], [3.1, .43], [2.23, .68], [1.25, .78], [0, .55]];
    const positions = [sign * 1.48, .08, .02];
    outline.forEach(([x, z]) => positions.push(sign * x, .02 + Math.sin(x / 3.5 * Math.PI) * .12, z));
    const indices = [];
    for (let i = 0; i < outline.length; i++) indices.push(0, i + 1, (i + 1) % outline.length + 1);
    const wingGeometry = new THREE.BufferGeometry(); wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); wingGeometry.setIndex(indices); wingGeometry.computeVertexNormals();
    const wing = mesh(wingGeometry, new THREE.MeshStandardMaterial({ color: species === 'kingfisher' ? 0x267c94 : 0x4b372d, roughness: .92, side: THREE.DoubleSide }), pivot);
    wing.castShadow = true;
    for (let i = 0; i < 7; i++) feather(pivot, sign * (.5 + i * .34), .13, -.36 + i * .045, .24, .045, .38, i % 2 ? light : mid, sign * .1);
    const featherShape = new THREE.Shape();
    featherShape.moveTo(-.2, -.48); featherShape.quadraticCurveTo(-.36, .04, 0, .75); featherShape.quadraticCurveTo(.36, .04, .2, -.48);
    const primaryGeometry = new THREE.ShapeGeometry(featherShape, 5); primaryGeometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < 11; i++) {
      const primary = mesh(primaryGeometry, i % 3 ? dark : mid, pivot, sign * (1.15 + i * .22), -.035, .42 + i * .048);
      primary.scale.set(.92 - i * .025, 1, .9 + i * .035);
      primary.rotation.y = sign * (.1 + i * .025);
      primary.castShadow = false;
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
  const strength = bird.flapStrength ?? .3;
  const flap = bird.mode === 'perched' ? .07 + Math.sin(time * 1.4) * .015 : hunting ? .09 + Math.sin(bird.wingPhase) * .08 : .1 + Math.sin(bird.wingPhase) * .45 * strength;
  visual.userData.wings[0].rotation.z = flap;
  visual.userData.wings[1].rotation.z = -flap;
  const delta = visual.userData.lastTime === undefined ? 1 : Math.max(0, Math.min(.05, time - visual.userData.lastTime));
  visual.userData.lastTime = time;
  const fold = bird.mode === 'perched' ? 1.22 : 0;
  visual.userData.wings[0].rotation.y += (fold - visual.userData.wings[0].rotation.y) * Math.min(1, delta * 5);
  visual.userData.wings[1].rotation.y += (-fold - visual.userData.wings[1].rotation.y) * Math.min(1, delta * 5);
  visual.userData.wings[0].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.wings[1].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.feet.forEach((foot, i) => { foot.rotation.x = hunting ? -.65 + Math.sin(time * 14 + i) * .06 : 0; });
}
