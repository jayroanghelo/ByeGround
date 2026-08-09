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

function createAntialiasedHoleImage() {
  const background = [255, 255, 255];
  const hole = [32, 32, 34];
  const subject = [220, 28, 48];

  return createImageData(31, 31, (x, y) => {
    if (x < 4 || x > 26 || y < 4 || y > 26) return [...background, 255];
    if (x < 9 || x > 21 || y < 9 || y > 21) return [...subject, 255];

    const subjectAlpha = Math.max(0, Math.min(1, (x + y - 27) / 4));
    return [
      Math.round(hole[0] * (1 - subjectAlpha) + subject[0] * subjectAlpha),
      Math.round(hole[1] * (1 - subjectAlpha) + subject[1] * subjectAlpha),
      Math.round(hole[2] * (1 - subjectAlpha) + subject[2] * subjectAlpha),
      255,
    ];
  });
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

test("acepta una máscara automática y conserva los retoques manuales", () => {
  const processor = createProcessor();
  processor.loadImageData(
    createImageData(5, 5, () => [80, 120, 180, 255]),
  );

  const matte = new Float32Array(25).fill(1);
  matte[12] = 0.35;
  processor.applyAlphaMatte(matte);

  assert.equal(processor.parameters.matte, "automatic");
  assert.ok(Math.abs(outputAlpha(processor, 2, 2) - 89) <= 1);

  const stroke = new Map();
  processor.stampBrush(2, 2, 1, 1, "restore", stroke);
  processor.compose();
  assert.equal(outputAlpha(processor, 2, 2), 255);

  processor.applyUndo(stroke);
  processor.compose();
  assert.ok(Math.abs(outputAlpha(processor, 2, 2) - 89) <= 1);
});

test("la varita produce el mismo borde subpíxel que el motor automático", () => {
  const parameters = {
    tolerance: 30,
    softness: 120,
    sharpness: 25,
    contraction: 1,
    feather: 1,
    despeckle: false,
    spill: true,
    spillAmount: 95,
  };
  const image = createAntialiasedHoleImage();

  const wand = createProcessor(parameters);
  wand.loadImageData(image);
  const stroke = new Map();
  wand.magicWand(10, 10, stroke);
  wand.compose();

  const automatic = createProcessor({ ...parameters, mode: "global" });
  automatic.loadImageData(image);
  automatic.setBackgroundAt(10, 10);
  automatic.recompute();

  let maximumAlphaDifference = 0;
  let maximumColorDifference = 0;
  let partiallyTransparentPixels = 0;
  for (let y = 8; y <= 22; y += 1) {
    for (let x = 8; x <= 22; x += 1) {
      const wandAlpha = outputAlpha(wand, x, y);
      const automaticAlpha = outputAlpha(automatic, x, y);
      maximumAlphaDifference = Math.max(
        maximumAlphaDifference,
        Math.abs(wandAlpha - automaticAlpha),
      );
      if (wandAlpha > 0 && wandAlpha < 255) {
        partiallyTransparentPixels += 1;
        const offset = (y * wand.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          maximumColorDifference = Math.max(
            maximumColorDifference,
            Math.abs(wand.output[offset + channel] - automatic.output[offset + channel]),
          );
        }
      }
    }
  }

  assert.ok(partiallyTransparentPixels > 0, "la transición debe conservar antialias");
  assert.ok(
    maximumAlphaDifference <= 2,
    `la diferencia máxima de alfa fue ${maximumAlphaDifference}`,
  );
  assert.ok(
    maximumColorDifference <= 2,
    `la diferencia máxima de color fue ${maximumColorDifference}`,
  );

  wand.applyUndo(stroke);
  wand.compose();
  assert.equal(outputAlpha(wand, 10, 10), 255, "deshacer debe restaurar el hueco original");
});
