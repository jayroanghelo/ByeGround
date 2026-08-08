export function downloadPng({ rgba, width, height, bounds, trim }) {
  let sourceX = 0;
  let sourceY = 0;
  let outputWidth = width;
  let outputHeight = height;

  if (trim && bounds) {
    sourceX = bounds.x0;
    sourceY = bounds.y0;
    outputWidth = bounds.x1 - bounds.x0 + 1;
    outputHeight = bounds.y1 - bounds.y0 + 1;
  }

  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  fullCanvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  outputCanvas
    .getContext("2d")
    .drawImage(
      fullCanvas,
      sourceX,
      sourceY,
      outputWidth,
      outputHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo crear el PNG."));
        return;
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `byeground-${Date.now()}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      resolve({ width: outputWidth, height: outputHeight });
    }, "image/png");
  });
}
