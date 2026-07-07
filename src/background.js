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

// Salesforce serves each file's real name and extension in the download
// response's Content-Disposition header. Chrome surfaces that as
// downloadItem.filename here, which lets us keep the authoritative filename
// (extension included) while still routing the file into our folder. The
// Files-list DOM only exposes a generic doctype icon, so this is the only
// reliable source of the extension for images, ZIPs, and other files whose
// Salesforce title has no extension.
const pendingDownloads = new Map();

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const info = pendingDownloads.get(downloadItem.url)
    || pendingDownloads.get(downloadItem.finalUrl);

  if (!info) {
    return;
  }

  pendingDownloads.delete(downloadItem.url);
  pendingDownloads.delete(downloadItem.finalUrl);

  const serverName = basename(downloadItem.filename);
  const finalName = resolveFinalName(info, serverName);

  suggest({
    filename: joinDownloadPath(info.folder, finalName),
    conflictAction: info.conflictAction
  });
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
  const pageAccountName = sanitizeSegment(payload?.accountName || payload?.customerName || pageRecordName);
  const keepOriginalName = !String(settings.filenamePattern || "").trim();

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

    // Register the routing/naming intent before starting the download so the
    // onDeterminingFilename listener can match it and apply the folder without
    // overriding Salesforce's authoritative filename + extension.
    pendingDownloads.set(file.url, {
      folder: subfolder,
      keepOriginalName,
      pattern: settings.filenamePattern,
      file,
      index: index + 1,
      conflictAction: settings.conflictAction
    });

    // No `filename` here on purpose: passing one would make Chrome report our
    // scraped name (extension-less) back to the listener instead of the
    // server-provided one.
    const downloadId = await chrome.downloads.download({
      url: file.url,
      conflictAction: settings.conflictAction,
      saveAs: Boolean(settings.promptForEachDownload)
    });

    downloadIds.push(downloadId);
  }

  return { count: downloadIds.length, downloadIds };
}

function resolveFinalName(info, serverName) {
  const { file, index } = info;
  const fallbackBase = `Salesforce-File-${index}`;
  const scrapedName = sanitizeFileName(file.name || "");

  if (info.keepOriginalName) {
    // Prefer Salesforce's own filename (correct extension guaranteed); fall
    // back to the scraped title plus the doctype-icon extension hint.
    if (serverName) {
      return serverName;
    }
    return ensureExtension(scrapedName || fallbackBase, file.ext);
  }

  const extension = getExtension(serverName) || getExtension(scrapedName) || file.ext || "";
  const originalBase = extension && scrapedName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
    ? scrapedName.slice(0, -extension.length - 1)
    : scrapedName;

  const rendered = renderTemplate(info.pattern || DEFAULT_SETTINGS.filenamePattern, {
    index: String(index).padStart(2, "0"),
    name: originalBase || fallbackBase,
    ext: extension,
    customerName: file.accountName || file.customerName || "",
    accountName: file.accountName || file.customerName || "",
    caseNumber: trimLeadingZeroes(file.caseNumberRaw || file.caseNumber || ""),
    caseNumberRaw: file.caseNumberRaw || file.caseNumber || "",
    recordName: file.recordName || ""
  });

  return ensureExtension(sanitizeFileName(rendered || fallbackBase), extension);
}

function ensureExtension(name, extension) {
  const safeName = sanitizeFileName(name);
  const ext = String(extension || "").replace(/^\.+/, "");
  if (!ext) {
    return safeName;
  }
  return safeName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
    ? safeName
    : `${safeName}.${ext}`;
}

function basename(value) {
  return String(value || "").split(/[\\/]/).pop() || "";
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
