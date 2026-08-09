const STORAGE_KEY = "byeground-theme";

function getPreferredTheme() {
  try {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  } catch {
    // El almacenamiento puede estar deshabilitado; la preferencia del sistema sigue disponible.
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initializeTheme(toggle, icon) {
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const use = icon.querySelector("use");
    use?.setAttribute("href", theme === "dark" ? "#icon-moon" : "#icon-sun");
    toggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Cambiar al tema claro" : "Cambiar al tema oscuro",
    );

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // El tema funciona aunque no pueda persistirse.
    }
  };

  applyTheme(getPreferredTheme());
  toggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
}
