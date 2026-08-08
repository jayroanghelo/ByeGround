import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundProcessor } from "../src/core/background-processor.js";

function createImageData(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixelAt(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function createProcessor(overrides = {}) {
  return new BackgroundProcessor({
    tolerance: 1,
    softness: 1,
    sharpness: 0,
    contraction: 0,
    feather: 0,
    despeckle: false,
    spill: false,
    ...overrides,
  });
}

function outputAlpha(processor, x, y) {
  return processor.output[(y * processor.width + x) * 4 + 3];
}

test("detecta el perímetro y elimina un fondo blanco conectado", () => {
  const processor = createProcessor();
  processor.loadImageData(
    createImageData(9, 9, (x, y) =>
      x >= 3 && x <= 5 && y >= 3 && y <= 5 ? [220, 20, 30, 255] : [255, 255, 255, 255],
    ),
  );

  assert.deepEqual(processor.backgroundColor, [255, 255, 255]);
  assert.equal(processor.backgroundVariation, 0);
  assert.equal(outputAlpha(processor, 0, 0), 0);
  assert.equal(outputAlpha(processor, 4, 4), 255);
  assert.deepEqual(processor.contentBounds(), { x0: 3, y0: 3, x1: 5, y1: 5 });
});

test("el modo flood conserva huecos internos y global elimina el color en toda la imagen", () => {
  const processor = createProcessor();
  const image = createImageData(11, 11, (x, y) => {
    const ring =
      ((x === 3 || x === 7) && y >= 3 && y <= 7) ||
      ((y === 3 || y === 7) && x >= 3 && x <= 7);
    return ring ? [220, 20, 30, 255] : [255, 255, 255, 255];
  });

  processor.loadImageData(image);
  assert.equal(outputAlpha(processor, 5, 5), 255);

  processor.updateParameters({ mode: "global" });
  processor.recompute();
  assert.equal(outputAlpha(processor, 5, 5), 0);
});

test("respeta el alfa original del sujeto", () => {
  const processor = createProcessor({ mode: "global" });
  processor.loadImageData(
    createImageData(9, 9, (x, y) =>
      x === 4 && y === 4 ? [220, 20, 30, 128] : [255, 255, 255, 255],
    ),
  );

  assert.equal(outputAlpha(processor, 4, 4), 128);
  assert.equal(outputAlpha(processor, 0, 0), 0);
});

test("los retoques manuales se pueden deshacer sin copiar toda la imagen", () => {
  const processor = createProcessor({ mode: "global" });
  processor.loadImageData(
    createImageData(9, 9, (x, y) =>
      x >= 2 && x <= 6 && y >= 2 && y <= 6 ? [220, 20, 30, 255] : [255, 255, 255, 255],
    ),
  );

  const stroke = new Map();
  processor.stampBrush(4, 4, 1, 1, "erase", stroke);
  processor.compose();
  assert.equal(outputAlpha(processor, 4, 4), 0);
  assert.ok(stroke.size > 0);

  processor.applyUndo(stroke);
  processor.compose();
  assert.equal(outputAlpha(processor, 4, 4), 255);
});
