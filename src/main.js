import { BackgroundProcessor } from "./core/background-processor.js";
import {
  DEFAULT_PARAMETERS,
  MAX_IMAGE_DIMENSION,
  MAX_UNDO_STEPS,
  PRESETS,
  UNIFORM_BACKGROUND_THRESHOLD,
} from "./core/config.js";
import { clamp, rgbToHex } from "./core/math.js";
import { initializeComparison } from "./ui/comparison.js";
import { createRadioGroup, setStatus } from "./ui/controls.js";
import { getEditorElements } from "./ui/elements.js";
import { bindFileInput, isSupportedImage, readImageFile } from "./ui/file-input.js";
import { downloadPng } from "./ui/png-export.js";
import { initializeTheme } from "./ui/theme.js";

const elements = getEditorElements();

const resultContext = elements.resultCanvas.getContext("2d");
const originalContext = elements.originalCanvas.getContext("2d");
const sourceCanvas = document.createElement("canvas");
const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
const processor = new BackgroundProcessor();

const state = {
  tool: "none",
  brushSize: 44,
  brushHardness: 0.6,
  painting: false,
  currentStroke: null,
  lastPoint: null,
  undoStack: [],
  recomputeTimer: null,
  composePending: false,
};

const radioGroups = {};
const comparison = initializeComparison(elements.canvasStack, elements.comparisonHandle);

initializeTheme(elements.themeToggle, elements.themeIcon);

function showStatus(text, kind) {
  setStatus(elements.status, text, kind);
}

async function loadFile(file) {
  if (!isSupportedImage(file)) {
    showStatus("Elige un archivo de imagen (PNG, JPG o WEBP).", "err");
    return;
  }

  showStatus("Cargando imagen…");
  try {
    setupImage(await readImageFile(file));
  } catch (error) {
    showStatus(
      error.message === "read" ? "No se pudo leer el archivo." : "No se pudo abrir la imagen.",
      "err",
    );
  }
}

function setupImage(image) {
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  sourceCanvas.width = width;
  sourceCanvas.height = height;
  sourceContext.clearRect(0, 0, width, height);
  sourceContext.drawImage(image, 0, 0, width, height);

  try {
    processor.loadImageData(sourceContext.getImageData(0, 0, width, height));
  } catch (error) {
    console.error(error);
    showStatus("No se pudo procesar la imagen.", "err");
    return;
  }

  elements.resultCanvas.width = width;
  elements.resultCanvas.height = height;
  elements.originalCanvas.width = width;
  elements.originalCanvas.height = height;
  originalContext.putImageData(
    new ImageData(new Uint8ClampedArray(processor.original), width, height),
    0,
    0,
  );

  clearUndoHistory();
  elements.emptyState.hidden = true;
  elements.editor.hidden = false;
  elements.downloadHeader.disabled = false;
  comparison.reset();
  updateColorSwatch();
  updateBackgroundWarning();
  render();

  const backgroundMessage =
    processor.backgroundVariation > UNIFORM_BACKGROUND_THRESHOLD
      ? "Fondo poco uniforme: revisa el color."
      : "Bordes suaves y sin halo por defecto.";
  showStatus(
    `Imagen lista (${width}×${height} px). ${backgroundMessage}`,
    processor.backgroundVariation > UNIFORM_BACKGROUND_THRESHOLD ? "warn" : "ok",
  );
}

function render() {
  if (!processor.ready) return;
  resultContext.putImageData(
    new ImageData(processor.output, processor.width, processor.height),
    0,
    0,
  );
  elements.resultCanvas.setAttribute(
    "aria-label",
    `Vista previa del recorte, ${processor.width} por ${processor.height} píxeles`,
  );
  updateMetadata();
}

function recompute() {
  if (!processor.ready) return;
  processor.recompute();
  render();
}

function composeOnly() {
  if (!processor.ready) return;
  processor.compose();
  render();
}

function requestRecompute() {
  if (state.recomputeTimer) window.clearTimeout(state.recomputeTimer);
  state.recomputeTimer = window.setTimeout(() => {
    state.recomputeTimer = null;
    recompute();
  }, 90);
}

function requestCompose() {
  if (state.composePending) return;
  state.composePending = true;
  window.requestAnimationFrame(() => {
    state.composePending = false;
    composeOnly();
  });
}

function updateColorSwatch() {
  const hexColor = rgbToHex(processor.backgroundColor);
  elements.colorSwatch.style.background = hexColor;
  elements.hexValue.textContent = hexColor;
}

