import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function createElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    textContent: '',
    attributes: {},
    listeners,
    classList: { add: (name) => classes.add(name), contains: (name) => classes.has(name) },
    addEventListener: (name, fn) => listeners.set(name, fn),
    setAttribute(name, value) { this.attributes[name] = value; },
    click() { listeners.get('click')?.({}); }
  };
}

function createHarness(url) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createElement());
    return elements.get(selector);
  };
  const gradient = { addColorStop() {} };
  const ctx = {};
  for (const method of ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'save', 'restore', 'setTransform', 'translate', 'rotate', 'ellipse', 'setLineDash']) ctx[method] = () => {};
  ctx.createLinearGradient = () => gradient;
  ctx.createRadialGradient = () => gradient;
  const canvas = element('#world');
  canvas.getContext = () => ctx;
  const stored = new Map();
  const location = new URL(url);
  const sandbox = {
    document: { querySelector: element, createElement: () => createElement() },
    location,
    history: { replaceState: (_state, _title, next) => { location.href = String(next); } },
    localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    navigator: { clipboard: { writeText: async () => {} } },
    window: {},
    URL,
    URLSearchParams,
    Math,
    Number,
    String,
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    requestAnimationFrame: () => 1,
    clearTimeout() {},
    setTimeout: () => 1
  };
  vm.runInNewContext(readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'), sandbox);
  return { element, stored, location };
}

test('opens a seeded world and plants a persistent star', () => {
  const { element, stored, location } = createHarness('https://example.com/?seed=123456');
  assert.match(element('#seedLabel').textContent, /123456/);
  assert.equal(element('#starCount').textContent, 0);
  element('#beginButton').click();
  assert.equal(element('#experienceUi').attributes['aria-hidden'], 'false');
  element('#world').listeners.get('pointerdown')({ button: 0, clientX: 600, clientY: 240 });
  assert.equal(element('#starCount').textContent, 1);
  assert.equal(stored.get('afterglow:123456'), '0.500,0.300');
  element('#paletteButton').click();
  assert.match(location.href, /p=1/);
});

test('restores stars from a shareable link', () => {
  const { element } = createHarness('https://example.com/?seed=456789&marks=0.200,0.300;0.500,0.450');
  assert.equal(element('#starCount').textContent, 2);
});
