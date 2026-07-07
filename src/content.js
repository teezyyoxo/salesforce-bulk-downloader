const BUTTON_ID = "sfd-download-all-files";
const FILE_LINK_SELECTORS = [
  'a[href*="/sfc/servlet.shepherd/document/download/"]',
  'a[href*="/sfc/servlet.shepherd/version/download/"]',
  'a[href*="/lightning/r/ContentDocument/"]',
  'a[href*="/lightning/r/ContentVersion/"]'
];

let scanTimer = 0;

boot();

function boot() {
  patchHistoryEvents();
  installButtonWhenReady();
  new MutationObserver(queueInstall).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  window.addEventListener("locationchange", queueInstall);
}

function queueInstall() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(installButtonWhenReady, 250);
}

function installButtonWhenReady() {
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  const filesPanel = findFilesPanel();
  if (!filesPanel) {
    return;
  }

  const actionGroup = filesPanel.querySelector(".forceActionsContainer ul.branding-actions")
    || filesPanel.querySelector("ul.branding-actions")
    || findAddFilesButton(filesPanel)?.closest("ul");

  if (!actionGroup) {
    return;
  }

  actionGroup.appendChild(createButtonItem());
}

function createButtonItem() {
  const item = document.createElement("li");
  item.className = "slds-button slds-button--neutral slds-button_neutral";
  item.id = BUTTON_ID;

  const button = document.createElement("a");
  button.href = "?navigationLocation=RELATED_LIST";
  button.role = "button";
  button.className = "sfd-download-all-button";
  button.title = "Download all visible files";
  const label = document.createElement("div");
  label.title = "Download all visible files";
  label.textContent = "Download All";
  button.appendChild(label);
  button.addEventListener("click", handleDownloadAll);

  item.appendChild(button);
  return item;
}

