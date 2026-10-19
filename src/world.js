export const TILE_SIZE = 96;
export const WATER_LEVEL = 0;
export const CITY = { minX: -1020, maxX: -460, minZ: 80, maxZ: 560, street: 80 };

export function hash2(x, z, seed = 1) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));

export function noise(x, z, seed = 1) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return mix(mix(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), fx),
    mix(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), fx), fz) * 2 - 1;
}

export function oceanCoast(z, seed = 1) {
  return 610 + noise(z / 480, 7, seed + 470) * 105 + noise(z / 130, 13, seed + 471) * 54 + noise(z / 58, 23, seed + 472) * 17;
}

export function greatFallsSite(seed = 1) {
  const z = -160;
  return { x: oceanCoast(z, seed) - 38, z, width: 36 };
}

export function mountainFallsSites(seed = 1) {
  return [
    { x: -190 + noise(1, 4, seed + 910) * 24, z: -390 },
    { x: 165 + noise(5, 2, seed + 911) * 30, z: -610 }
  ];
}

export function landscapeAt(x, z, seed = 1, height = terrainHeight(x, z, seed)) {
  if (height < 0) return 'water';
  if (x > CITY.minX && x < CITY.maxX && z > CITY.minZ && z < CITY.maxZ) return 'city';
  if (height > 115) return 'alpine';
  if (z < -235 && height > 36) return 'mountain';
  if (x > oceanCoast(z, seed) - 135) return 'coast';
  if (height < 4.5) return 'wetland';
  const woods = noise(x / 245, z / 245, seed + 620) + noise(x / 92, z / 92, seed + 621) * .35;
  if (woods > .18 || (z > 200 && woods > -.13)) return 'woodland';
  return 'meadow';
}

export function terrainHeight(x, z, seed = 1) {
  const rolling = noise(x / 115, z / 115, seed) * 8.5 + noise(x / 45, z / 45, seed + 9) * 2.5 + noise(x / 12, z / 12, seed + 29) * .75;
  let height = 6 + rolling;
  const southernHills = smooth(clamp01((z - 105) / 240));
  height += southernHills * (8 + noise(x / 210, z / 240, seed + 630) * 10);
  const westernHills = smooth(clamp01((-x - 190) / 290));
  height += westernHills * (5 + noise(x / 180, z / 190, seed + 631) * 8);
  // Repeated watersheds keep exploration useful well beyond the first lake.
  const gx = Math.round((x - 88) / 570), gz = Math.round(z / 570);
  for (let ix = gx - 1; ix <= gx + 1; ix++) {
    for (let iz = gz - 1; iz <= gz + 1; iz++) {
      const cx = ix * 570 + 88 + (ix || iz ? (hash2(ix, iz, seed + 71) - .5) * 160 : 0);
      const cz = iz * 570 + (ix || iz ? (hash2(ix, iz, seed + 72) - .5) * 150 : 0);
      const radius = 82 + hash2(ix, iz, seed + 73) * 37;
      const distance = Math.hypot(x - cx, z - cz);
      const basin = Math.max(0, 1 - distance / radius);
      height -= basin * basin * 31;
    }
  }
  // Smaller scattered basins create ponds between the larger lakes.
  const px = Math.round((x - 64) / 240), pz = Math.round((z - 75) / 240);
  for (let ix = px - 1; ix <= px + 1; ix++) for (let iz = pz - 1; iz <= pz + 1; iz++) {
    if (hash2(ix, iz, seed + 180) < .22) continue;
    const cx = ix * 240 + 64 + (hash2(ix, iz, seed + 181) - .5) * 80;
    const cz = iz * 240 + 75 + (hash2(ix, iz, seed + 182) - .5) * 80;
    const radius = 27 + hash2(ix, iz, seed + 183) * 19;
    const basin = Math.max(0, 1 - Math.hypot(x - cx, z - cz) / radius);
    height -= basin * basin * 21;
  }
  const mountain = Math.max(0, noise(x / 370 + 8, z / 370 - 5, seed + 55) - .2);
  height += mountain * mountain * 68 * Math.min(1, Math.hypot(x, z) / 350);
  const ridgeLine = -505 + noise(x / 290, 3, seed + 811) * 105;
  const ridge = Math.exp(-Math.pow((z - ridgeLine) / 255, 2));
  const outerLine = -1080 + noise(x / 340, 8, seed + 813) * 125;
  const outerRidge = Math.exp(-Math.pow((z - outerLine) / 290, 2));
  const summits = clamp01(.42 + noise(x / 125, z / 155, seed + 812) * .8);
  const northernRise = smooth(clamp01((-z - 180) / 180));
  height += northernRise * (ridge * (44 + summits * 125) + outerRidge * (55 + summits * 145));
  if (z < -320 && z > -675 && x > -270 && x < 250) {
    for (const falls of mountainFallsSites(seed)) {
      const corridor = Math.exp(-Math.pow((x - falls.x) / 36, 4));
      const rise = smooth(clamp01((z - falls.z + 55) / 32));
      const plunge = smooth(clamp01((z - falls.z + 13) / 22));
      height += corridor * (rise * (1 - plunge) * 28 - plunge * 5);
      const pool = clamp01(1 - Math.hypot(x - falls.x, z - falls.z - 27) / 18);
      height -= pool * pool * 7;
    }
  }
  const coast = oceanCoast(z, seed);
  const fallCenter = greatFallsSite(seed);
  const fallBand = Math.exp(-Math.pow((z - fallCenter.z) / 56, 4));
  const rise = smooth(clamp01((x - fallCenter.x + 140) / 105));
  const drop = smooth(clamp01((x - fallCenter.x) / 30));
  height += fallBand * (rise * (1 - drop) * 31 - drop * 27);
  const riverWidth = Math.exp(-Math.pow((z - fallCenter.z) / 25, 4));
  const riverReach = smooth(clamp01((x - fallCenter.x + 175) / 35)) * (1 - smooth(clamp01((x - fallCenter.x + 3) / 38)));
  height -= riverWidth * riverReach * 2.7;
  const offshore = smooth(clamp01((x - coast + 22) / 135));
  height = mix(height, -16 - Math.max(0, x - coast) * .025, offshore);
  const cityDistance = Math.min(x - CITY.minX, CITY.maxX - x, z - CITY.minZ, CITY.maxZ - z);
  height = mix(height, 10, smooth(clamp01((cityDistance + 65) / 95)));
  const sanctuary = Math.exp(-(x * x + z * z) / (2 * 32 * 32));
  height += sanctuary * Math.max(0, 9 - height);
  return height;
}

