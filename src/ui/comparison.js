import { clamp } from "../core/math.js";

export function initializeComparison(container, handle) {
  let split = 50;
  let dragging = false;

  const setSplit = (percentage) => {
    split = clamp(percentage, 0, 100);
    container.style.setProperty("--split", `${split}%`);
    handle.setAttribute("aria-valuenow", Math.round(split));
  };

  const setFromClientX = (clientX) => {
    const bounds = container.getBoundingClientRect();
    if (bounds.width) setSplit(((clientX - bounds.left) / bounds.width) * 100);
  };

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (dragging) setFromClientX(event.clientX);
  });

  const finishDrag = (event) => {
    dragging = false;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      // La captura puede haberse liberado si el puntero salió de la ventana.
    }
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("keydown", (event) => {
    const actions = {
      ArrowLeft: () => setSplit(split - 2),
      ArrowRight: () => setSplit(split + 2),
      Home: () => setSplit(0),
      End: () => setSplit(100),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  setSplit(50);
  return { reset: () => setSplit(50) };
}
