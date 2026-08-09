import { DEFAULT_PARAMETERS } from "./config.js";
import { clamp, findContentBounds, smooth01, smoothstep } from "./math.js";

/**
 * Pipeline independiente del DOM para recorte cromático y retoques manuales.
 * Mantener el procesamiento aquí permite probarlo y añadir nuevos motores de
 * segmentación sin acoplarlos a los controles de la interfaz.
 */
export class BackgroundProcessor {
  constructor(parameters = {}) {
    this.parameters = { ...DEFAULT_PARAMETERS, ...parameters };
    this.width = 0;
    this.height = 0;
    this.pixelCount = 0;
    this.original = null;
    this.originalAlpha = null;
    this.alpha = null;
    this.paint = null;
    this.paintMatteKey = null;
    this.matteColors = [[0, 0, 0]];
    this.output = null;
    this.backgroundColor = [0, 0, 0];
    this.backgroundVariation = 0;

    this.scratchFloatA = null;
    this.scratchFloatB = null;
    this.scratchByteA = null;
    this.scratchByteB = null;
    this.backgroundConnected = null;
    this.pureBackground = null;
  }

  get ready() {
    return this.original !== null;
  }

  loadImageData(imageData) {
    const { width, height, data } = imageData;
    if (!width || !height || data.length !== width * height * 4) {
      throw new TypeError("Los datos de imagen no tienen dimensiones RGBA válidas.");
    }

    this.width = width;
    this.height = height;
    this.pixelCount = width * height;
    this.original = new Uint8ClampedArray(data);
    this.originalAlpha = new Uint8Array(this.pixelCount);

    for (let index = 0; index < this.pixelCount; index += 1) {
      this.originalAlpha[index] = this.original[index * 4 + 3];
    }

    this.alpha = new Float32Array(this.pixelCount);
    this.paint = new Float32Array(this.pixelCount);
    this.paintMatteKey = new Uint16Array(this.pixelCount);
    this.matteColors = [[0, 0, 0]];
    this.output = new Uint8ClampedArray(this.pixelCount * 4);
    this.scratchFloatA = new Float32Array(this.pixelCount);
    this.scratchFloatB = new Float32Array(this.pixelCount);
    this.scratchByteA = new Uint8Array(this.pixelCount);
    this.scratchByteB = new Uint8Array(this.pixelCount);
    this.backgroundConnected = new Uint8Array(this.pixelCount);
    this.pureBackground = new Uint8Array(this.pixelCount);

    this.detectBackground();
    this.recompute();
  }

  updateParameters(changes) {
    Object.assign(this.parameters, changes);
  }

  detectBackground() {
    this.#assertReady();
    const reds = [];
    const greens = [];
    const blues = [];
    const step = Math.max(1, Math.floor((this.width + this.height) / 1000));

    const addPixel = (index) => {
      const offset = index * 4;
      reds.push(this.original[offset]);
      greens.push(this.original[offset + 1]);
      blues.push(this.original[offset + 2]);
    };

    for (let x = 0; x < this.width; x += step) {
      addPixel(x);
      addPixel((this.height - 1) * this.width + x);
    }
    for (let y = 0; y < this.height; y += step) {
      addPixel(y * this.width);
      addPixel(y * this.width + this.width - 1);
    }

    const median = (values) => {
      const sorted = values.slice().sort((left, right) => left - right);
      return sorted[sorted.length >> 1];
    };

    this.backgroundColor = [median(reds), median(greens), median(blues)];
    let totalDistance = 0;

    for (let index = 0; index < reds.length; index += 1) {
      const redDistance = reds[index] - this.backgroundColor[0];
      const greenDistance = greens[index] - this.backgroundColor[1];
      const blueDistance = blues[index] - this.backgroundColor[2];
      totalDistance += Math.hypot(redDistance, greenDistance, blueDistance);
    }

    this.backgroundVariation = totalDistance / reds.length;
    return {
      color: this.backgroundColor.slice(),
      variation: this.backgroundVariation,
    };
  }

