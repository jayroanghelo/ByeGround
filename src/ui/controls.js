export function getElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No se encontró el elemento requerido #${id}.`);
  return element;
}

export function createRadioGroup(element, onChange) {
  const buttons = [...element.querySelectorAll("button")];
  element.setAttribute("role", "radiogroup");

  const selectButton = (selected, shouldFocus) => {
    buttons.forEach((button) => {
      const isSelected = button === selected;
      button.classList.toggle("active", isSelected);
      button.setAttribute("aria-checked", String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
    });

    if (shouldFocus) selected.focus();
    onChange(selected.dataset.value);
  };

  buttons.forEach((button, index) => {
    const isSelected = button.classList.contains("active");
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;

    button.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (index + 1) % buttons.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (index - 1 + buttons.length) % buttons.length;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      selectButton(buttons[nextIndex], true);
    });

    button.addEventListener("click", () => selectButton(button, false));
  });

  return {
    select(value) {
      const button = buttons.find((candidate) => candidate.dataset.value === value);
      if (button) selectButton(button, false);
    },
  };
}

export function setStatus(element, text, kind = "") {
  element.textContent = text || "";
  element.className = `status${kind ? ` ${kind}` : ""}`;
}