export function treeSites(tx, tz, seed = 1) {
  const sites = [];
  for (let i = 0; i < 54; i++) {
    const x = (tx + .025 + hash2(tx * 43 + i, tz * 41, seed + 101) * .95) * TILE_SIZE;
    const z = (tz + .025 + hash2(tx * 37, tz * 47 + i, seed + 102) * .95) * TILE_SIZE;
    const y = terrainHeight(x, z, seed);
    if (y < 1.5 || y > 115 || Math.hypot(x, z) < 12) continue;
    const landscape = landscapeAt(x, z, seed, y);
    if (landscape === 'city') continue;
    const grove = noise(x / 125, z / 125, seed + 301);
    const baseDensity = { meadow: .13, woodland: .48, wetland: .24, coast: .09, mountain: .32, alpine: .005 }[landscape] || .12;
    const density = Math.max(.025, Math.min(.66, baseDensity + grove * .18));
    if (hash2(tx * 31 + i, tz * 29, seed + 103) > density) continue;
    if (sites.some(tree => Math.hypot(tree.x - x, tree.z - z) < (landscape === 'woodland' ? 7.6 : 9.2))) continue;
    const nearWater = Math.min(terrainHeight(x + 13, z, seed), terrainHeight(x - 13, z, seed), terrainHeight(x, z + 13, seed), terrainHeight(x, z - 13, seed)) < 2;
    const roll = hash2(tx * 17 + i, tz * 23, seed + 104);
    const species = landscape === 'mountain' || landscape === 'alpine' ? roll < .78 ? 'pine' : 'birch' :
      landscape === 'wetland' ? roll < .7 ? 'willow' : 'birch' :
        landscape === 'coast' ? roll < .6 ? 'pine' : 'oak' :
          nearWater && roll < .52 ? 'willow' : roll < .23 ? 'birch' : roll < .4 ? 'pine' : 'oak';
    const scale = .65 + hash2(tx * 31 + i, tz * 29, seed + 105) * .75;
    const branchHeight = species === 'birch' ? 9.4 : species === 'willow' ? 7.5 : 8.2;
    sites.push({ id: `tree:${tx}:${tz}:${i}`, x, y, z, scale, species, landscape, branch: { x: x + scale * 3.9, y: y + scale * branchHeight, z: z + scale * 1.5 } });
  }
  return sites;
}

export function fishSites(tx, tz, seed = 1) {
  const sites = [];
  if (tx === 0 && tz === 0) sites.push({ id: 'fish:home-lake', x: 88, y: .18, z: 0 });
  for (let i = 0; i < 22; i++) {
    const x = (tx + hash2(tx * 53 + i, tz * 59, seed + 211)) * TILE_SIZE;
    const z = (tz + hash2(tx * 61, tz * 67 + i, seed + 212)) * TILE_SIZE;
    if (terrainHeight(x, z, seed) < -1.8) sites.push({ id: `fish:${tx}:${tz}:${i}`, x, y: .18, z });
  }
  return sites;
}

export function preySites(tx, tz, seed = 1) {
  const sites = [];
  for (let i = 0; i < 12; i++) {
    const x = (tx + hash2(tx * 71 + i, tz * 73, seed + 311)) * TILE_SIZE;
    const z = (tz + hash2(tx * 79, tz * 83 + i, seed + 312)) * TILE_SIZE;
    const y = terrainHeight(x, z, seed);
    if (y > 1.8 && y < 28 && landscapeAt(x, z, seed, y) !== 'city') sites.push({ id: `prey:${tx}:${tz}:${i}`, x, y: y + .45, z });
  }
  return sites;
}

export function homeSite(seed = 1) {
  const y = terrainHeight(0, 0, seed);
  return { id: 'home', x: 0, y, z: 0, scale: 1.65, branch: { x: 6.4, y: y + 13.5, z: 2.5 } };
}

export function nearestSite(origin, sites, maxDistance = Infinity) {
  let best = null, bestDistance = maxDistance;
  for (const site of sites) {
    const position = site.branch || site;
    const distance = Math.hypot(origin.x - position.x, origin.z - position.z);
    if (distance < bestDistance) { bestDistance = distance; best = site; }
  }
  return best;
}
