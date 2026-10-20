import * as THREE from 'three';
import { hash2 } from './world.js';

export const WEATHER_TYPES = Object.freeze({
  pleasant: { label: 'Pleasant', fog: 0xb4c2c2, density: .0031, clouds: 0, light: 1, rain: 0, snow: 0 },
  sunny: { label: 'Sunny', fog: 0xc4c9bd, density: .0025, clouds: 0, light: 1.13, rain: 0, snow: 0 },
  cloudy: { label: 'Cloudy', fog: 0x9da8aa, density: .0045, clouds: .65, light: .72, rain: 0, snow: 0 },
  rainy: { label: 'Rainy', fog: 0x8799a1, density: .006, clouds: .82, light: .56, rain: 450, snow: 0 },
  snowy: { label: 'Snowy', fog: 0xc0cbd0, density: .0065, clouds: .73, light: .82, rain: 0, snow: 320 },
  stormy: { label: 'Stormy', fog: 0x576873, density: .009, clouds: 1, light: .35, rain: 750, snow: 0 },
  misty: { label: 'Misty', fog: 0xb7c2bb, density: .011, clouds: .48, light: .65, rain: 0, snow: 0 }
});

export const weatherIds = Object.keys(WEATHER_TYPES);
export const weatherType = id => WEATHER_TYPES[id] || WEATHER_TYPES.pleasant;

export function createWeatherEffects(scene, seed) {
  const rainCount = 750, snowCount = 320;
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rainCount * 6), 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xb7cfdb, transparent: true, opacity: .52, depthWrite: false, fog: true }));
  rain.frustumCulled = false; rain.visible = false; rain.userData.kind = 'weather-rain'; scene.add(rain);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(snowCount * 3), 3));
  const snow = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: 0xf5f8f6, size: .48, sizeAttenuation: true, transparent: true, opacity: .88, depthWrite: false, fog: true }));
  snow.frustumCulled = false; snow.visible = false; snow.userData.kind = 'weather-snow'; scene.add(snow);

  function update(kind, bird, time) {
    const preset = weatherType(kind);
    rain.visible = preset.rain > 0;
    snow.visible = preset.snow > 0;
    if (rain.visible) {
      rain.position.set(bird.x, bird.y, bird.z);
      const points = rainGeometry.attributes.position;
      for (let i = 0; i < preset.rain; i++) {
        const drift = kind === 'stormy' ? 14 : 4;
        const fall = ((hash2(i, 1, seed + 2200) * 80 - time * (kind === 'stormy' ? 52 : 39)) % 80 + 80) % 80 - 25;
        const x = ((hash2(i, 2, seed + 2201) * 110 + time * drift) % 110 + 110) % 110 - 55;
        const z = (hash2(i, 3, seed + 2202) - .5) * 110;
        points.setXYZ(i * 2, x, fall, z);
        points.setXYZ(i * 2 + 1, x + (kind === 'stormy' ? 1.7 : .4), fall - (kind === 'stormy' ? 3.2 : 2.1), z);
      }
      rainGeometry.setDrawRange(0, preset.rain * 2);
      points.needsUpdate = true;
    }
    if (snow.visible) {
      snow.position.set(bird.x, bird.y, bird.z);
      const points = snowGeometry.attributes.position;
      for (let i = 0; i < preset.snow; i++) {
        const fall = ((hash2(i, 4, seed + 2203) * 65 - time * 3.7) % 65 + 65) % 65 - 22;
        const x = (hash2(i, 5, seed + 2204) - .5) * 95 + Math.sin(time * .7 + i) * 2.2;
        const z = (hash2(i, 6, seed + 2205) - .5) * 95;
        points.setXYZ(i, x, fall, z);
      }
      points.needsUpdate = true;
    }
    const strike = kind === 'stormy' ? time % 18 : 99;
    return strike < .18 ? 1 - strike / .18 : 0;
  }

  return { rain, snow, update };
}
