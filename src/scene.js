import * as THREE from 'three';
import { TILE_SIZE, terrainHeight, landscapeAt, treeSites, fishSites, preySites, homeSite, hash2, noise, greatFallsSite } from './world.js';
import { addLandAnimals, updateLandAnimals, addWaterfalls, updateWaterfalls, sharedAnimalGeometry } from './ecosystem.js';
import { addCity, updateCity } from './city.js';
import { addVegetation, addGroundDetail, sharedFoliageMaterials, sharedFoliageGeometries } from './foliage.js';
import { birdType } from './birds.js';
import { createWeatherEffects, weatherType, WEATHER_TYPES, roundParticleTexture } from './weather.js';

const color = hex => new THREE.Color(hex);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const dummy = new THREE.Object3D();
const groundPalettes = {
  meadow: [0x66744f, 0x989166], woodland: [0x526b50, 0x78815b],
  wetland: [0x577265, 0x849879], coast: [0x95916d, 0xb5a378],
  mountain: [0x63735b, 0x8a8e72], alpine: [0x818b83, 0xa9ada5], city: [0x787b74, 0x8e9089]
};

function terrainShade(x, z, y, seed) {
  if (y < 0) return color(0x6d8990);
  const landscape = landscapeAt(x, z, seed, y);
  const palette = groundPalettes[landscape] || groundPalettes.meadow;
  const mottling = .42 + noise(x / 72, z / 72, seed + 230) * .25 + noise(x / 18, z / 18, seed + 231) * .11;
  const shade = color(palette[0]).lerp(color(palette[1]), Math.max(.06, Math.min(.9, mottling)));
  if (y < 2.3 && landscape !== 'mountain') shade.lerp(color(0xc0b184), Math.max(0, 1 - y / 2.3) * .75);
  if (y > 47) shade.lerp(color(0x777e7b), Math.min(1, (y - 47) / 74));
  if (y > 108) shade.lerp(color(0xe0e4e0), Math.min(1, (y - 108) / 72));
  return shade;
}

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
    uniforms: { sunDirection: { value: v(-.7, .37, -.45).normalize() }, fogColor: { value: color(0xb4c2c2) }, night: { value: 0 }, cloudMap: { value: cloudMap }, cloudAmount: { value: 0 }, weatherColor: { value: color(0xb4c2c2) }, cloudCover: { value: 0 }, flash: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDirection; uniform vec3 fogColor; uniform float night; uniform sampler2D cloudMap; uniform float cloudAmount; uniform vec3 weatherColor; uniform float cloudCover; uniform float flash;
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
      c=mix(c, mix(vec3(.065,.10,.19),vec3(.012,.025,.075),y),night);
      vec3 overcast=mix(weatherColor,vec3(.055,.075,.105),night);
      c=mix(c,overcast,cloudCover*(.72+.22*smoothstep(.05,.8,y)));
      c+=vec3(.55,.66,.8)*flash*.75; gl_FragColor=vec4(c,1.0);}`
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
  const starMaterial = new THREE.PointsMaterial({ color: 0xf2f4ff, map: roundParticleTexture(), size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
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
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + (tx + .5) * TILE_SIZE, z = positions.getZ(i) + (tz + .5) * TILE_SIZE;
    const y = terrainHeight(x, z, seed); positions.setY(i, y);
    const shade = terrainShade(x, z, y, seed);
    colors.push(shade.r, shade.g, shade.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const land = mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, side: THREE.DoubleSide }), group,
    (tx + .5) * TILE_SIZE, 0, (tz + .5) * TILE_SIZE);
  land.castShadow = false;
  const trees = detailed ? treeSites(tx, tz, seed) : [], fish = detailed ? fishSites(tx, tz, seed) : [], prey = detailed ? preySites(tx, tz, seed) : [];
  let wildlife = null;
  const city = addCity(group, tx, tz, seed, detailed);
  if (detailed) {
    addVegetation(group, trees, seed);
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
  return { group, trees, fish, prey, wildlife, city, consumed, detailed };
}

function setInstance(instanced, i, position, scale, rotation = 0) {
  dummy.position.set(...position); dummy.scale.set(...scale); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); instanced.setMatrixAt(i, dummy.matrix);
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
  updateCity(tile.city, time);
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

function makeHome(scene, site, seed) {
  const root = new THREE.Group(); scene.add(root);
  addVegetation(root, [{ ...site, species: 'oak' }], seed);
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
    const deep = color(bright ? 0xa9c7c8 : 0x6d9ba2), pale = color(0xdde9e5);
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
      const t = r / rows, u = c / columns;
      const x = x0 + (x1 - x0) * t;
      const z = centerZ + (u - .5) * width * (1 + t * .09) + Math.sin(t * 10 + u * 7) * .48;
      const ground = terrainHeight(x, z, seed);
      const y = Math.max(falling ? .42 : ground + .34, ground + (falling ? .48 : .34)) + Math.sin(t * 22 + u * 13) * .12;
      vertices.push(x, y + (bright ? .23 : 0), z);
      const streak = Math.pow(Math.abs(Math.sin(u * 19 + t * 4)), 7) * .55 + (c === 0 || c === columns ? .22 : 0);
      const shade = deep.clone().lerp(pale, bright ? .28 + streak * .35 : .08 + streak * .6);
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
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .32, metalness: .04, transparent: true, opacity: bright ? .57 : .78, side: THREE.DoubleSide, depthWrite: false });
    const flow = new THREE.Mesh(geometry, material); flow.castShadow = false; root.add(flow); ribbons.push(flow);
  }
  ribbon(site.x - 125, site.x - 5, site.z, site.width * .76, false);
  ribbon(site.x - 5, site.x + 31, site.z, site.width, true);
  for (let i = -1; i <= 1; i++) ribbon(site.x - 4, site.x + 30, site.z + i * 9.2, 1.1 + (i === 0 ? .35 : 0), true, true);
  const sprayPositions = [];
  for (let i = 0; i < 180; i++) {
    sprayPositions.push(site.x + 18 + (hash2(i, 10, seed) - .5) * 22,
      .5 + hash2(i, 11, seed) * 13,
      site.z + (hash2(i, 12, seed) - .5) * (site.width + 20));
  }
  const sprayGeometry = new THREE.BufferGeometry(); sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sprayPositions, 3));
  const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: 0xdfeae7, map: roundParticleTexture(), size: 1.1, sizeAttenuation: true, transparent: true, opacity: .4, depthWrite: false }));
  root.add(spray);
  return { root, ribbons, spray, site };
}

function makeHorizonTerrain(tx, tz, seed, innerRadius) {
  const positions = [], colors = [], indices = [];
  const outerRadius = 10, divisions = 2;
  for (let dx = -outerRadius; dx <= outerRadius; dx++) for (let dz = -outerRadius; dz <= outerRadius; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= innerRadius) continue;
    const first = positions.length / 3;
    for (let iz = 0; iz <= divisions; iz++) for (let ix = 0; ix <= divisions; ix++) {
      const x = (tx + dx + ix / divisions) * TILE_SIZE;
      const z = (tz + dz + iz / divisions) * TILE_SIZE;
      const y = terrainHeight(x, z, seed);
      const shade = terrainShade(x, z, y, seed);
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
  const sky = makeSky(scene), celestial = makeCelestial(scene, seed), weatherEffects = createWeatherEffects(scene, seed);
  const waveTexture = makeWaveTexture(seed);
  const waterGeometry = new THREE.PlaneGeometry(2800, 2800, 96, 96); waterGeometry.rotateX(-Math.PI / 2);
  const water = mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: 0x4a7c8b, metalness: .22, roughness: .21, transparent: true, opacity: .7, clearcoat: .55, bumpMap: waveTexture, bumpScale: .32, side: THREE.DoubleSide, depthWrite: false }), scene, 0, .04, 0);
  water.castShadow = false; water.receiveShadow = true;
  const home = homeSite(seed), homeVisual = makeHome(scene, home, seed), grandFalls = makeGrandFalls(scene, seed);
  const tiles = new Map(), consumed = new Set(), sites = { trees: [], fish: [], prey: [] };
  let centerX = Infinity, centerZ = Infinity, horizonTerrain = null;
  const radius = innerWidth < 700 ? 1 : 2;
  function disposeTile(tile) {
    scene.remove(tile.group);
    tile.group.traverse(obj => {
      if (obj.geometry && !sharedAnimalGeometry.has(obj.geometry) && !sharedFoliageGeometries.has(obj.geometry)) obj.geometry.dispose();
      for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
        if (material && !sharedFoliageMaterials.has(material)) material.dispose();
      }
    });
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
  let lastNestProgress = -1, lastEcology = -1, skyMode = 'cycle', nightLevel = 0, weatherKind = 'pleasant';
  function toggleNight() { skyMode = nightLevel > .5 ? 'day' : 'night'; nightLevel = skyMode === 'night' ? 1 : 0; return skyMode === 'night'; }
  function isNight() { return nightLevel > .5; }
  function setWeather(kind) { weatherKind = WEATHER_TYPES[kind] ? kind : 'pleasant'; return weatherKind; }
  function getWeather() { return weatherKind; }
  function update(bird, time) {
    refresh(bird.x, bird.z);
    sky.position.set(bird.x, bird.y, bird.z);
    celestial.group.position.set(bird.x, bird.y, bird.z);
    const angle = skyMode === 'night' ? Math.PI * 1.5 : skyMode === 'day' ? .55 : .26 + time * .018;
    const elevation = Math.sin(angle);
    const night = Math.max(0, Math.min(1, (.1 - elevation) * 2.2));
    nightLevel = night;
    const sunDirection = v(Math.cos(angle), elevation, -.22).normalize();
    celestial.sun.position.copy(sunDirection).multiplyScalar(430);
    celestial.moon.position.copy(sunDirection).multiplyScalar(-430);
    const conditions = weatherType(weatherKind);
    const flash = weatherEffects.update(weatherKind, bird, camera, time);
    celestial.starMaterial.opacity = night * .9 * (1 - conditions.clouds);
    celestial.sun.visible = conditions.clouds < .8 && night < .9;
    celestial.moon.visible = night > .2 && conditions.clouds < .8;
    grandFalls.spray.material.opacity = .37 + Math.sin(time * 2.5) * .04;
    grandFalls.ribbons.forEach((ribbon, i) => { ribbon.material.opacity = (i < 2 ? .77 : .55) + Math.sin(time * 2.8 + i) * .025; });
    sky.material.uniforms.sunDirection.value.copy(sunDirection);
    sky.material.uniforms.night.value = night;
    sky.material.uniforms.weatherColor.value.setHex(conditions.fog);
    sky.material.uniforms.cloudCover.value = conditions.clouds;
    sky.material.uniforms.flash.value = flash;
    hemi.intensity = (2.1 - night * 1.55) * conditions.light + flash * 2.2;
    sun.intensity = (2.6 - night * 2.42) * conditions.light + flash * 3;
    scene.fog.color.copy(color(conditions.fog)).lerp(color(0x24334a), night);
    scene.fog.density = conditions.density;
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
  return { scene, camera, home, sites, update, refresh, consume, homeVisual, toggleNight, isNight, setWeather, getWeather };
}

function feather(parent, x, y, z, sx, sy, sz, material, tilt = 0) {
  const f = mesh(new THREE.SphereGeometry(1, 7, 5), material, parent, x, y, z);
  f.scale.set(sx, sy, sz); f.rotation.y = tilt; return f;
}

export function createBirdVisual({ small = false, species = 'eagle' } = {}) {
  const profile = birdType(species);
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: profile.dark, roughness: .88 });
  const mid = new THREE.MeshStandardMaterial({ color: profile.mid, roughness: .86 });
  const light = new THREE.MeshStandardMaterial({ color: profile.light, roughness: .9 });
  const gold = new THREE.MeshStandardMaterial({ color: profile.beak, roughness: .7 });
  const eye = new THREE.MeshPhysicalMaterial({ color: 0x111716, roughness: .1, clearcoat: 1 });
  feather(root, 0, 0, 0, .75 * profile.body, .56 * profile.body, 1.48, dark);
  feather(root, 0, -.23, -.48, .55 * profile.body, .34, .93, light);
  feather(root, 0, .31, -1.14, .47, .46, .53, light);
  feather(root, 0, -.03, -.86, .5, .32, .64, mid);
  for (let i = -2; i <= 2; i++) feather(root, i * .18, -.31, -.76 + Math.abs(i) * .09, .16, .11, .42, light, i * .11);
  const beak = mesh(new THREE.ConeGeometry(species === 'kingfisher' ? .12 : .19, .62 * profile.beakLength, 7), gold, root, 0, .12, -1.79 - .19 * (profile.beakLength - 1)); beak.rotation.x = -Math.PI / 2;
  for (let i = -3; i <= 3; i++) {
    const tail = feather(root, i * .18, .04, 1.82 + (3 - Math.abs(i)) * .13 * profile.tail, .16, .07, .88 * profile.tail, i % 2 ? dark : mid, i * .13);
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
    const pivot = new THREE.Group(); pivot.position.set(sign * .53 * profile.body, .13, -.26); pivot.scale.x = profile.wingSpan; root.add(pivot); wings.push(pivot);
    const outline = [[0, -.48], [.72, -.71], [1.55, -.66], [2.38, -.47], [3.12, -.27], [3.44, .12], [3.1, .43], [2.23, .68], [1.25, .78], [0, .55]];
    const positions = [sign * 1.48, .08, .02];
    outline.forEach(([x, z]) => positions.push(sign * x, .02 + Math.sin(x / 3.5 * Math.PI) * .12, z));
    const indices = [];
    for (let i = 0; i < outline.length; i++) indices.push(0, i + 1, (i + 1) % outline.length + 1);
    const wingGeometry = new THREE.BufferGeometry(); wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); wingGeometry.setIndex(indices); wingGeometry.computeVertexNormals();
    const wing = mesh(wingGeometry, new THREE.MeshStandardMaterial({ color: profile.wing, roughness: .92, side: THREE.DoubleSide }), pivot);
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
  if (species === 'owl') {
    const face = new THREE.MeshStandardMaterial({ color: 0xd7c6a5, roughness: 1 });
    for (const sign of [-1, 1]) {
      feather(root, sign * .24, .42, -1.38, .3, .31, .12, face);
      feather(root, sign * .25, .44, -1.51, .085, .095, .055, eye);
      feather(root, sign * .4, .8, -1.12, .13, .26, .12, dark, sign * .3);
    }
  }
  if (species === 'falcon') {
    for (const sign of [-1, 1]) feather(root, sign * .43, .18, -1.37, .11, .3, .13, dark, sign * .17);
  }
  root.scale.setScalar(profile.scale * (small ? .68 : 1));
  root.userData.wings = wings; root.userData.feet = feet; root.userData.species = species;
  return root;
}

export function animateBirdVisual(visual, bird, time) {
  visual.position.set(bird.x, bird.y, bird.z);
  const hunting = bird.goal?.kind === 'fish' || bird.goal?.kind === 'prey';
  const landing = (bird.goal?.kind === 'perch' || bird.goal?.kind === 'nest') && bird.goal.stage === 'final';
  visual.rotation.set(bird.pitch + (hunting ? -.08 : 0), -bird.heading, bird.bank, 'YXZ');
  const strength = bird.flapStrength ?? .3;
  const flapRate = birdType(visual.userData.species).flapRate;
  const flap = bird.mode === 'perched' ? .07 + Math.sin(time * 1.4) * .015 : hunting || landing ? .08 + Math.sin(bird.wingPhase * flapRate) * .07 : .1 + Math.sin(bird.wingPhase * flapRate) * .45 * strength;
  visual.userData.wings[0].rotation.z = flap;
  visual.userData.wings[1].rotation.z = -flap;
  const delta = visual.userData.lastTime === undefined ? 1 : Math.max(0, Math.min(.05, time - visual.userData.lastTime));
  visual.userData.lastTime = time;
  const fold = bird.mode === 'perched' ? 1.22 : 0;
  visual.userData.wings[0].rotation.y += (fold - visual.userData.wings[0].rotation.y) * Math.min(1, delta * 5);
  visual.userData.wings[1].rotation.y += (-fold - visual.userData.wings[1].rotation.y) * Math.min(1, delta * 5);
  visual.userData.wings[0].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.wings[1].rotation.x = Math.sin(bird.wingPhase * .5) * .05;
  visual.userData.feet.forEach((foot, i) => { foot.rotation.x = hunting || landing ? -.65 + Math.sin(time * 14 + i) * .06 : 0; });
}