async function handleDownloadAll(event) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  if (button.getAttribute("aria-disabled") === "true") {
    return;
  }

  button.setAttribute("aria-disabled", "true");

  try {
    const filesPanel = findFilesPanel();
    const files = collectFiles(filesPanel || document);
    const caseNumberRaw = getCaseNumberRaw();
    const accountName = getAccountName();
    const payload = {
      files,
      recordId: getRecordId(),
      recordName: getRecordName(),
      accountName,
      customerName: accountName,
      caseNumber: trimLeadingZeroes(caseNumberRaw),
      caseNumberRaw,
      pageUrl: location.href
    };

    const response = await chrome.runtime.sendMessage({
      type: "SFD_DOWNLOAD_ALL",
      payload
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Download failed.");
    }

    showToast(`Started ${response.count} download${response.count === 1 ? "" : "s"}.`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.setAttribute("aria-disabled", "false");
  }
}

function findFilesPanel() {
  const addFilesButton = findAddFilesButton(document);
  if (addFilesButton) {
    return addFilesButton.closest('[data-component-id], article, .slds-card, .forceRelatedListCardDesktop, records-lwc-related-list')
      || addFilesButton.closest(".slds-grid")
      || document;
  }

  const headings = [...document.querySelectorAll("h1, h2, h3, span, a")];
  const filesHeading = headings.find((node) => cleanText(node.textContent).match(/^files(\s*\(\d+\))?$/i));
  return filesHeading?.closest('[data-component-id], article, .slds-card, .forceRelatedListCardDesktop, records-lwc-related-list') || null;
}

function findAddFilesButton(root) {
  return [...root.querySelectorAll('a[title="Add Files"], a[title="Add File"], button[title="Add Files"], button[title="Add File"]')]
    .find((node) => node.offsetParent !== null);
}

function collectFiles(root) {
  const links = FILE_LINK_SELECTORS
    .flatMap((selector) => [...root.querySelectorAll(selector)])
    .filter((link) => link.offsetParent !== null);

  const filesByUrl = new Map();

  const context = getRecordContext();

  for (const link of links) {
    const downloadUrl = toDownloadUrl(link.href);
    if (!downloadUrl || filesByUrl.has(downloadUrl)) {
      continue;
    }

    filesByUrl.set(downloadUrl, {
      url: downloadUrl,
      name: getFileName(link),
      accountName: context.accountName,
      customerName: context.accountName,
      caseNumber: context.caseNumber,
      caseNumberRaw: context.caseNumberRaw,
      recordName: context.recordName
    });
  }

  return [...filesByUrl.values()];
}

function toDownloadUrl(href) {
  try {
    const url = new URL(href, location.origin);
    const documentMatch = url.pathname.match(/\/ContentDocument\/([a-zA-Z0-9]{15,18})/);
    const versionMatch = url.pathname.match(/\/ContentVersion\/([a-zA-Z0-9]{15,18})/);

    if (url.pathname.includes("/sfc/servlet.shepherd/")) {
      return url.href;
    }

    if (documentMatch) {
      return `${location.origin}/sfc/servlet.shepherd/document/download/${documentMatch[1]}`;
    }

    if (versionMatch) {
      return `${location.origin}/sfc/servlet.shepherd/version/download/${versionMatch[1]}`;
    }
  } catch {
    return "";
  }

  return "";
}

function getFileName(link) {
  const row = link.closest("tr, li, .slds-hint-parent, .slds-grid") || link;
  const titledCandidates = [...row.querySelectorAll('a[title], span[title], lightning-formatted-text[title], [data-file-name], [data-output-element-id="output-field"]')]
    .filter(isVisible)
    .flatMap((node) => [
      node.getAttribute("data-file-name"),
      node.getAttribute("title"),
      node.textContent
    ]);
  const candidates = [
    ...titledCandidates,
    link.getAttribute("download"),
    link.getAttribute("title"),
    link.getAttribute("aria-label"),
    link.textContent
  ];

  const cleanedCandidates = candidates
    .map(cleanFileNameCandidate)
    .filter((candidate) => candidate && !isActionText(candidate) && !isFileTypeText(candidate));

  const extensionCandidate = cleanedCandidates.find(hasFileExtension);
  const fileName = extensionCandidate
    || cleanedCandidates.sort(compareFileNameCandidates)[0]
    || getDownloadFilenameCandidate(link)
    || `Salesforce-File-${getDocumentIdFromUrl(link.href) || Date.now()}`;

  return fileName;
}

function getDownloadFilenameCandidate(link) {
  const candidates = [
    link.getAttribute("download"),
    link.getAttribute("title"),
    link.getAttribute("aria-label")
  ]
    .map(cleanText)
    .filter(Boolean);

  return candidates.find(hasFileExtension)
    || candidates.find((candidate) => !isActionText(candidate) && !isFileTypeText(candidate))
    || "";
}

function getRecordId() {
  const match = location.pathname.match(/\/([a-zA-Z0-9]{15,18})(?:\/|$)/);
  return match?.[1] || "";
}

function getRecordName() {
  const title = document.querySelector(".entityNameTitle")?.nextElementSibling?.textContent
    || document.querySelector("records-highlights2 h1")?.textContent
    || document.querySelector("h1")?.textContent
    || document.title;

  return stripFieldActionText(cleanText(title).replace(/\s+\|.*$/, ""));
}

function getAccountName() {
  return stripFieldActionText(getRecordFieldValue(["Account Name", "Account"]) || getRecordName());
}

function getRecordContext() {
  const caseNumberRaw = getCaseNumberRaw();
  const accountName = getAccountName();
  const recordName = getRecordName();

  return {
    accountName,
    caseNumber: trimLeadingZeroes(caseNumberRaw),
    caseNumberRaw,
    recordName
  };
}

function getCaseNumberRaw() {
  return stripFieldActionText(getRecordFieldValue(["Case Number", "Case #", "Case"]) || getCaseNumberFromLabelText() || getCaseNumberFromPageText() || getCaseNumberFromTitle());
}

function getRecordFieldValue(labels) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const fieldFromLabelNode = getRecordFieldValueFromLabelNode(normalizedLabels);
  if (fieldFromLabelNode) {
    return fieldFromLabelNode;
  }

  const fieldRoots = [...document.querySelectorAll("records-record-layout-item, lightning-output-field, .slds-form-element, dl, [field-label], [data-field-label], [data-label]")]
    .filter((node) => isVisible(node) && fieldRootMatchesLabel(node, normalizedLabels));

  for (const fieldRoot of fieldRoots) {
    const fieldValue = readFieldRootValue(fieldRoot, normalizedLabels);
    if (fieldValue) {
      return fieldValue;
    }
  }

  return "";
}

