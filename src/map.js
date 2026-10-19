import { CITY, greatFallsSite } from './world.js';

export function mapLandmarks(seed) {
  const falls = greatFallsSite(seed);
  return [
    { id: 'city', label: 'City center', x: (CITY.minX + CITY.maxX) / 2, z: (CITY.minZ + CITY.maxZ) / 2, color: '#e9bb88' },
    { id: 'mountains', label: 'Snow mountains', x: 0, z: -590, color: '#e1e7e5' },
    { id: 'ocean', label: 'Ocean coast', x: 730, z: 120, color: '#8ed4db' },
    { id: 'falls', label: 'Great waterfall', x: falls.x, z: falls.z, color: '#badeda' }
  ];
}

export function mapDistance(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export function mapHeading(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}

export function mapBearing(from, to) {
  const heading = mapHeading(from, to);
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[((Math.round(heading / (Math.PI / 8)) % 16) + 16) % 16];
}

export function mapPoint(x, z, center, span, size) {
  return { x: size / 2 + (x - center.x) / span * size, y: size / 2 + (z - center.z) / span * size };
}
