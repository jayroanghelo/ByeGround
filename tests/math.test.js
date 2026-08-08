import assert from "node:assert/strict";
import test from "node:test";

import { clamp, findContentBounds, rgbToHex, smoothstep } from "../src/core/math.js";

test("clamp y smoothstep respetan sus límites", () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(smoothstep(10, 20, 5), 0);
  assert.equal(smoothstep(10, 20, 25), 1);
  assert.equal(smoothstep(10, 20, 15), 0.5);
});

test("rgbToHex normaliza los canales RGB", () => {
  assert.equal(rgbToHex([255, 16, 0]), "#ff1000");
  assert.equal(rgbToHex([-10, 260, 15.9]), "#00ff0f");
});

test("findContentBounds encuentra solo los píxeles visibles", () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4);
  rgba[(1 * 4 + 2) * 4 + 3] = 255;
  rgba[(3 * 4 + 1) * 4 + 3] = 5;
  assert.deepEqual(findContentBounds(rgba, 4, 4), { x0: 1, y0: 1, x1: 2, y1: 3 });

  rgba.fill(0);
  assert.equal(findContentBounds(rgba, 4, 4), null);
});