function updateBackgroundWarning() {
  const shouldWarn =
    processor.ready &&
    processor.parameters.matte === "uniform" &&
    processor.backgroundVariation > UNIFORM_BACKGROUND_THRESHOLD;
  elements.backgroundWarning.classList.toggle("show", shouldWarn);
}

function updateMetadata() {
  const bounds = processor.contentBounds();
  const shouldTrim = elements.trimOutput.checked && bounds;
  const outputWidth = shouldTrim ? bounds.x1 - bounds.x0 + 1 : processor.width;
  const outputHeight = shouldTrim ? bounds.y1 - bounds.y0 + 1 : processor.height;
  elements.imageMeta.replaceChildren(
    createMetaItem(`Original: ${processor.width}×${processor.height} px`),
    createMetaItem(
      `Salida${elements.trimOutput.checked ? " (recortada)" : ""}: ${outputWidth}×${outputHeight} px`,
    ),
  );
}

function createMetaItem(text) {
  const item = document.createElement("span");
  item.textContent = text;
  return item;
}

function eventToPixel(event) {
  const bounds = elements.resultCanvas.getBoundingClientRect();
  return {
    x: clamp(
      Math.floor((event.clientX - bounds.left) * (processor.width / bounds.width)),
      0,
      processor.width - 1,
    ),
    y: clamp(
      Math.floor((event.clientY - bounds.top) * (processor.height / bounds.height)),
      0,
      processor.height - 1,
    ),
    scale: processor.width / bounds.width,
  };
}

function strokeTo(x, y, radius) {
  if (state.lastPoint) {
    const xDistance = x - state.lastPoint.x;
    const yDistance = y - state.lastPoint.y;
    const distance = Math.hypot(xDistance, yDistance);
    const steps = Math.max(1, Math.ceil(distance / (radius * 0.4)));
    for (let step = 1; step <= steps; step += 1) {
      processor.stampBrush(
        state.lastPoint.x + (xDistance * step) / steps,
        state.lastPoint.y + (yDistance * step) / steps,
        radius,
        state.brushHardness,
        state.tool,
        state.currentStroke,
      );
    }
  } else {
    processor.stampBrush(
      x,
      y,
      radius,
      state.brushHardness,
      state.tool,
      state.currentStroke,
    );
  }
  state.lastPoint = { x, y };
}

elements.resultCanvas.addEventListener("pointerdown", (event) => {
  if (!processor.ready) return;
  const { x, y, scale } = eventToPixel(event);

  if (elements.previewStage.classList.contains("pick")) {
    processor.setBackgroundAt(x, y);
    updateColorSwatch();
    elements.backgroundWarning.classList.remove("show");
    setColorPicker(false);
    recompute();
    showStatus(`Color de fondo: ${rgbToHex(processor.backgroundColor)}`, "ok");
    return;
  }

  if (state.tool === "wand") {
    state.currentStroke = new Map();
    const selectedCount = processor.magicWand(x, y, state.currentStroke);
    endStroke();
    requestCompose();
    showStatus(
      selectedCount
        ? "Zona eliminada. Repite en otros huecos si hace falta."
        : "Ahí no hay una zona clara de ese color.",
      "ok",
    );
    return;
  }

  if (state.tool === "erase" || state.tool === "restore") {
    state.currentStroke = new Map();
    state.painting = true;
    state.lastPoint = null;
    elements.resultCanvas.setPointerCapture(event.pointerId);
    strokeTo(x, y, state.brushSize * scale);
    requestCompose();
  }
});

elements.resultCanvas.addEventListener("pointermove", (event) => {
  if (state.tool === "erase" || state.tool === "restore") moveBrushRing(event);
  if (!state.painting) return;
  const { x, y, scale } = eventToPixel(event);
  strokeTo(x, y, state.brushSize * scale);
  requestCompose();
});

function finishStroke() {
  if (!state.painting) return;
  state.painting = false;
  state.lastPoint = null;
  endStroke();
}

elements.resultCanvas.addEventListener("pointerup", finishStroke);
elements.resultCanvas.addEventListener("pointercancel", finishStroke);
elements.resultCanvas.addEventListener("pointerleave", () => {
  finishStroke();
  elements.brushRing.style.display = "none";
});

function endStroke() {
  if (state.currentStroke?.size) {
    state.undoStack.push(state.currentStroke);
    if (state.undoStack.length > MAX_UNDO_STEPS) state.undoStack.shift();
    setUndoDisabled(false);
  }
  state.currentStroke = null;
}

