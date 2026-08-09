import assert from "node:assert/strict";
import test from "node:test";

import { computeTooltipPosition } from "../src/ui/tooltips.js";

test("mantiene el tooltip dentro del borde izquierdo del viewport", () => {
  const position = computeTooltipPosition(
    { left: 2, top: 120, bottom: 150, width: 30 },
    { width: 240, height: 60 },
    { width: 800, height: 600 },
  );
  assert.equal(position.left, 10);
  assert.equal(position.placement, "top");
});

test("cambia debajo cuando no hay espacio suficiente arriba", () => {
  const position = computeTooltipPosition(
    { left: 300, top: 8, bottom: 42, width: 34 },
    { width: 200, height: 80 },
    { width: 800, height: 600 },
  );
  assert.equal(position.placement, "bottom");
  assert.equal(position.top, 52);
});
