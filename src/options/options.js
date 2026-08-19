const DEFAULT_SETTINGS = {
  saveLocationName: "Downloads",
  downloadSubfolder: "Salesforce Files/{accountName} - {caseNumber}",
  filenamePattern: "",
  conflictAction: "uniquify",
  theme: "system",
  toastStartedText: "Started {count} download{plural}.",
  toastCompleteText: "Download complete: {count} file{plural}.",
  toastTextColor: "#ffffff",
  toastBackgroundColor: "#032d60",
  toastTextBackgroundColor: "#032d60",
  toastBorderColor: "#032d60",
  toastBackgroundOpacity: 1,
  toastShadowOpacity: 0.18,
  toastShadowBlur: 24,
  autoZip: false
};

const TOAST_SETTING_DEFAULTS = {
  toastStartedText: DEFAULT_SETTINGS.toastStartedText,
  toastCompleteText: DEFAULT_SETTINGS.toastCompleteText,
  toastTextColor: DEFAULT_SETTINGS.toastTextColor,
  toastBackgroundColor: DEFAULT_SETTINGS.toastBackgroundColor,
  toastTextBackgroundColor: DEFAULT_SETTINGS.toastTextBackgroundColor,
  toastBorderColor: DEFAULT_SETTINGS.toastBorderColor,
  toastBackgroundOpacity: DEFAULT_SETTINGS.toastBackgroundOpacity,
  toastShadowOpacity: DEFAULT_SETTINGS.toastShadowOpacity,
  toastShadowBlur: DEFAULT_SETTINGS.toastShadowBlur
};

const LOCATION_DB_NAME = "salesforce-bulk-downloader";
const LOCATION_STORE_NAME = "settings";
const form = document.querySelector("#settingsForm");
const saveStatus = document.querySelector("#saveStatus");
const resetButton = document.querySelector("#resetButton");
const chooseLocationButton = document.querySelector("#chooseLocationButton");
const resetAllButton = document.querySelector("#resetAllButton");
const themeButtons = [...document.querySelectorAll("[data-theme-choice]")];
const resetSettingButtons = [...document.querySelectorAll("[data-reset-setting]")];
const toastControlTriggers = [...document.querySelectorAll("[data-toast-control]")];
const folderPreview = document.querySelector("#folderPreview");
const filenamePreview = document.querySelector("#filenamePreview");
const startedToastPreview = document.querySelector("#startedToastPreview");
const completeToastPreview = document.querySelector("#completeToastPreview");
const sliderOutputs = [...document.querySelectorAll("[data-output-for]")];
let hasUnsavedChanges = false;
const previewData = {
  accountName: "Some Random Company",
  customerName: "Some Random Company",
  caseNumber: "0012345",
  caseNumberRaw: "0012345",
  recordName: "Some Random Case",
  recordId: "500000000000000AAA",
  index: "01",
  name: "Quarterly Report",
  ext: "pdf"
};

init();

async function init() {
  const storedSettings = await chrome.storage.sync.get(null);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    theme: storedSettings.theme || (storedSettings.darkMode ? "dark" : DEFAULT_SETTINGS.theme)
  };
  applySettings(settings);
  form.addEventListener("submit", saveSettings);
  form.addEventListener("input", handleInput);
  resetButton.addEventListener("click", resetSettings);
  resetAllButton.addEventListener("click", resetAllSettings);
  chooseLocationButton.addEventListener("click", chooseLocation);
  for (const button of resetSettingButtons) {
    button.addEventListener("click", () => resetToastSetting(button.dataset.resetSetting));
  }
  for (const button of toastControlTriggers) {
    button.addEventListener("click", () => toggleToastFlyout(button));
  }
  document.addEventListener("click", closeToastFlyoutsOnOutsideClick);
  window.addEventListener("beforeunload", warnBeforeUnload);
  for (const button of themeButtons) {
    button.addEventListener("click", () => setThemePreference(button.dataset.themeChoice));
  }
  randomizeToastControlDemos();
  updatePreviews();
}

function applySettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements[key];
    if (!field) {
      continue;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value;
    }
  }

  setThemePreference(settings.theme || (settings.darkMode ? "dark" : "system"), false);
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = readForm();
  await chrome.storage.sync.set(settings);
  hasUnsavedChanges = false;
  setStatus("Saved");
}

async function resetSettings() {
  await deleteLocationHandle();
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  applySettings(DEFAULT_SETTINGS);
  updatePreviews();
  hasUnsavedChanges = false;
  setStatus("Saved");
}

async function resetAllSettings() {
  if (!window.confirm("Reset all settings to their defaults?")) {
    return;
  }

  await deleteLocationHandle();
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  applySettings(DEFAULT_SETTINGS);
  updatePreviews();
  hasUnsavedChanges = false;
  setStatus("Saved");
}

