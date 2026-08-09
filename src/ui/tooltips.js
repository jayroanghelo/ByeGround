const VIEWPORT_MARGIN = 10;
const TOOLTIP_GAP = 10;

export function computeTooltipPosition(
  anchorRect,
  tooltipSize,
  viewport,
  preferredPlacement = "top",
) {
  const placements = preferredPlacement === "bottom" ? ["bottom", "top"] : ["top", "bottom"];
  const fitsTop = anchorRect.top - TOOLTIP_GAP - tooltipSize.height >= VIEWPORT_MARGIN;
  const fitsBottom =
    anchorRect.bottom + TOOLTIP_GAP + tooltipSize.height <= viewport.height - VIEWPORT_MARGIN;
  let placement = placements[0];
  if (placement === "top" && !fitsTop && fitsBottom) placement = "bottom";
  if (placement === "bottom" && !fitsBottom && fitsTop) placement = "top";

  const centeredLeft = anchorRect.left + anchorRect.width / 2 - tooltipSize.width / 2;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(centeredLeft, viewport.width - tooltipSize.width - VIEWPORT_MARGIN),
  );
  const top = placement === "top"
    ? Math.max(VIEWPORT_MARGIN, anchorRect.top - tooltipSize.height - TOOLTIP_GAP)
    : Math.min(
        viewport.height - tooltipSize.height - VIEWPORT_MARGIN,
        anchorRect.bottom + TOOLTIP_GAP,
      );

  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  const arrowLeft = Math.max(12, Math.min(anchorCenter - left, tooltipSize.width - 12));
  return { left, top, placement, arrowLeft };
}

export function initializeTooltips(root = document) {
  const targets = [...root.querySelectorAll("[data-tooltip]")];
  if (!targets.length) return () => {};

  const tooltip = document.createElement("div");
  tooltip.id = "appTooltip";
  tooltip.className = "floating-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);

  let activeTarget = null;

  const position = () => {
    if (!activeTarget || tooltip.hidden) return;
    const anchorRect = activeTarget.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const coordinates = computeTooltipPosition(
      anchorRect,
      { width: tooltipRect.width, height: tooltipRect.height },
      { width: window.innerWidth, height: window.innerHeight },
      activeTarget.dataset.tooltipPlacement,
    );
    tooltip.dataset.placement = coordinates.placement;
    tooltip.style.left = `${coordinates.left}px`;
    tooltip.style.top = `${coordinates.top}px`;
    tooltip.style.setProperty("--tooltip-arrow-left", `${coordinates.arrowLeft}px`);
  };

  const show = (target) => {
    const copy = target.dataset.tooltip?.trim();
    if (!copy) return;
    activeTarget = target;
    tooltip.textContent = copy;
    tooltip.hidden = false;
    target.setAttribute("aria-describedby", tooltip.id);
    window.requestAnimationFrame(position);
  };

  const hide = (target) => {
    if (target && target !== activeTarget) return;
    activeTarget?.removeAttribute("aria-describedby");
    activeTarget = null;
    tooltip.hidden = true;
  };

  const cleanups = targets.map((target) => {
    const onPointerEnter = () => show(target);
    const onPointerLeave = () => hide(target);
    const onFocus = () => show(target);
    const onBlur = () => hide(target);
    target.addEventListener("pointerenter", onPointerEnter);
    target.addEventListener("pointerleave", onPointerLeave);
    target.addEventListener("focus", onFocus);
    target.addEventListener("blur", onBlur);
    return () => {
      target.removeEventListener("pointerenter", onPointerEnter);
      target.removeEventListener("pointerleave", onPointerLeave);
      target.removeEventListener("focus", onFocus);
      target.removeEventListener("blur", onBlur);
    };
  });

  const onViewportChange = () => position();
  const onKeyDown = (event) => event.key === "Escape" && hide();
  window.addEventListener("resize", onViewportChange);
  document.addEventListener("scroll", onViewportChange, true);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    hide();
    cleanups.forEach((cleanup) => cleanup());
    window.removeEventListener("resize", onViewportChange);
    document.removeEventListener("scroll", onViewportChange, true);
    document.removeEventListener("keydown", onKeyDown);
    tooltip.remove();
  };
}
