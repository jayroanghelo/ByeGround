import assert from "node:assert/strict";
import test from "node:test";

import { protectSubjectMatte } from "../src/core/alpha-matte.js";

test("recupera una zona clara conectada al sujeto que la IA había borrado", () => {
  const width = 7;
  const height = 5;
  const ai = new Float32Array(width * height);
  const protection = new Float32Array(width * height);

  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 4; x += 1) protection[y * width + x] = 1;
  }
  ai[2 * width + 1] = 0.95;
  ai[2 * width + 2] = 0.08;

  const result = protectSubjectMatte(ai, protection, width, height);
  assert.equal(result.protectedComponentCount, 1);
  assert.equal(result.alpha[2 * width + 2], 1);
  assert.equal(result.alpha[0], 0);
});

test("no recupera un objeto aislado que el modelo no identifica como sujeto", () => {
  const width = 8;
  const height = 4;
  const ai = new Float32Array(width * height);
  const protection = new Float32Array(width * height);

  protection[1 * width + 1] = 1;
  protection[1 * width + 2] = 1;
  ai[1 * width + 1] = 0.9;
  protection[1 * width + 6] = 1;

  const result = protectSubjectMatte(ai, protection, width, height);
  assert.equal(result.alpha[1 * width + 2], 1);
  assert.equal(result.alpha[1 * width + 6], 0);
});

test("rechaza máscaras con dimensiones incompatibles", () => {
  assert.throws(
    () => protectSubjectMatte(new Float32Array(3), new Float32Array(4), 2, 2),
    /dimensiones/,
  );
});