function fieldRootMatchesLabel(fieldRoot, normalizedLabels) {
  const attributeLabel = cleanText(
    fieldRoot.getAttribute("field-label")
    || fieldRoot.getAttribute("data-field-label")
    || fieldRoot.getAttribute("data-label")
  ).replace(/:$/, "").toLowerCase();

  if (normalizedLabels.includes(attributeLabel)) {
    return true;
  }

  const labelText = cleanText(
    fieldRoot.querySelector(".test-id__field-label, .slds-form-element__label, label, dt")?.textContent
  ).replace(/:$/, "").toLowerCase();

  if (normalizedLabels.includes(labelText)) {
    return true;
  }

  return false;
}

function readFieldRootValue(fieldRoot, normalizedLabels) {
  const definitionText = fieldRoot.tagName.toLowerCase() === "dl"
    ? readDefinitionListValue(fieldRoot, normalizedLabels)
    : "";
  if (definitionText) {
    return definitionText;
  }

  const valueNodes = [...fieldRoot.querySelectorAll(
    '[slot="outputField"], [data-output-element-id="output-field"], lightning-formatted-text, lightning-formatted-number, lightning-formatted-url a, .slds-form-element__control a, .slds-form-element__control lightning-formatted-text, .slds-form-element__control span'
  )];
  const valueText = valueNodes
    .map(cleanFieldValue)
    .find((value) => value && !normalizedLabels.includes(value.replace(/:$/, "").toLowerCase()));

  if (valueText) {
    return valueText;
  }

  return "";
}

function getRecordFieldValueFromLabelNode(normalizedLabels) {
  const labelNodes = [...document.querySelectorAll(".test-id__field-label, .slds-form-element__label, label, dt, span")]
    .filter((node) => isVisible(node) && normalizedLabels.includes(cleanText(node.textContent).replace(/:$/, "").toLowerCase()));

  for (const labelNode of labelNodes) {
    const fieldRoot = findFieldRootForLabel(labelNode);
    const value = fieldRoot ? readFieldRootValue(fieldRoot, normalizedLabels) : "";
    if (value) {
      return value;
    }
  }

  return "";
}

function findFieldRootForLabel(labelNode) {
  const directRoot = labelNode.closest("records-record-layout-item, lightning-output-field, .slds-form-element, dl");
  if (directRoot) {
    return directRoot;
  }

  let current = labelNode.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current.querySelector('[slot="outputField"], [data-output-element-id="output-field"], .slds-form-element__control')) {
      return current;
    }
    current = current.parentElement;
  }

  return labelNode.parentElement;
}

function readDefinitionListValue(fieldRoot, normalizedLabels) {
  const terms = [...fieldRoot.querySelectorAll("dt")];
  for (const term of terms) {
    const termText = cleanText(term.textContent).replace(/:$/, "").toLowerCase();
    if (!normalizedLabels.includes(termText)) {
      continue;
    }

    const value = cleanText(term.nextElementSibling?.textContent);
    if (value) {
      return value;
    }
  }

  return "";
}