  setBackgroundAt(x, y) {
    this.#assertReady();
    const offset = (y * this.width + x) * 4;
    this.backgroundColor = [
      this.original[offset],
      this.original[offset + 1],
      this.original[offset + 2],
    ];
    return this.backgroundColor.slice();
  }

  recompute() {
    this.#assertReady();
    if (this.parameters.matte !== "uniform") {
      this.output.set(this.original);
      return false;
    }

    this.#computeUniformAlpha();
    this.compose();
    return true;
  }

  compose() {
    this.#assertReady();
    if (this.parameters.matte !== "uniform") {
      this.output.set(this.original);
      return;
    }

    const [backgroundRed, backgroundGreen, backgroundBlue] = this.backgroundColor;
    const strength = this.parameters.spillAmount / 100;
    const reconstructEdge = this.parameters.spill;
    const globalMode = this.parameters.mode === "global";

    for (let index = 0; index < this.pixelCount; index += 1) {
      const offset = index * 4;
      let alpha = this.alpha[index];
      if (this.pureBackground[index] && (globalMode || this.backgroundConnected[index])) {
        alpha = 0;
      }

      const originalAlpha = this.originalAlpha[index] / 255;
      let red = this.original[offset];
      let green = this.original[offset + 1];
      let blue = this.original[offset + 2];

      // C = F·a + B·(1−a)  ⇒  F = (C − B·(1−a)) / a
      if (reconstructEdge && alpha > 0.06 && alpha < 0.97) {
        const inverseAlpha = 1 - alpha;
        red = clamp(
          red + ((red - backgroundRed * inverseAlpha) / alpha - red) * strength,
          0,
          255,
        );
        green = clamp(
          green + ((green - backgroundGreen * inverseAlpha) / alpha - green) * strength,
          0,
          255,
        );
        blue = clamp(
          blue + ((blue - backgroundBlue * inverseAlpha) / alpha - blue) * strength,
          0,
          255,
        );
      }

      let effectiveAlpha = alpha * originalAlpha;
      const manualPaint = this.paint[index];
      if (manualPaint > 0) {
        // La varita guarda su color de fondo local. Así puede aplicar la misma
        // reconstrucción de primer plano que el motor automático en el borde
        // semitransparente, incluso cuando el flood conservó un hueco interior.
        const manualAlpha = 1 - manualPaint;
        const matteKey = this.paintMatteKey[index];
        if (reconstructEdge && matteKey && manualAlpha > 0.06 && manualAlpha < 0.97) {
          const inverseManualAlpha = 1 - manualAlpha;
          const [localBackgroundRed, localBackgroundGreen, localBackgroundBlue] =
            this.matteColors[matteKey];
          red = clamp(
            red +
              ((this.original[offset] - localBackgroundRed * inverseManualAlpha) /
                manualAlpha -
                red) *
                strength,
            0,
            255,
          );
          green = clamp(
            green +
              ((this.original[offset + 1] - localBackgroundGreen * inverseManualAlpha) /
                manualAlpha -
                green) *
                strength,
            0,
            255,
          );
          blue = clamp(
            blue +
              ((this.original[offset + 2] - localBackgroundBlue * inverseManualAlpha) /
                manualAlpha -
                blue) *
                strength,
            0,
            255,
          );
        }
        effectiveAlpha *= 1 - manualPaint;
      } else if (manualPaint < 0) {
        const restoreAmount = -manualPaint;
        effectiveAlpha += (originalAlpha - effectiveAlpha) * restoreAmount;
        red = this.original[offset] * restoreAmount + red * (1 - restoreAmount);
        green = this.original[offset + 1] * restoreAmount + green * (1 - restoreAmount);
        blue = this.original[offset + 2] * restoreAmount + blue * (1 - restoreAmount);
      }

      this.output[offset] = red;
      this.output[offset + 1] = green;
      this.output[offset + 2] = blue;
      this.output[offset + 3] = clamp(Math.round(effectiveAlpha * 255), 0, 255);
    }
  }

