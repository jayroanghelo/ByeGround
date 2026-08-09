import { clamp } from "./math.js";

const DEFAULT_CORE_THRESHOLD = 0.48;
const DEFAULT_AI_OVERLAP_THRESHOLD = 0.42;

function assertCompatibleMasks(aiAlpha, protectionAlpha, width, height) {
  const pixelCount = width * height;
  if (!width || !height || aiAlpha?.length !== pixelCount || protectionAlpha?.length !== pixelCount) {
    throw new TypeError("Las máscaras de sujeto deben coincidir con las dimensiones de la imagen.");
  }
}

/**
 * Refuerza la máscara semántica con regiones cerradas detectadas sobre un
 * fondo uniforme. Solo conserva componentes que se solapan con el sujeto de
 * la IA; así recupera ropa, piel o ilustraciones blancas sin volver a añadir
 * objetos aislados del fondo.
 */
export function protectSubjectMatte(
  aiAlpha,
  protectionAlpha,
  width,
  height,
  {
    coreThreshold = DEFAULT_CORE_THRESHOLD,
    aiOverlapThreshold = DEFAULT_AI_OVERLAP_THRESHOLD,
  } = {},
) {
  assertCompatibleMasks(aiAlpha, protectionAlpha, width, height);

  const pixelCount = width * height;
  const labels = new Int32Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const protectedLabels = new Set();
  let nextLabel = 0;

  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (labels[seed] || protectionAlpha[seed] < coreThreshold) continue;

    const label = ++nextLabel;
    let stackPointer = 0;
    let overlapsSubject = false;
    labels[seed] = label;
    stack[stackPointer++] = seed;

    while (stackPointer) {
      const index = stack[--stackPointer];
      if (aiAlpha[index] >= aiOverlapThreshold) overlapsSubject = true;

      const x = index % width;
      const y = (index / width) | 0;
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(height - 1, y + 1);

      for (let neighborY = y0; neighborY <= y1; neighborY += 1) {
        for (let neighborX = x0; neighborX <= x1; neighborX += 1) {
          const neighbor = neighborY * width + neighborX;
          if (labels[neighbor] || protectionAlpha[neighbor] < coreThreshold) continue;
          labels[neighbor] = label;
          stack[stackPointer++] = neighbor;
        }
      }
    }

    if (overlapsSubject) protectedLabels.add(label);
  }

  const result = new Float32Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const aiValue = clamp(Number(aiAlpha[index]) || 0, 0, 1);
    const protectionValue = clamp(Number(protectionAlpha[index]) || 0, 0, 1);
    result[index] = protectedLabels.has(labels[index])
      ? Math.max(aiValue, protectionValue)
      : aiValue;
  }

  return {
    alpha: result,
    protectedComponentCount: protectedLabels.size,
  };
}