function getCaseNumberFromLabelText() {
  const labels = [...document.querySelectorAll('span, label, div, p, lightning-formatted-text, lightning-formatted-number, lightning-formatted-url, .slds-form-element__control, .test-id__field-label')]
    .filter(isVisible)
    .map((node) => cleanText(node.textContent));

  for (const text of labels) {
    const match = text.match(/(?:case(?:\s*number|\s*#)?)(?:\s*[:\-–—])?\s*(0*\d{3,})/i)
      || text.match(/\b0*\d{3,}\b/);
    if (match) {
      return match[1] || match[0];
    }
  }

  return "";
}

function getCaseNumberFromPageText() {
  const pageText = cleanText(document.body.innerText || "");
  const match = pageText.match(/(?:case(?:\s*number|\s*#)?)(?:\s*[:\-–—])?\s*(0*\d{3,})/i)
    || pageText.match(/\b0*\d{3,}\b/);
  return match?.[1] || match?.[0] || "";
}

function getCaseNumberFromTitle() {
  const title = document.title;
  const match = title.match(/(?:case(?:\s*#)?\s*)(0*\d{3,})/i)
    || title.match(/\b0*\d{3,}\b/);
  return match?.[1] || match?.[0] || "";
}

function trimLeadingZeroes(value) {
  return String(value || "").trim().replace(/^0+(?=\d)/, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanFieldValue(node) {
  if (!node) {
    return "";
  }

  const attributeValue = [
    node.getAttribute("title"),
    node.getAttribute("aria-label"),
    node.getAttribute("data-value")
  ]
    .map(stripFieldActionText)
    .find((value) => value && !isActionText(value));

  if (attributeValue) {
    return attributeValue;
  }

  const clone = node.cloneNode(true);
  clone.querySelectorAll("button, lightning-button-icon, lightning-primitive-icon, .slds-assistive-text")
    .forEach((child) => child.remove());

  return stripFieldActionText(clone.textContent);
}

function stripFieldActionText(value) {
  return cleanText(value)
    .replace(/^(?:Preview|Download|Open)(?:\s+record)?(?:\s+in\s+new\s+window)?(?:[\s:–—\-\.]+)?/i, "")
    .replace(/(?:[\s:–—\-\.]*)?(?:Preview|Download|Open)(?:\s+record)?(?:\s+in\s+new\s+window)?(?:[\s:–—\-\.]*)?$/i, "")
    .trim();
}

function cleanFileNameCandidate(value) {
  const original = cleanText(value);
  if (hasFileExtension(original)) {
    return original;
  }

  const cleaned = original
    .replace(/^(?:Preview|Download)\s+/i, "")
    .replace(/(?:[\s:–—\-\.]*)?(?:Preview|Download)(?:[\s:–—\-\.]*)?$/i, "")
    .trim();

  return cleaned || original;
}

function isActionText(value) {
  return /^(preview|download|open|show more|more actions)$/i.test(cleanText(value));
}

function isFileTypeText(value) {
  return /^(adobe pdf|pdf|word document|microsoft word|excel spreadsheet|microsoft excel|powerpoint presentation|microsoft powerpoint|image|png image|jpeg image)$/i.test(cleanText(value));
}

function compareFileNameCandidates(left, right) {
  return scoreFileNameCandidate(right) - scoreFileNameCandidate(left);
}

function scoreFileNameCandidate(value) {
  let score = 0;
  if (hasFileExtension(value)) {
    score += 100;
  }
  if (/[._-]/.test(value)) {
    score += 10;
  }
  if (/\s/.test(value)) {
    score += 2;
  }
  if (/^(adobe pdf|pdf|word document|microsoft word|excel spreadsheet|microsoft excel)/i.test(value)) {
    score -= 25;
  }
  return score;
}

function hasFileExtension(value) {
  return /\.[a-zA-Z0-9]{1,12}$/.test(cleanText(value));
}

function inferExtensionFromTypePrefix(value) {
  const text = cleanText(value);
  if (/^(?:Adobe PDF|PDF)/i.test(text)) {
    return "pdf";
  }
  if (/^(?:Word document|Microsoft Word)/i.test(text)) {
    return "docx";
  }
  if (/^(?:Excel spreadsheet|Microsoft Excel)/i.test(text)) {
    return "xlsx";
  }
  if (/^(?:PowerPoint presentation|Microsoft PowerPoint)/i.test(text)) {
    return "pptx";
  }
  if (/^PNG image/i.test(text)) {
    return "png";
  }
  if (/^JPEG image/i.test(text)) {
    return "jpg";
  }
  return "";
}

function getDocumentIdFromUrl(href) {
  try {
    const url = new URL(href, location.origin);
    const match = url.pathname.match(/\/(?:ContentDocument|ContentVersion)\/([a-zA-Z0-9]{15,18})/)
      || url.pathname.match(/\/download\/([a-zA-Z0-9]{15,18})/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function isVisible(node) {
  return Boolean(node?.offsetParent || node?.getClientRects().length);
}

function showToast(message, tone = "info") {
  const existing = document.querySelector(".sfd-download-all-toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.className = "sfd-download-all-toast";
  toast.dataset.tone = tone;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), tone === "error" ? 7000 : 3500);
}

function patchHistoryEvents() {
  if (window.__sfdDownloadAllHistoryPatched) {
    return;
  }

  window.__sfdDownloadAllHistoryPatched = true;

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
      return result;
    };
  }

  window.addEventListener("popstate", () => window.dispatchEvent(new Event("locationchange")));
}
