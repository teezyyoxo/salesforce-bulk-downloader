const DEFAULT_SETTINGS = {
  downloadSubfolder: "Salesforce Files/{accountName} - {caseNumber}",
  filenamePattern: "",
  conflictAction: "uniquify",
  promptForEachDownload: false,
  autoZip: false
};
const LEGACY_DEFAULT_DOWNLOAD_SUBFOLDER = "Salesforce Files/{recordName}";
const PLACEHOLDER_DEFAULT_DOWNLOAD_SUBFOLDER = "Salesforce Files/{customerName} - {caseNumber}";
const LEGACY_DEFAULT_FILENAME_PATTERN = "{index}-{name}";

chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const next = { ...DEFAULT_SETTINGS, ...current };

  if (
    details.reason === "update"
    && [
      LEGACY_DEFAULT_DOWNLOAD_SUBFOLDER,
      PLACEHOLDER_DEFAULT_DOWNLOAD_SUBFOLDER
    ].includes(current.downloadSubfolder)
  ) {
    next.downloadSubfolder = DEFAULT_SETTINGS.downloadSubfolder;
  }

  if (details.reason === "update" && current.filenamePattern === LEGACY_DEFAULT_FILENAME_PATTERN) {
    next.filenamePattern = DEFAULT_SETTINGS.filenamePattern;
  }

  await chrome.storage.sync.set(next);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SFD_DOWNLOAD_ALL") {
    return false;
  }

  downloadAllFiles(message.payload, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function downloadAllFiles(payload, sender) {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const files = Array.isArray(payload?.files) ? payload.files : [];

  if (!files.length) {
    throw new Error("No downloadable Salesforce files were found on this Files tab.");
  }

  if (settings.autoZip) {
    throw new Error("Auto-zip is reserved for a future version.");
  }

  const tabUrl = sender?.tab?.url || payload?.pageUrl || "";
  const pageRecordName = sanitizeSegment(payload?.recordName || getRecordNameFromUrl(tabUrl) || "Salesforce Record");
  const pageCaseNumberRaw = sanitizeSegment(payload?.caseNumberRaw || payload?.caseNumber || "");
  const pageCaseNumber = sanitizeSegment(trimLeadingZeroes(pageCaseNumberRaw));
  const pageAccountName = sanitizeSegment(payload?.accountName || payload?.customerName || pageRecordName);

  const downloadIds = [];

  for (const [index, file] of files.entries()) {
    const fileAccountName = sanitizeSegment(file.accountName || file.customerName || pageAccountName);
    const fileCaseNumberRaw = sanitizeSegment(file.caseNumberRaw || file.caseNumber || pageCaseNumberRaw);
    const fileCaseNumber = sanitizeSegment(trimLeadingZeroes(fileCaseNumberRaw));
    const fileRecordName = sanitizeSegment(file.recordName || pageRecordName);
    const subfolder = renderTemplate(settings.downloadSubfolder, {
      customerName: fileAccountName,
      accountName: fileAccountName,
      caseNumber: fileCaseNumber,
      caseNumberRaw: fileCaseNumberRaw,
      recordName: fileRecordName,
      recordId: file.recordId || payload?.recordId || "record"
    });

    const fileName = buildFilename(settings.filenamePattern, file, index + 1);
    const filename = joinDownloadPath(subfolder, fileName);

    const downloadId = await chrome.downloads.download({
      url: file.url,
      filename,
      conflictAction: settings.conflictAction,
      saveAs: Boolean(settings.promptForEachDownload)
    });

    downloadIds.push(downloadId);
  }

  return { count: downloadIds.length, downloadIds };
}

function buildFilename(pattern, file, index) {
  if (!String(pattern || "").trim()) {
    return sanitizeFileName(file.name || `Salesforce-File-${index}`);
  }

  const fallbackName = `Salesforce-File-${index}`;
  const originalName = sanitizeFileName(file.name || fallbackName);
  const extension = getExtension(originalName);
  const baseName = extension ? originalName.slice(0, -extension.length - 1) : originalName;

  const rendered = renderTemplate(pattern || DEFAULT_SETTINGS.filenamePattern, {
    index: String(index).padStart(2, "0"),
    name: baseName || fallbackName,
    ext: extension,
    customerName: file.accountName || file.customerName || "",
    accountName: file.accountName || file.customerName || "",
    caseNumber: trimLeadingZeroes(file.caseNumberRaw || file.caseNumber || ""),
    caseNumberRaw: file.caseNumberRaw || file.caseNumber || "",
    recordName: file.recordName || ""
  });

  const safeRendered = sanitizeFileName(rendered || fallbackName);
  return extension && !safeRendered.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? `${safeRendered}.${extension}`
    : safeRendered;
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z]+)\}/g, (_, key) => values[key] ?? "");
}

function joinDownloadPath(folder, fileName) {
  const safeFolder = String(folder || "")
    .split("/")
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("/");

  return safeFolder ? `${safeFolder}/${fileName}` : fileName;
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function sanitizeSegment(value) {
  return sanitizeFileName(value).replace(/^\.+$/, "").slice(0, 80);
}

function getExtension(fileName) {
  const match = String(fileName).match(/\.([a-zA-Z0-9]{1,12})$/);
  return match?.[1] || "";
}

function getRecordNameFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    const recordIndex = parts.findIndex((part) => part === "r");
    return recordIndex >= 0 ? parts[recordIndex + 2] : "";
  } catch {
    return "";
  }
}

function trimLeadingZeroes(value) {
  const text = String(value || "").trim();
  return text.replace(/^0+(?=\d)/, "");
}
