export function clamp(value, minimum, maximum) {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

export function smoothstep(edgeStart, edgeEnd, value) {
  if (edgeStart === edgeEnd) return value < edgeStart ? 0 : 1;
  const amount = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function smooth01(value) {
  return value * value * (3 - 2 * value);
}

export function rgbToHex(color) {
  return `#${color
    .map((value) => clamp(value | 0, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function findContentBounds(rgba, width, height, alphaThreshold = 4) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
