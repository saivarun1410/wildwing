export const TILE_SIZE = 96;
export const WATER_LEVEL = 0;

export function hash2(x, z, seed = 1) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

export function noise(x, z, seed = 1) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return mix(mix(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), fx),
    mix(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), fx), fz) * 2 - 1;
}

export function terrainHeight(x, z, seed = 1) {
  const rolling = noise(x / 85, z / 85, seed) * 7 + noise(x / 34, z / 34, seed + 9) * 2.6 + noise(x / 12, z / 12, seed + 29) * .75;
  let height = 6 + rolling;
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
  const mountain = Math.max(0, noise(x / 370 + 8, z / 370 - 5, seed + 55) - .2);
  height += mountain * mountain * 68 * Math.min(1, Math.hypot(x, z) / 350);
  const sanctuary = Math.exp(-(x * x + z * z) / (2 * 32 * 32));
  height += sanctuary * Math.max(0, 9 - height);
  return height;
}

export function treeSites(tx, tz, seed = 1) {
  const sites = [];
  for (let i = 0; i < 43; i++) {
    const x = (tx + .04 + hash2(tx * 43 + i, tz * 41, seed + 101) * .92) * TILE_SIZE;
    const z = (tz + .04 + hash2(tx * 37, tz * 47 + i, seed + 102) * .92) * TILE_SIZE;
    const y = terrainHeight(x, z, seed);
    if (y < 1.5 || y > 33 || Math.hypot(x, z) < 12) continue;
    const scale = .72 + hash2(tx * 31 + i, tz * 29, seed + 103) * .8;
    sites.push({ id: `tree:${tx}:${tz}:${i}`, x, y, z, scale, branch: { x: x + scale * 3.9, y: y + scale * 8.2, z: z + scale * 1.5 } });
  }
  return sites;
}

export function fishSites(tx, tz, seed = 1) {
  const sites = [];
  for (let i = 0; i < 11; i++) {
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
    if (y > 1.8 && y < 28) sites.push({ id: `prey:${tx}:${tz}:${i}`, x, y: y + .45, z });
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