function moveBrushRing(event) {
  const stageBounds = elements.previewStage.getBoundingClientRect();
  const canvasBounds = elements.resultCanvas.getBoundingClientRect();
  const diameter = state.brushSize * 2 * (canvasBounds.width / processor.width);
  Object.assign(elements.brushRing.style, {
    display: "block",
    width: `${diameter}px`,
    height: `${diameter}px`,
    left: `${event.clientX - stageBounds.left}px`,
    top: `${event.clientY - stageBounds.top}px`,
  });
}

function setColorPicker(enabled) {
  elements.previewStage.classList.toggle("pick", enabled);
  elements.colorPicker.setAttribute("aria-pressed", String(enabled));
  if (!enabled) return;
  state.tool = "none";
  radioGroups.tool.select("none");
  elements.previewStage.classList.remove("brush", "wand");
  elements.brushRing.style.display = "none";
}

elements.colorPicker.addEventListener("click", () => {
  setColorPicker(elements.colorPicker.getAttribute("aria-pressed") !== "true");
});

radioGroups.matte = createRadioGroup(elements.matteMode, (value) => {
  processor.updateParameters({ matte: value });
  const complex = value === "complex";
  elements.uniformPanel.hidden = complex;
  elements.complexPanel.hidden = !complex;
  elements.downloadHeader.disabled = complex;
  elements.downloadEditor.disabled = complex;
  updateBackgroundWarning();

  if (!processor.ready) return;
  recompute();
  showStatus(
    complex
      ? "Modo “Fondo complejo”: pendiente de modelo local. Usa “Fondo uniforme”."
      : "Modo “Fondo uniforme”.",
    complex ? "warn" : "ok",
  );
});

radioGroups.preset = createRadioGroup(elements.preset, applyPreset);
radioGroups.removalMode = createRadioGroup(elements.removalMode, (value) => {
  processor.updateParameters({ mode: value });
  elements.removalModeHint.textContent =
    value === "flood"
      ? "Quita solo el fondo pegado a los bordes; conserva ese color dentro del dibujo. Sella aberturas finas del contorno."
      : "Quita ese color en toda la imagen (también huecos internos).";
  requestRecompute();
});
radioGroups.tool = createRadioGroup(elements.tool, (value) => {
  state.tool = value;
  setColorPicker(false);
  elements.previewStage.classList.toggle("brush", value === "erase" || value === "restore");
  elements.previewStage.classList.toggle("wand", value === "wand");
  if (value !== "erase" && value !== "restore") elements.brushRing.style.display = "none";
});
radioGroups.previewBackground = createRadioGroup(elements.previewBackground, (value) => {
  elements.previewStage.classList.remove("bg-white", "bg-dark", "bg-lime");
  if (value !== "checker") elements.previewStage.classList.add(`bg-${value}`);
});

function syncParameterControls() {
  const { parameters } = processor;
  const mappings = [
    [elements.tolerance, elements.toleranceValue, parameters.tolerance],
    [elements.softness, elements.softnessValue, parameters.softness],
    [elements.sharpness, elements.sharpnessValue, parameters.sharpness],
    [elements.contraction, elements.contractionValue, parameters.contraction],
    [elements.feather, elements.featherValue, parameters.feather],
    [elements.spillAmount, elements.spillAmountValue, parameters.spillAmount],
  ];
  mappings.forEach(([input, output, value]) => {
    input.value = value;
    output.textContent = value;
  });
  elements.spill.checked = parameters.spill;
  elements.despeckle.checked = parameters.despeckle;
  elements.spillAmountRow.style.opacity = parameters.spill ? "1" : "0.45";
}

function applyPreset(value) {
  processor.updateParameters(PRESETS[value] ?? PRESETS.crisp);
  syncParameterControls();
  requestRecompute();
}

function bindProcessingRange(input, output, parameter, unit = "") {
  input.setAttribute("aria-valuetext", `${input.value}${unit}`);
  input.addEventListener("input", () => {
    processor.updateParameters({ [parameter]: Number(input.value) });
    output.textContent = input.value;
    input.setAttribute("aria-valuetext", `${input.value}${unit}`);
    requestRecompute();
  });
  input.addEventListener("change", () => {
    processor.updateParameters({ [parameter]: Number(input.value) });
    if (state.recomputeTimer) {
      window.clearTimeout(state.recomputeTimer);
      state.recomputeTimer = null;
    }
    recompute();
  });
}

