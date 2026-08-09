/**
 * Fachada del motor automático. Mantiene la IA fuera del hilo de la interfaz
 * y expone una API pequeña que permite sustituir el modelo sin tocar el editor.
 */
export class AutomaticBackgroundEngine {
  constructor({ workerFactory } = {}) {
    this.workerFactory =
      workerFactory ??
      (() => new Worker(new URL("../workers/background-removal.worker.js", import.meta.url), {
        type: "module",
      }));
    this.worker = null;
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  remove(imageData, { onProgress } = {}) {
    if (!imageData?.width || !imageData?.height || !imageData.data) {
      return Promise.reject(new TypeError("Se necesitan datos RGBA válidos."));
    }

    const worker = this.#getWorker();
    const requestId = this.nextRequestId++;
    const pixels = new Uint8ClampedArray(imageData.data);

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      worker.postMessage(
        {
          type: "remove",
          requestId,
          width: imageData.width,
          height: imageData.height,
          pixels: pixels.buffer,
        },
        [pixels.buffer],
      );
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) {
      request.reject(new Error("El motor automático se ha detenido."));
    }
    this.pending.clear();
  }

  #getWorker() {
    if (this.worker) return this.worker;
    this.worker = this.workerFactory();
    this.worker.addEventListener("message", (event) => this.#handleMessage(event.data));
    this.worker.addEventListener("error", () => {
      for (const request of this.pending.values()) {
        request.reject(new Error("No se pudo iniciar el motor automático."));
      }
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    });
    return this.worker;
  }

  #handleMessage(message) {
    const request = this.pending.get(message.requestId);
    if (!request) return;

    if (message.type === "progress") {
      request.onProgress?.(message.progress);
      return;
    }

    this.pending.delete(message.requestId);
    if (message.type === "result") {
      request.resolve({
        alpha: new Float32Array(message.alpha),
        backend: message.backend,
        model: message.model,
      });
      return;
    }

    request.reject(new Error(message.message || "La IA no pudo procesar esta imagen."));
  }
}
