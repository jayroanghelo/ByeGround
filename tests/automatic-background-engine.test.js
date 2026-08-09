import assert from "node:assert/strict";
import test from "node:test";

import { AutomaticBackgroundEngine } from "../src/engines/automatic-background-engine.js";

test("el adaptador del worker devuelve alfa y propaga el progreso", async () => {
  const listeners = new Map();
  const fakeWorker = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message) {
      listeners.get("message")({
        data: {
          type: "progress",
          requestId: message.requestId,
          progress: { phase: "inference", value: 0.5 },
        },
      });
      const alpha = new Float32Array([0, 0.5, 1, 0.25]);
      listeners.get("message")({
        data: {
          type: "result",
          requestId: message.requestId,
          alpha: alpha.buffer,
          backend: "webgpu",
          model: "test-model",
        },
      });
    },
    terminate() {},
  };

  const progress = [];
  const engine = new AutomaticBackgroundEngine({ workerFactory: () => fakeWorker });
  const result = await engine.remove(
    { width: 2, height: 2, data: new Uint8ClampedArray(16) },
    { onProgress: (event) => progress.push(event) },
  );

  assert.deepEqual([...result.alpha], [0, 0.5, 1, 0.25]);
  assert.equal(result.backend, "webgpu");
  assert.deepEqual(progress, [{ phase: "inference", value: 0.5 }]);
});
