import * as ort from "onnxruntime-web/webgpu";

const MODEL_REVISION = "4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7";
const MODEL_URL = `https://huggingface.co/studioludens/birefnet-lite-512/resolve/${MODEL_REVISION}/onnx/model_fp16.onnx`;
const MODEL_SIZE = 512;
const MODEL_CACHE = "byeground-models-v3";
const IMAGE_MEAN = [0.485, 0.456, 0.406];
const IMAGE_STD = [0.229, 0.224, 0.225];

const supportsWebGpu = Boolean(globalThis.navigator?.gpu);
let runtimePromise;

ort.env.wasm.numThreads = globalThis.crossOriginIsolated
  ? Math.min(4, globalThis.navigator?.hardwareConcurrency || 1)
  : 1;
ort.env.logLevel = "fatal";

function sendProgress(requestId, phase, label, value = null) {
  self.postMessage({
    type: "progress",
    requestId,
    progress: { phase, label, value },
  });
}

async function loadModel(url) {
  let cache;
  let response;
  try {
    cache = await caches.open(MODEL_CACHE);
    response = await cache.match(url);
  } catch {
    // Cache Storage puede estar deshabilitado en navegación privada.
  }

  if (!response) {
    response = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!response.ok) throw new Error(`No se pudo descargar el modelo (${response.status}).`);
    if (cache) {
      cache.put(url, response.clone()).catch(() => {
        // El recorte sigue funcionando aunque el navegador no tenga cuota para cachearlo.
      });
    }
  }

  return response.arrayBuffer();
}

async function createSession(executionProvider, requestId) {
  sendProgress(requestId, "loading", "Cargando el modelo de recorte", null);
  const model = await loadModel(MODEL_URL);
  sendProgress(requestId, "loading", "Iniciando el motor local", 0.9);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: [executionProvider],
    graphOptimizationLevel: "basic",
    logSeverityLevel: 3,
  });
  return { session, backend: executionProvider };
}

async function createRuntime(requestId) {
  if (supportsWebGpu) {
    try {
      return await createSession("webgpu", requestId);
    } catch (error) {
      console.warn("WebGPU no pudo iniciar; se usará WASM.", error);
      sendProgress(requestId, "loading", "Adaptando el motor a este navegador", null);
    }
  }
  return createSession("wasm", requestId);
}

function getRuntime(requestId) {
  if (!runtimePromise) {
    runtimePromise = createRuntime(requestId).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function resizeRgba(pixels, width, height, targetWidth, targetHeight) {
  const source = new OffscreenCanvas(width, height);
  source.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
  const target = new OffscreenCanvas(targetWidth, targetHeight);
  const context = target.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return context.getImageData(0, 0, targetWidth, targetHeight).data;
}

function createInputTensor(pixels, width, height) {
  const resized = resizeRgba(pixels, width, height, MODEL_SIZE, MODEL_SIZE);
  const planeSize = MODEL_SIZE * MODEL_SIZE;
  const normalized = new Float32Array(planeSize * 3);

  for (let index = 0; index < planeSize; index += 1) {
    const pixelOffset = index * 4;
    normalized[index] = (resized[pixelOffset] / 255 - IMAGE_MEAN[0]) / IMAGE_STD[0];
    normalized[planeSize + index] =
      (resized[pixelOffset + 1] / 255 - IMAGE_MEAN[1]) / IMAGE_STD[1];
    normalized[planeSize * 2 + index] =
      (resized[pixelOffset + 2] / 255 - IMAGE_MEAN[2]) / IMAGE_STD[2];
  }

  return new ort.Tensor("float32", normalized, [1, 3, MODEL_SIZE, MODEL_SIZE]);
}

function createFullSizeAlpha(output, width, height) {
  const dimensions = output.dims;
  const maskHeight = dimensions[dimensions.length - 2];
  const maskWidth = dimensions[dimensions.length - 1];
  const maskPixels = maskWidth * maskHeight;
  const rgba = new Uint8ClampedArray(maskPixels * 4);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < maskPixels; index += 1) {
    minimum = Math.min(minimum, output.data[index]);
    maximum = Math.max(maximum, output.data[index]);
  }
  const outputIsProbability = minimum >= 0 && maximum <= 1;

  for (let index = 0; index < maskPixels; index += 1) {
    const rawValue = output.data[index];
    const probability = outputIsProbability
      ? rawValue
      : 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, rawValue))));
    const value = Math.round(probability * 255);
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }

  const resized = resizeRgba(rgba, maskWidth, maskHeight, width, height);
  const alpha = new Float32Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = resized[index * 4] / 255;
  }
  return alpha;
}

self.addEventListener("message", async (event) => {
  const { type, requestId, width, height, pixels } = event.data ?? {};
  if (type !== "remove") return;

  try {
    const { session, backend } = await getRuntime(requestId);
    sendProgress(requestId, "inference", "Separando sujeto y fondo", 0.94);
    const input = createInputTensor(new Uint8ClampedArray(pixels), width, height);
    const outputs = await session.run({ [session.inputNames[0]]: input });
    const output = outputs.logits ?? outputs.output_image ?? outputs[session.outputNames[0]];
    if (!output) throw new Error("El modelo no devolvió una máscara compatible.");

    sendProgress(requestId, "finishing", "Perfeccionando los bordes", 0.98);
    const alpha = createFullSizeAlpha(output, width, height);
    input.dispose?.();
    output.dispose?.();

    self.postMessage(
      {
        type: "result",
        requestId,
        alpha: alpha.buffer,
        backend,
        model: "BiRefNet Lite 512",
      },
      [alpha.buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
