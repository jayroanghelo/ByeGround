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
    icon.textContent = theme === "dark" ? "☾" : "☀";

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
