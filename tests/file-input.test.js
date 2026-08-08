import assert from "node:assert/strict";
import test from "node:test";

import { isSupportedImage } from "../src/ui/file-input.js";

test("reconoce imágenes por MIME o extensión y rechaza otros archivos", () => {
  assert.equal(isSupportedImage({ type: "image/png", name: "subject.bin" }), true);
  assert.equal(isSupportedImage({ type: "", name: "subject.webp" }), true);
  assert.equal(isSupportedImage({ type: "text/plain", name: "notes.txt" }), false);
  assert.equal(isSupportedImage(null), false);
});
