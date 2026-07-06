const DEFAULT_SETTINGS = {
  downloadSubfolder: "Salesforce Files/{accountName} - {caseNumber}",
  filenamePattern: "",
  conflictAction: "uniquify",
  promptForEachDownload: false,
  darkMode: false,
  autoZip: false
};

const form = document.querySelector("#settingsForm");
const saveStatus = document.querySelector("#saveStatus");
const resetButton = document.querySelector("#resetButton");

init();

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  applySettings(settings);
  form.addEventListener("submit", saveSettings);
  form.addEventListener("input", handleInput);
  resetButton.addEventListener("click", resetSettings);
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

  applyTheme(settings.darkMode);
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = readForm();
  await chrome.storage.sync.set(settings);
  setStatus("Saved");
}

async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  applySettings(DEFAULT_SETTINGS);
  setStatus("Saved");
}

function handleInput(event) {
  if (event.target.name === "darkMode") {
    applyTheme(event.target.checked);
  }

  setStatus("Unsaved");
}

function readForm() {
  return {
    downloadSubfolder: form.elements.downloadSubfolder.value.trim() || DEFAULT_SETTINGS.downloadSubfolder,
    filenamePattern: form.elements.filenamePattern.value.trim(),
    conflictAction: form.elements.conflictAction.value,
    promptForEachDownload: form.elements.promptForEachDownload.checked,
    darkMode: form.elements.darkMode.checked,
    autoZip: false
  };
}

function setStatus(text) {
  saveStatus.textContent = text;
}

function applyTheme(darkMode) {
  document.documentElement.dataset.theme = darkMode ? "dark" : "light";
}
