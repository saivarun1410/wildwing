import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapLandmarks, mapDistance, mapHeading, mapBearing, mapPoint } from '../src/map.js';

test('large map gives a useful route to the city from home', () => {
  const places = mapLandmarks(123456);
  const city = places.find(place => place.id === 'city');
  assert.ok(city);
  assert.ok(mapDistance({ x: 0, z: 0 }, city) > 750);
  assert.ok(mapDistance({ x: 0, z: 0 }, city) < 850);
  assert.equal(mapBearing({ x: 0, z: 0 }, city), 'WSW');
  assert.ok(mapHeading({ x: 0, z: 0 }, city) < -Math.PI / 2);
});

test('world-map coordinates retain directions and landmarks at default zoom', () => {
  const size = 720, center = { x: 0, z: 0 }, span = 2400;
  const home = mapPoint(0, 0, center, span, size);
  const city = mapPoint(-740, 320, center, span, size);
  const mountains = mapPoint(0, -590, center, span, size);
  assert.deepEqual(home, { x: 360, y: 360 });
  assert.ok(city.x < home.x && city.y > home.y);
  assert.ok(mountains.y < home.y);
  assert.ok(city.x > 0 && city.y < size);
});
