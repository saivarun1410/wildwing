import * as THREE from 'three';
import { CITY, TILE_SIZE, hash2 } from './world.js';
import { addVegetation } from './foliage.js';

const streetColor = 0x41494a;
const sidewalkColor = 0x999891;
const facadeColors = [0x777f7e, 0x8b8176, 0x697275, 0x9a9184, 0x626a6b];
const vehicleColors = [0x972f2b, 0xc2bbb0, 0x3c5a64, 0x2f383d, 0xb89346, 0x687f69];

function facadeTexture() {
  const width = 64, height = 128, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const windowX = x % 16 > 3 && x % 16 < 13;
    const windowY = y % 20 > 4 && y % 20 < 17;
    const pane = windowX && windowY;
    const lit = ((Math.floor(x / 16) * 11 + Math.floor(y / 20) * 7) % 9) < 3;
    const c = pane ? (lit ? [180, 173, 137] : [39, 66, 72]) : [150, 153, 147];
    const p = (y * width + x) * 4;
    pixels[p] = c[0]; pixels[p + 1] = c[1]; pixels[p + 2] = c[2]; pixels[p + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const windows = facadeTexture();

function box(group, x, y, z, width, height, depth, material, kind) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (kind === 'city-building') {
    const uv = geometry.attributes.uv;
    for (let face = 0; face < 6; face++) {
      const horizontal = face < 2 ? depth : width;
      const uScale = horizontal / 16, vScale = height / 21;
      for (let vertex = 0; vertex < 4; vertex++) {
        const index = face * 4 + vertex;
        uv.setXY(index, uv.getX(index) * uScale, uv.getY(index) * vScale);
      }
    }
    uv.needsUpdate = true;
  }
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = height > 3;
  object.receiveShadow = true;
  if (kind) object.userData.kind = kind;
  group.add(object);
  return object;
}

function clippedStreet(group, axis, coordinate, tx, tz, asphalt, markings) {
  const minX = Math.max(tx * TILE_SIZE, CITY.minX + 28), maxX = Math.min((tx + 1) * TILE_SIZE, CITY.maxX - 28);
  const minZ = Math.max(tz * TILE_SIZE, CITY.minZ + 28), maxZ = Math.min((tz + 1) * TILE_SIZE, CITY.maxZ - 28);
  if (minX >= maxX || minZ >= maxZ) return false;
  if (axis === 'x' && coordinate > minX - 9 && coordinate < maxX + 9) {
    const lo = Math.max(minX, coordinate - 8), hi = Math.min(maxX, coordinate + 8);
    box(group, (lo + hi) / 2, 10.11, (minZ + maxZ) / 2, hi - lo, .16, maxZ - minZ, asphalt, 'city-road');
    for (let z = Math.ceil(minZ / 12) * 12; z < maxZ; z += 12) box(group, coordinate, 10.21, z, .32, .03, 5, markings);
    return true;
  }
  if (axis === 'z' && coordinate > minZ - 9 && coordinate < maxZ + 9) {
    const lo = Math.max(minZ, coordinate - 8), hi = Math.min(maxZ, coordinate + 8);
    box(group, (minX + maxX) / 2, 10.12, (lo + hi) / 2, maxX - minX, .16, hi - lo, asphalt, 'city-road');
    for (let x = Math.ceil(minX / 12) * 12; x < maxX; x += 12) box(group, x, 10.22, coordinate, 5, .03, .32, markings);
    return true;
  }
  return false;
}

function vehicle(group, x, z, i, seed, truck) {
  const root = new THREE.Group(); root.position.set(x, 10.5, z); group.add(root);
  const paint = new THREE.MeshStandardMaterial({ color: vehicleColors[Math.floor(hash2(i, x, seed + 1701) * vehicleColors.length)], roughness: .62, metalness: .26 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x344c53, roughness: .22, metalness: .1 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x202427, roughness: .95 });
  const length = truck ? 7.4 : 3.7;
  box(root, 0, .7, 0, truck ? 2.6 : 2.1, .85, length, paint, truck ? 'truck' : 'car');
  if (truck) {
    box(root, 0, 1.65, -1.55, 2.45, 1.1, 3.9, paint);
    box(root, 0, 1.55, 2.15, 2.2, .95, 2.1, glass);
  } else box(root, 0, 1.3, -.12, 1.75, .65, 2, glass);
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .24, 10), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * (truck ? 1.25 : 1.02), .42, end * length * .3);
    root.add(wheel);
  }
  return root;
}

