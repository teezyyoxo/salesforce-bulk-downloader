const DEFAULT_SETTINGS = {
  saveLocationName: "Downloads",
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
  const pageContext = { pageRecordName, pageCaseNumberRaw, pageAccountName, recordId: payload?.recordId };
  const locationHandle = await getLocationHandle();

  if (locationHandle) {
    if (await locationHandle.queryPermission({ mode: "readwrite" }) !== "granted") {
      throw new Error("The selected save location is no longer available. Choose it again in settings.");
    }
    const result = { count: files.length, downloadIds: [] };
    void downloadFilesToDirectory(files, settings, pageContext, locationHandle)
      .then((completed) => notifyDownloadStatus(sender?.tab?.id, {
        status: "complete",
        count: completed.count
      }))
      .catch((error) => notifyDownloadStatus(sender?.tab?.id, {
        status: "error",
        error: error.message
      }));
    return result;
  }

  const downloadIds = [];

  for (const [index, file] of files.entries()) {
    const fileInfo = buildFileInfo(file, index, pageContext, payload?.recordId, settings);

    // Register the routing/naming intent before starting the download so the
    // onDeterminingFilename listener can match it and apply the folder without
    // overriding Salesforce's authoritative filename + extension.
    pendingDownloads.set(file.url, {
      folder: fileInfo.folder,
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

  void monitorDownloadBatch(downloadIds, sender?.tab?.id);
  return { count: downloadIds.length, downloadIds };
}

async function monitorDownloadBatch(downloadIds, tabId) {
  const results = await Promise.all(downloadIds.map(waitForDownload));
  const interrupted = results.find((item) => item.state === "interrupted");

  if (interrupted) {
    notifyDownloadStatus(tabId, {
      status: "error",
      error: `A download failed${interrupted.error ? `: ${interrupted.error}` : "."}`
    });
    return;
  }

  notifyDownloadStatus(tabId, {
    status: "complete",
    count: results.length
  });
}

async function waitForDownload(downloadId) {
  const [current] = await chrome.downloads.search({ id: downloadId });
  if (current?.state === "complete" || current?.state === "interrupted") {
    return current;
  }

  return new Promise((resolve) => {
    const listener = async (delta) => {
      if (delta.id !== downloadId || !["complete", "interrupted"].includes(delta.state?.current)) {
        return;
      }

      chrome.downloads.onChanged.removeListener(listener);
      const [finished] = await chrome.downloads.search({ id: downloadId });
      resolve(finished || { id: downloadId, state: delta.state.current });
    };

    chrome.downloads.onChanged.addListener(listener);
  });
}

function notifyDownloadStatus(tabId, status) {
  if (!tabId) {
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: "SFD_DOWNLOAD_STATUS",
    ...status
  }).catch(() => {});
}

async function downloadFilesToDirectory(files, settings, pageContext, rootHandle) {
  const completedFiles = [];

  for (const [index, file] of files.entries()) {
    const fileInfo = buildFileInfo(file, index, pageContext, pageContext.recordId, settings);
    const directoryHandle = await getDirectoryHandle(rootHandle, fileInfo.folder);
    const response = await fetch(file.url, { credentials: "include" });

    if (!response.ok) {
      throw new Error(`Salesforce returned ${response.status} while downloading ${fileInfo.name}.`);
    }

    const serverName = getResponseFileName(response.headers.get("content-disposition"));
    const finalName = resolveFinalName(fileInfo, serverName);
    const targetName = await resolveTargetName(directoryHandle, finalName, settings.conflictAction);
    const outputHandle = await directoryHandle.getFileHandle(targetName, { create: true });
    const writable = await outputHandle.createWritable();

    try {
      await writable.write(await response.arrayBuffer());
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }

    completedFiles.push(targetName);
  }

  return { count: completedFiles.length, downloadIds: [] };
}

function buildFileInfo(file, index, pageContext, recordId, settings) {
  const fileAccountName = sanitizeSegment(file.accountName || file.customerName || pageContext.pageAccountName);
  const fileCaseNumberRaw = sanitizeSegment(file.caseNumberRaw || file.caseNumber || pageContext.pageCaseNumberRaw);
  const fileCaseNumber = sanitizeSegment(trimLeadingZeroes(fileCaseNumberRaw));
  const fileRecordName = sanitizeSegment(file.recordName || pageContext.pageRecordName);
  const folder = renderTemplate(settings.downloadSubfolder, {
    customerName: fileAccountName,
    accountName: fileAccountName,
    caseNumber: fileCaseNumber,
    caseNumberRaw: fileCaseNumberRaw,
    recordName: fileRecordName,
    recordId: file.recordId || recordId || "record"
  });

  return {
    folder,
    keepOriginalName: !String(settings.filenamePattern || "").trim(),
    pattern: settings.filenamePattern,
    file,
    index: index + 1,
    conflictAction: settings.conflictAction,
    name: file.name || `Salesforce-File-${index + 1}`
  };
}

async function getDirectoryHandle(rootHandle, folder) {
  let directoryHandle = rootHandle;
  const segments = String(folder || "")
    .split("/")
    .map(sanitizeSegment)
    .filter(Boolean);

  for (const segment of segments) {
    directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create: true });
  }

  return directoryHandle;
}

async function resolveTargetName(directoryHandle, fileName, conflictAction) {
  if (conflictAction === "overwrite") {
    return fileName;
  }

  if (conflictAction === "prompt" && await fileExists(directoryHandle, fileName)) {
    throw new Error(`A file named ${fileName} already exists. Choose Keep both or Replace existing for this save location.`);
  }

  if (conflictAction !== "uniquify") {
    return fileName;
  }

  const extension = getExtension(fileName);
  const base = extension ? fileName.slice(0, -extension.length - 1) : fileName;
  let candidate = fileName;
  let suffix = 1;

  while (await fileExists(directoryHandle, candidate)) {
    candidate = extension ? `${base} (${suffix}).${extension}` : `${base} (${suffix})`;
    suffix += 1;
  }

  return candidate;
}

async function fileExists(directoryHandle, fileName) {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

function getResponseFileName(contentDisposition) {
  const header = String(contentDisposition || "");
  const encodedMatch = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return basename(decodeURIComponent(encodedMatch[1].trim()));
    } catch {
      return basename(encodedMatch[1].trim());
    }
  }

  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  const plainMatch = header.match(/filename\s*=\s*([^;]+)/i);
  return basename((quotedMatch || plainMatch)?.[1]?.trim() || "");
}

function getLocationHandle() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("salesforce-bulk-downloader", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("settings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("settings", "readonly");
      const getRequest = transaction.objectStore("settings").get("downloadLocation");
      getRequest.onsuccess = () => {
        database.close();
        resolve(getRequest.result || null);
      };
      getRequest.onerror = () => {
        database.close();
        reject(getRequest.error);
      };
    };
  });
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