bindProcessingRange(elements.tolerance, elements.toleranceValue, "tolerance");
bindProcessingRange(elements.softness, elements.softnessValue, "softness");
bindProcessingRange(elements.sharpness, elements.sharpnessValue, "sharpness");
bindProcessingRange(elements.contraction, elements.contractionValue, "contraction", " px");
bindProcessingRange(elements.feather, elements.featherValue, "feather", " px");

elements.spillAmount.addEventListener("input", () => {
  processor.updateParameters({ spillAmount: Number(elements.spillAmount.value) });
  elements.spillAmountValue.textContent = elements.spillAmount.value;
  requestCompose();
});
elements.spill.addEventListener("change", () => {
  processor.updateParameters({ spill: elements.spill.checked });
  elements.spillAmountRow.style.opacity = elements.spill.checked ? "1" : "0.45";
  requestCompose();
});
elements.despeckle.addEventListener("change", () => {
  processor.updateParameters({ despeckle: elements.despeckle.checked });
  recompute();
});
elements.brushSize.addEventListener("input", () => {
  state.brushSize = Number(elements.brushSize.value);
  elements.brushSizeValue.textContent = elements.brushSize.value;
});
elements.brushHardness.addEventListener("input", () => {
  state.brushHardness = Number(elements.brushHardness.value) / 100;
  elements.brushHardnessValue.textContent = elements.brushHardness.value;
});
elements.trimOutput.addEventListener("change", updateMetadata);

function setUndoDisabled(disabled) {
  elements.undo.disabled = disabled;
  elements.undoPreview.disabled = disabled;
}

function clearUndoHistory() {
  state.undoStack = [];
  setUndoDisabled(true);
}

function undo() {
  if (!state.undoStack.length) return;
  processor.applyUndo(state.undoStack.pop());
  setUndoDisabled(!state.undoStack.length);
  composeOnly();
}

elements.undo.addEventListener("click", undo);
elements.undoPreview.addEventListener("click", undo);
elements.clearRetouch.addEventListener("click", () => {
  if (!processor.ready) return;
  processor.clearPaint();
  clearUndoHistory();
  composeOnly();
  showStatus("Retoques borrados.", "ok");
});

elements.resetSettings.addEventListener("click", () => {
  if (!processor.ready) return;
  processor.updateParameters(DEFAULT_PARAMETERS);
  processor.clearPaint();
  clearUndoHistory();
  radioGroups.matte.select("uniform");
  radioGroups.removalMode.select("flood");
  radioGroups.preset.select("crisp");
  radioGroups.tool.select("none");
  setColorPicker(false);
  processor.detectBackground();
  updateColorSwatch();
  updateBackgroundWarning();
  syncParameterControls();
  recompute();
  showStatus("Ajustes restablecidos.", "ok");
});

bindFileInput({
  input: elements.fileInput,
  dropZone: elements.dropZone,
  changeButton: elements.changeImage,
  onFile: loadFile,
});

async function download() {
  if (!processor.ready || processor.parameters.matte === "complex") return;

  try {
    const result = await downloadPng({
      rgba: processor.output,
      width: processor.width,
      height: processor.height,
      bounds: processor.contentBounds(),
      trim: elements.trimOutput.checked,
    });
    showStatus(`PNG descargado (${result.width}×${result.height} px, transparente).`, "ok");
  } catch (error) {
    showStatus(error.message, "err");
  }
}

elements.downloadHeader.addEventListener("click", download);
elements.downloadEditor.addEventListener("click", download);

document.addEventListener("keydown", (event) => {
  if (!processor.ready) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;

  const shortcuts = {
    w: () => radioGroups.tool.select("wand"),
    b: () => radioGroups.tool.select("erase"),
    r: () => radioGroups.tool.select("restore"),
    v: () => radioGroups.tool.select("none"),
    i: () => setColorPicker(true),
  };
  shortcuts[event.key.toLowerCase()]?.();
});

// Contrato de diagnóstico conservado para pruebas locales y futuras integraciones.
window.__bg = {
  get W() {
    return processor.width;
  },
  get H() {
    return processor.height;
  },
  get outRGBA() {
    return processor.output;
  },
  get alpha() {
    return processor.alpha;
  },
  get params() {
    return processor.parameters;
  },
  get processor() {
    return processor;
  },
  setupImage,
  recompute,
  contentBounds: () => processor.contentBounds(),
  detect: () => ({
    key: processor.backgroundColor.slice(),
    bgVariation: processor.backgroundVariation,
  }),
  magicWand(x, y) {
    const stroke = new Map();
    const count = processor.magicWand(x, y, stroke);
    if (stroke.size) state.undoStack.push(stroke);
    processor.compose();
    render();
    return count;
  },
};