  contentBounds() {
    this.#assertReady();
    return findContentBounds(this.output, this.width, this.height);
  }

  clearPaint() {
    this.#assertReady();
    this.paint.fill(0);
    this.paintMatteKey.fill(0);
    this.matteColors = [[0, 0, 0]];
  }

  applyUndo(stroke) {
    if (!stroke) return;
    stroke.forEach((previousValue, index) => {
      // Se aceptan números para mantener compatibilidad con trazos guardados
      // por versiones anteriores del motor.
      if (typeof previousValue === "number") {
        this.paint[index] = previousValue;
        this.paintMatteKey[index] = 0;
        return;
      }
      this.paint[index] = previousValue.paint;
      this.paintMatteKey[index] = previousValue.matteKey;
    });
  }

  stampBrush(centerX, centerY, radius, hardness, tool, stroke) {
    const erase = tool === "erase";
    const radiusSquared = radius * radius;
    const x0 = clamp(Math.floor(centerX - radius), 0, this.width - 1);
    const x1 = clamp(Math.ceil(centerX + radius), 0, this.width - 1);
    const y0 = clamp(Math.floor(centerY - radius), 0, this.height - 1);
    const y1 = clamp(Math.ceil(centerY + radius), 0, this.height - 1);

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const xDistance = x - centerX;
        const yDistance = y - centerY;
        const squaredDistance = xDistance * xDistance + yDistance * yDistance;
        if (squaredDistance > radiusSquared) continue;

        const amount = this.#brushFalloff(Math.sqrt(squaredDistance), radius, hardness);
        if (amount > 0) this.#setPaint(y * this.width + x, amount, erase, stroke);
      }
    }
  }

  magicWand(startX, startY, stroke) {
    this.#assertReady();
    const startOffset = (startY * this.width + startX) * 4;
    const backgroundColor = [
      this.original[startOffset],
      this.original[startOffset + 1],
      this.original[startOffset + 2],
    ];
    const innerThreshold = this.parameters.tolerance;
    const outerThreshold = innerThreshold + Math.max(1, this.parameters.softness);
    const squaredOuterThreshold = outerThreshold * outerThreshold;
    const refinement = this.parameters.sharpness / 100;
    const regionState = this.scratchByteA;
    const pureSelected = this.scratchByteB;
    regionState.fill(0);
    pureSelected.fill(0);

    const stack = new Int32Array(this.pixelCount);
    let stackPointer = 0;
    const startIndex = startY * this.width + startX;
    regionState[startIndex] = 1;
    stack[stackPointer++] = startIndex;

    while (stackPointer) {
      const index = stack[--stackPointer];
      const offset = index * 4;
      const redDistance = this.original[offset] - backgroundColor[0];
      const greenDistance = this.original[offset + 1] - backgroundColor[1];
      const blueDistance = this.original[offset + 2] - backgroundColor[2];

      if (
        redDistance * redDistance +
          greenDistance * greenDistance +
          blueDistance * blueDistance >
        squaredOuterThreshold
      ) {
        regionState[index] = 2;
        continue;
      }

      const x = index % this.width;
      const y = (index / this.width) | 0;
      const push = (neighbor) => {
        if (regionState[neighbor]) return;
        regionState[neighbor] = 1;
        stack[stackPointer++] = neighbor;
      };

      const hasUp = y > 0;
      const hasDown = y < this.height - 1;
      const hasLeft = x > 0;
      const hasRight = x < this.width - 1;
      if (hasLeft) push(index - 1);
      if (hasRight) push(index + 1);
      if (hasUp) push(index - this.width);
      if (hasDown) push(index + this.width);
      if (hasUp && hasLeft) push(index - this.width - 1);
      if (hasUp && hasRight) push(index - this.width + 1);
      if (hasDown && hasLeft) push(index + this.width - 1);
      if (hasDown && hasRight) push(index + this.width + 1);
    }

    const amount = this.scratchFloatB;
    let selectedCount = 0;
    for (let index = 0; index < this.pixelCount; index += 1) {
      if (regionState[index] !== 1) {
        amount[index] = 0;
        continue;
      }

      const offset = index * 4;
      const distance = Math.hypot(
        this.original[offset] - backgroundColor[0],
        this.original[offset + 1] - backgroundColor[1],
        this.original[offset + 2] - backgroundColor[2],
      );
      let subjectAlpha = smoothstep(innerThreshold, outerThreshold, distance);
      if (refinement > 0) {
        subjectAlpha += (smooth01(subjectAlpha) - subjectAlpha) * refinement;
      }
      amount[index] = 1 - subjectAlpha;
      pureSelected[index] = distance <= innerThreshold ? 1 : 0;
      selectedCount += 1;
    }

    // El complemento de erosionar alfa es dilatar la máscara de borrado.
    // Aplicar después el mismo feather hace que la varita sea matemáticamente
    // equivalente al motor automático, pero limitada a esta región conectada.
    if (this.parameters.contraction > 0) {
      this.#dilateFloat(amount, this.parameters.contraction);
    }
    if (this.parameters.feather > 0) {
      this.#boxBlur(amount, this.parameters.feather);
    }

    const matteKey = this.#registerMatteColor(backgroundColor);
    for (let index = 0; index < this.pixelCount; index += 1) {
      if (pureSelected[index]) amount[index] = 1;
      if (amount[index] > 0.004) {
        this.#setPaint(
          index,
          Math.min(amount[index], 1),
          true,
          stroke,
          matteKey,
        );
      }
    }

    return selectedCount;
  }

  #computeUniformAlpha() {
    const [red, green, blue] = this.backgroundColor;
    const innerThreshold = this.parameters.tolerance;
    const outerThreshold = innerThreshold + Math.max(1, this.parameters.softness);
    const refinement = this.parameters.sharpness / 100;

    for (let index = 0; index < this.pixelCount; index += 1) {
      const offset = index * 4;
      const distance = Math.hypot(
        this.original[offset] - red,
        this.original[offset + 1] - green,
        this.original[offset + 2] - blue,
      );
      this.pureBackground[index] = distance <= innerThreshold ? 1 : 0;
      let alpha = smoothstep(innerThreshold, outerThreshold, distance);
      if (refinement > 0) alpha += (smooth01(alpha) - alpha) * refinement;
      this.alpha[index] = alpha;
    }

    if (this.parameters.mode === "flood") this.#floodBackground();
    if (this.parameters.despeckle) this.#despeckle();
    if (this.parameters.contraction > 0) {
      this.#erode(this.alpha, this.parameters.contraction);
    }
    if (this.parameters.feather > 0) this.#boxBlur(this.alpha, this.parameters.feather);
  }

  #floodBackground() {
    const subject = this.scratchByteA;
    const sealed = this.scratchByteB;
    const connected = this.backgroundConnected;

    for (let index = 0; index < this.pixelCount; index += 1) {
      subject[index] = this.alpha[index] > 0.5 ? 1 : 0;
    }
    this.#dilateBytes(subject, sealed, 1);
    connected.fill(0);

    const stack = new Int32Array(this.pixelCount);
    let stackPointer = 0;
    const seed = (index) => {
      if (connected[index] || this.alpha[index] >= 0.5 || sealed[index]) return;
      connected[index] = 1;
      stack[stackPointer++] = index;
    };

    for (let x = 0; x < this.width; x += 1) {
      seed(x);
      seed((this.height - 1) * this.width + x);
    }
    for (let y = 0; y < this.height; y += 1) {
      seed(y * this.width);
      seed(y * this.width + this.width - 1);
    }

    while (stackPointer) {
      const index = stack[--stackPointer];
      const x = index % this.width;
      const y = (index / this.width) | 0;
      const hasUp = y > 0;
      const hasDown = y < this.height - 1;
      const hasLeft = x > 0;
      const hasRight = x < this.width - 1;
      if (hasLeft) seed(index - 1);
      if (hasRight) seed(index + 1);
      if (hasUp) seed(index - this.width);
      if (hasDown) seed(index + this.width);
      if (hasUp && hasLeft) seed(index - this.width - 1);
      if (hasUp && hasRight) seed(index - this.width + 1);
      if (hasDown && hasLeft) seed(index + this.width - 1);
      if (hasDown && hasRight) seed(index + this.width + 1);
    }

    for (let iteration = 0; iteration < 2; iteration += 1) {
      for (let index = 0; index < this.pixelCount; index += 1) {
        if (connected[index] || this.alpha[index] >= 0.85) continue;
        const x = index % this.width;
        const y = (index / this.width) | 0;
        if (
          (x > 0 && connected[index - 1]) ||
          (x < this.width - 1 && connected[index + 1]) ||
          (y > 0 && connected[index - this.width]) ||
          (y < this.height - 1 && connected[index + this.width])
        ) {
          connected[index] = 2;
        }
      }
      for (let index = 0; index < this.pixelCount; index += 1) {
        if (connected[index] === 2) connected[index] = 1;
      }
    }

    for (let index = 0; index < this.pixelCount; index += 1) {
      if (!connected[index]) this.alpha[index] = 1;
    }
  }

  #erode(values, radius) {
    const temporary = this.scratchFloatA;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let minimum = 1;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleX = x + offset;
          if (sampleX >= 0 && sampleX < this.width) {
            minimum = Math.min(minimum, values[y * this.width + sampleX]);
          }
        }
        temporary[y * this.width + x] = minimum;
      }
    }

    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        let minimum = 1;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleY = y + offset;
          if (sampleY >= 0 && sampleY < this.height) {
            minimum = Math.min(minimum, temporary[sampleY * this.width + x]);
          }
        }
        values[y * this.width + x] = minimum;
      }
    }
  }

  #dilateFloat(values, radius) {
    const temporary = this.scratchFloatA;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let maximum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleX = x + offset;
          if (sampleX >= 0 && sampleX < this.width) {
            maximum = Math.max(maximum, values[y * this.width + sampleX]);
          }
        }
        temporary[y * this.width + x] = maximum;
      }
    }

    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        let maximum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleY = y + offset;
          if (sampleY >= 0 && sampleY < this.height) {
            maximum = Math.max(maximum, temporary[sampleY * this.width + x]);
          }
        }
        values[y * this.width + x] = maximum;
      }
    }
  }

  #boxBlur(values, radius) {
    const temporary = this.scratchFloatA;
    const windowSize = 2 * radius + 1;

    for (let y = 0; y < this.height; y += 1) {
      let sum = 0;
      const rowOffset = y * this.width;
      for (let offset = -radius; offset <= radius; offset += 1) {
        sum += values[rowOffset + clamp(offset, 0, this.width - 1)];
      }
      for (let x = 0; x < this.width; x += 1) {
        temporary[rowOffset + x] = sum / windowSize;
        const removeIndex = rowOffset + clamp(x - radius, 0, this.width - 1);
        const addIndex = rowOffset + clamp(x + radius + 1, 0, this.width - 1);
        sum += values[addIndex] - values[removeIndex];
      }
    }

    for (let x = 0; x < this.width; x += 1) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        sum += temporary[clamp(offset, 0, this.height - 1) * this.width + x];
      }
      for (let y = 0; y < this.height; y += 1) {
        values[y * this.width + x] = sum / windowSize;
        const removeIndex = clamp(y - radius, 0, this.height - 1) * this.width + x;
        const addIndex = clamp(y + radius + 1, 0, this.height - 1) * this.width + x;
        sum += temporary[addIndex] - temporary[removeIndex];
      }
    }
  }

  #dilateBytes(source, destination, radius) {
    const temporary = this.scratchFloatB;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let maximum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleX = x + offset;
          if (sampleX >= 0 && sampleX < this.width && source[y * this.width + sampleX]) {
            maximum = 1;
            break;
          }
        }
        temporary[y * this.width + x] = maximum;
      }
    }

    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        let maximum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sampleY = y + offset;
          if (sampleY >= 0 && sampleY < this.height && temporary[sampleY * this.width + x]) {
            maximum = 1;
            break;
          }
        }
        destination[y * this.width + x] = maximum;
      }
    }
  }

  #despeckle() {
    const minimumArea = Math.max(6, Math.round(this.pixelCount * 0.000004) + 6);
    const labels = this.scratchByteA;
    let stack = new Int32Array(1024);

    const processRegions = (isSubject) => {
      labels.fill(0);
      for (let start = 0; start < this.pixelCount; start += 1) {
        const belongsToRegion = isSubject ? this.alpha[start] > 0.5 : this.alpha[start] <= 0.5;
        if (labels[start] || !belongsToRegion) continue;

        let stackPointer = 0;
        stack[stackPointer++] = start;
        labels[start] = 1;
        const component = [start];

        while (stackPointer) {
          const index = stack[--stackPointer];
          const x = index % this.width;
          const y = (index / this.width) | 0;
          const neighbors = [];
          if (x > 0) neighbors.push(index - 1);
          if (x < this.width - 1) neighbors.push(index + 1);
          if (y > 0) neighbors.push(index - this.width);
          if (y < this.height - 1) neighbors.push(index + this.width);

          for (const neighbor of neighbors) {
            const neighborMatches = isSubject
              ? this.alpha[neighbor] > 0.5
              : this.alpha[neighbor] <= 0.5;
            if (!neighborMatches || labels[neighbor]) continue;
            labels[neighbor] = 1;
            if (stackPointer >= stack.length) {
              const expandedStack = new Int32Array(stack.length * 2);
              expandedStack.set(stack);
              stack = expandedStack;
            }
            stack[stackPointer++] = neighbor;
            component.push(neighbor);
          }
        }

        if (component.length < minimumArea) {
          const replacement = isSubject ? 0 : 1;
          for (const index of component) this.alpha[index] = replacement;
        }
      }
    };

    processRegions(true);
    processRegions(false);
  }

  #brushFalloff(distance, radius, hardness) {
    const innerRadius = radius * hardness;
    if (distance <= innerRadius) return 1;
    if (distance >= radius) return 0;
    return smooth01(1 - (distance - innerRadius) / (radius - innerRadius));
  }

  #registerMatteColor(color) {
    const existingKey = this.matteColors.findIndex(
      ([red, green, blue]) => red === color[0] && green === color[1] && blue === color[2],
    );
    if (existingKey > 0) return existingKey;

    // Uint16 reserva 0 para “sin matting”. Es prácticamente inalcanzable en
    // uso real, pero si se agota la paleta reutilizamos el color más próximo.
    if (this.matteColors.length >= 65_535) {
      let nearestKey = 1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let key = 1; key < this.matteColors.length; key += 1) {
        const candidate = this.matteColors[key];
        const distance = Math.hypot(
          candidate[0] - color[0],
          candidate[1] - color[1],
          candidate[2] - color[2],
        );
        if (distance < nearestDistance) {
          nearestKey = key;
          nearestDistance = distance;
        }
      }
      return nearestKey;
    }

    this.matteColors.push(color.slice());
    return this.matteColors.length - 1;
  }

  #setPaint(index, target, erase, stroke, matteKey = 0) {
    if (stroke && !stroke.has(index)) {
      stroke.set(index, {
        paint: this.paint[index],
        matteKey: this.paintMatteKey[index],
      });
    }

    const previousPaint = this.paint[index];
    if (erase) {
      this.paint[index] = Math.max(previousPaint, target);
      if (target < previousPaint) return;

      if (matteKey) {
        this.paintMatteKey[index] = matteKey;
      } else {
        // Un trazo de borrador que domina el píxel no debe heredar el color
        // local de una selección anterior de la varita.
        this.paintMatteKey[index] = 0;
      }
      return;
    }

    this.paint[index] = Math.min(previousPaint, -target);
    if (this.paint[index] < 0) this.paintMatteKey[index] = 0;
  }

  #assertReady() {
    if (!this.ready) throw new Error("Carga una imagen antes de procesarla.");
  }
}
