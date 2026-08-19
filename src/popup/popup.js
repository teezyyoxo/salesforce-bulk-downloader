init();

async function init() {
  const settings = await chrome.storage.sync.get(null);
  setThemePreference(settings.theme || (settings.darkMode ? "dark" : "system"));
}

document.querySelector("#optionsButton").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setThemePreference(theme) {
  const preference = ["light", "system", "dark"].includes(theme) ? theme : "system";
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === "system" ? resolveSystemTheme() : preference;
}

function resolveSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (document.documentElement.dataset.themePreference === "system") {
    document.documentElement.dataset.theme = resolveSystemTheme();
  }
});