async function resetToastSetting(settingName) {
  if (!Object.hasOwn(DEFAULT_SETTINGS, settingName)) {
    return;
  }

  if (!window.confirm(`Reset ${getSettingLabel(settingName)} to its default?`)) {
    return;
  }

  const field = form.elements[settingName];
  field.value = DEFAULT_SETTINGS[settingName];
  updatePreviews();
  hasUnsavedChanges = true;
  setStatus("Unsaved");
}

function getSettingLabel(settingName) {
  return settingName.replace(/^toast/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

function toggleToastFlyout(button) {
  const flyout = document.querySelector(`[data-toast-flyout="${button.dataset.toastControl}"]`);
  const wasOpen = !flyout.hidden;
  closeToastFlyouts();
  if (!wasOpen) {
    flyout.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }
}

function closeToastFlyoutsOnOutsideClick(event) {
  if (!event.target.closest(".toast-control")) {
    closeToastFlyouts();
  }
}

function closeToastFlyouts() {
  for (const button of toastControlTriggers) {
    const flyout = document.querySelector(`[data-toast-flyout="${button.dataset.toastControl}"]`);
    flyout.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
}

function randomizeToastControlDemos() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const demoTextColor = randomColor(isDark ? 75 : 35);
  const demoTextBackground = randomColor(isDark ? 40 : 70);
  const demoBackground = randomColor(isDark ? 40 : 35);
  const demoBorder = randomColor(isDark ? 70 : 35);
    const backgroundOpacity = randomNumber(.35, .95, 2); // Keep this line as is
    const shadowOpacity = .75;
    const shadowBlur = 26;

  setControlDemo("toastTextColor", {
    color: demoTextColor,
    backgroundColor: "var(--panel)"
  });
  setControlDemo("toastTextBackgroundColor", {
    backgroundColor: "var(--panel)",
    backgroundImage: `linear-gradient(${demoTextBackground}, ${demoTextBackground})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "calc(100% - 12px) calc(100% - 10px)",
    color: readableTextColor(demoTextBackground)
  });
  setControlDemo("toastBackgroundColor", {
    backgroundColor: demoBackground,
    color: readableTextColor(demoBackground)
  });
  setControlDemo("toastBorderColor", {
    borderColor: demoBorder,
    color: demoBorder
  });
  setControlDemo("toastBackgroundOpacity", {
    backgroundColor: `rgba(1, 118, 211, ${backgroundOpacity})`,
    color: readableTextColor(`#0176d3`)
  });
  setControlDemo("toastShadowOpacity", {
    boxShadow: `0 6px 16px rgba(0, 0, 0, ${shadowOpacity})`
  });
  setControlDemo("toastShadowBlur", {
    boxShadow: `0 6px ${shadowBlur}px rgba(0, 0, 0, .3)`
  });
}

function setControlDemo(settingName, styles) {
  const button = document.querySelector(`[data-toast-control="${settingName}"]`);
  for (const [property, value] of Object.entries(styles)) {
    button.style[property] = value;
  }
}

function randomColor(lightness) {
  const hue = Math.floor(Math.random() * 360);
  const saturation = Math.floor(randomNumber(55, 85));
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function randomNumber(minimum, maximum, decimals = 0) {
  const value = minimum + Math.random() * (maximum - minimum);
  return Number(value.toFixed(decimals));
}

function readableTextColor(color) {
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.backgroundColor = "transparent";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color.match(/\d+/g)?.map(Number) || [0, 0, 0];
  probe.remove();
  const luminance = (resolved[0] * 299 + resolved[1] * 587 + resolved[2] * 114) / 1000;
  return luminance > 150 ? "#172033" : "#fff";
}

async function chooseLocation() {
  if (!window.showDirectoryPicker) {
    setStatus("Folder picker unavailable");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "salesforce-bulk-downloader",
      mode: "readwrite"
    });
    await verifyPermission(handle);
    await saveLocationHandle(handle);
    await chrome.storage.sync.set({ saveLocationName: handle.name });
    form.elements.saveLocationName.value = handle.name;
    hasUnsavedChanges = true;
    setStatus("Unsaved");
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus("Folder not selected");
    }
  }
}

function handleInput(event) {
  updatePreviews();
  hasUnsavedChanges = true;
  setStatus("Unsaved");
}

function warnBeforeUnload(event) {
  if (!hasUnsavedChanges) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
}

function readForm() {
  const settings = {
    saveLocationName: form.elements.saveLocationName.value,
    downloadSubfolder: form.elements.downloadSubfolder.value.trim() || DEFAULT_SETTINGS.downloadSubfolder,
    filenamePattern: form.elements.filenamePattern.value.trim(),
    conflictAction: form.elements.conflictAction.value,
    theme: getThemePreference(),
    autoZip: false
  };

  for (const settingName of Object.keys(TOAST_SETTING_DEFAULTS)) {
    const value = form.elements[settingName].value;
    settings[settingName] = ["toastBackgroundOpacity", "toastShadowOpacity", "toastShadowBlur"].includes(settingName)
      ? Number(value)
      : value;
  }

  return settings;
}

function openLocationDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCATION_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LOCATION_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocationHandle(handle) {
  const database = await openLocationDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCATION_STORE_NAME, "readwrite");
    transaction.objectStore(LOCATION_STORE_NAME).put(handle, "downloadLocation");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function deleteLocationHandle() {
  const database = await openLocationDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCATION_STORE_NAME, "readwrite");
    transaction.objectStore(LOCATION_STORE_NAME).delete("downloadLocation");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function verifyPermission(handle) {
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") {
    return;
  }
  if (await handle.requestPermission(options) !== "granted") {
    throw new Error("Write permission was not granted.");
  }
}

function setStatus(text) {
  saveStatus.textContent = text;
}

function getThemePreference() {
  return document.documentElement.dataset.themePreference || DEFAULT_SETTINGS.theme;
}

function setThemePreference(theme, markUnsaved = true) {
  const preference = ["light", "system", "dark"].includes(theme) ? theme : DEFAULT_SETTINGS.theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolveTheme(preference);
  updateToastPreviews();
  for (const button of themeButtons) {
    button.classList.toggle("active", button.dataset.themeChoice === preference);
    button.setAttribute("aria-pressed", button.dataset.themeChoice === preference);
  }
  if (markUnsaved) {
    hasUnsavedChanges = true;
    setStatus("Unsaved");
  }
}

function resolveTheme(preference) {
  return preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getThemePreference() === "system") {
    document.documentElement.dataset.theme = resolveTheme("system");
  }
});

function updatePreviews() {
  const folder = renderTemplate(form.elements.downloadSubfolder.value || "Salesforce Files/{accountName} - {caseNumber}");
  const filenamePattern = form.elements.filenamePattern.value.trim();
  const filename = filenamePattern
    ? renderTemplate(filenamePattern)
    : `${previewData.name}.${previewData.ext}`;
  const root = form.elements.saveLocationName.value || "Downloads";
  folderPreview.textContent = buildTree(root, folder, filename);
  filenamePreview.textContent = filename;
  updateToastPreviews();
}

function updateToastPreviews() {
  const count = 3;
  const values = { count, plural: "s" };
  const startedText = renderToastText(form.elements.toastStartedText.value || DEFAULT_SETTINGS.toastStartedText, values);
  const completeText = renderToastText(form.elements.toastCompleteText.value || DEFAULT_SETTINGS.toastCompleteText, values);
  for (const output of sliderOutputs) {
    const field = form.elements[output.dataset.outputFor];
    output.value = field.type === "range" && Number(field.value) < 1 && field.name !== "toastShadowBlur"
      ? Number(field.value).toFixed(2)
      : field.value;
  }

  const style = {
    color: form.elements.toastTextColor.value,
    background: hexToRgba(form.elements.toastBackgroundColor.value, form.elements.toastBackgroundOpacity.value),
    borderColor: form.elements.toastBorderColor.value,
    boxShadow: `0 8px ${form.elements.toastShadowBlur.value}px rgba(0, 0, 0, ${form.elements.toastShadowOpacity.value})`,
    textBackground: form.elements.toastTextBackgroundColor.value
  };
  renderToastPreview(startedToastPreview, startedText, style, false);
  renderToastPreview(completeToastPreview, completeText, style, true);
}

function renderToastPreview(container, text, style, complete) {
  container.replaceChildren();
  const toast = document.createElement("div");
  toast.className = "toast-preview";
  toast.style.color = style.color;
  toast.style.background = style.background;
  toast.style.borderColor = style.borderColor;
  toast.style.boxShadow = style.boxShadow;
  if (complete) {
    const checkmark = document.createElement("span");
    checkmark.className = "toast-preview-check";
    checkmark.setAttribute("aria-hidden", "true");
    toast.appendChild(checkmark);
  }
  const message = document.createElement("span");
  message.className = "toast-preview-message";
  message.style.background = style.textBackground;
  message.textContent = text;
  toast.appendChild(message);
  container.appendChild(toast);
}

function renderToastText(template, values) {
  return String(template).replace(/\{(count|plural)\}/g, (_, key) => values[key] ?? "");
}

function hexToRgba(color, opacity) {
  const match = String(color).match(/^#([a-f\d]{6})$/i);
  if (!match) {
    return `rgba(3, 45, 96, ${opacity})`;
  }
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function renderTemplate(template) {
  return String(template).replace(/\{([a-zA-Z]+)\}/g, (_, key) => previewData[key] ?? `{${key}}`);
}

function buildTree(root, folder, filename) {
  const segments = [root, ...folder.split("/").filter(Boolean), filename];
  return segments.map((segment, index) => `${"  ".repeat(index)}${index === segments.length - 1 ? "└─ " : "├─ "}${segment}`).join("\n");
}