export function addCity(group, tx, tz, seed, detailed) {
  const tileMinX = tx * TILE_SIZE, tileMinZ = tz * TILE_SIZE;
  const tileMaxX = tileMinX + TILE_SIZE, tileMaxZ = tileMinZ + TILE_SIZE;
  if (tileMaxX < CITY.minX || tileMinX > CITY.maxX || tileMaxZ < CITY.minZ || tileMinZ > CITY.maxZ) return null;
  const asphalt = new THREE.MeshStandardMaterial({ color: streetColor, roughness: .97 });
  const pavement = new THREE.MeshStandardMaterial({ color: sidewalkColor, roughness: 1 });
  const markings = new THREE.MeshBasicMaterial({ color: 0xd8d3b7 });
  const facades = facadeColors.map(tint => new THREE.MeshStandardMaterial({ color: tint, map: windows, emissiveMap: windows, emissive: 0x302c24, emissiveIntensity: .3, roughness: .82, metalness: .04 }));
  const rooftops = facadeColors.map(tint => new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).multiplyScalar(.68), roughness: .96 }));
  for (let n = 1; n <= 6; n++) clippedStreet(group, 'x', CITY.minX + n * CITY.street, tx, tz, asphalt, markings);
  for (let n = 1; n <= 5; n++) clippedStreet(group, 'z', CITY.minZ + n * CITY.street, tx, tz, asphalt, markings);
  for (let ix = 0; ix < 7; ix++) for (let iz = 0; iz < 6; iz++) {
    const cx = CITY.minX + 40 + ix * CITY.street, cz = CITY.minZ + 40 + iz * CITY.street;
    if (cx < tileMinX || cx >= tileMaxX || cz < tileMinZ || cz >= tileMaxZ) continue;
    box(group, cx, 10.09, cz, 65, .15, 65, pavement);
    const park = hash2(ix, iz, seed + 1640) < .12;
    if (park) {
      box(group, cx, 10.23, cz, 54, .11, 54, new THREE.MeshStandardMaterial({ color: 0x5b6b53, roughness: 1 }));
      box(group, cx, 10.3, cz, 3.2, .04, 50, pavement);
      const parkTrees = [];
      for (let treeIndex = 0; treeIndex < 4; treeIndex++) {
        const x = cx + (treeIndex % 2 ? 15 : -15);
        const z = cz + (treeIndex < 2 ? -15 : 15);
        parkTrees.push({ id: `park:${ix}:${iz}:${treeIndex}`, x, y: 10.29, z,
          scale: .72 + hash2(ix * 4 + treeIndex, iz, seed + 1680) * .26,
          species: treeIndex % 2 ? 'birch' : 'oak' });
      }
      addVegetation(group, parkTrees, seed);
      continue;
    }
    const tower = hash2(ix, iz, seed + 1641) > .56;
    const count = tower ? 1 : 2;
    for (let b = 0; b < count; b++) {
      const px = cx + (count === 2 ? (b ? 15 : -15) : 0);
      const pz = cz + (hash2(ix + b, iz, seed + 1642) - .5) * 11;
      const width = count === 2 ? 22 : 35 + hash2(ix, iz, seed + 1643) * 14;
      const depth = count === 2 ? 29 : 34 + hash2(ix, iz, seed + 1644) * 13;
      const height = tower ? 31 + hash2(ix, iz, seed + 1645) * 95 : 13 + hash2(ix + b, iz, seed + 1646) * 31;
      const style = Math.floor(hash2(ix * 5 + b, iz, seed + 1647) * facades.length);
      box(group, px, 10.2 + height / 2, pz, width, height, depth, [facades[style], facades[style], rooftops[style], rooftops[style], facades[style], facades[style]], 'city-building');
      box(group, px + width * .16, 10.3 + height + 1.2, pz - depth * .13, width * .25, 2.4, depth * .22, rooftops[style]);
    }
  }
  const vehicles = [];
  if (detailed) {
    for (let i = 0; i < 3; i++) {
      const vertical = i !== 1;
      const roadIndex = vertical ? 1 + Math.floor(hash2(tx + i, tz, seed + 1650) * 6) : 1 + Math.floor(hash2(tx, tz + i, seed + 1651) * 5);
      const road = vertical ? CITY.minX + roadIndex * CITY.street : CITY.minZ + roadIndex * CITY.street;
      if (vertical && (road < tileMinX || road >= tileMaxX)) continue;
      if (!vertical && (road < tileMinZ || road >= tileMaxZ)) continue;
      const lane = i % 2 ? 2.8 : -2.8;
      const x = vertical ? road + lane : tileMinX + 10;
      const z = vertical ? tileMinZ + 10 : road + lane;
      const truck = i === 2 && hash2(tx, tz, seed + 1652) > .35;
      const root = vehicle(group, x, z, i, seed, truck);
      if (!vertical) root.rotation.y = Math.PI / 2;
      vehicles.push({ root, vertical, road, lane, from: vertical ? tileMinZ : tileMinX, span: TILE_SIZE, phase: hash2(tx * 3 + i, tz, seed + 1653), speed: truck ? 8 : 12 + hash2(i, tz, seed + 1654) * 8 });
    }
  }
  return { vehicles };
}

export function updateCity(city, time) {
  if (!city) return;
  for (const vehicle of city.vehicles) {
    const distance = (vehicle.phase * vehicle.span + time * vehicle.speed) % vehicle.span;
    if (vehicle.vertical) vehicle.root.position.set(vehicle.road + vehicle.lane, 10.5, vehicle.from + distance);
    else vehicle.root.position.set(vehicle.from + distance, 10.5, vehicle.road + vehicle.lane);
  }
}
