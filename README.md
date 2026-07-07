# Salesforce Bulk File Downloader

A Manifest V3 Chrome extension that adds a native-looking **Download All** button to Salesforce Lightning Files related lists. See roadmap for current development status.

## Load locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## How it works

- The content script looks for a visible Salesforce Files related list and appends **Download All** beside the standard **Add Files** action.
- When clicked, it collects visible Salesforce file links and converts ContentDocument/ContentVersion record links into Salesforce Shepherd download URLs.
- The background service worker starts the downloads through `chrome.downloads`, which keeps Salesforce session cookies attached.

## Current limits

- Chrome can only save into the browser's configured Downloads location or a relative subfolder inside it.
- The extension downloads files individually. Auto-zip is represented in settings as a disabled roadmap option.
- It downloads files that are present in the current Files list DOM. If Salesforce lazy-loads more rows, scroll/load them first.

## Current issues

| Issue | Status | Notes |
| --- | --- | --- |
| Files from the wrong Salesforce case can be routed into another case's folder when multiple case tabs are open | In progress | Root cause appears to be record metadata extraction from the wrong DOM scope; fixing per-file context and panel scoping. |
| Case folder names may fall back to `Files - {caseNumber}` instead of customer/account when account extraction fails | In progress | Ensuring account name is sourced correctly from the page-level record context before folder rendering. |

## Settings

Open the extension popup and choose **Open settings** to customize:

- Downloads subfolder, relative to Chrome Downloads
- Filename pattern, optionally blank to keep original filenames
- Existing-file behavior
- Whether Chrome prompts for each download

Supported tokens include 
```
{accountName}
{customerName}
{caseNumber}
{caseNumberRaw}
{recordName}
{recordId}
{index}
{name}
{ext}
```
... depending on the field.

For Case downloads, a folder pattern such as `Salesforce Files/{accountName} - {caseNumber}` produces names like `Salesforce Files/ABC Company - 36258`. The `{caseNumber}` token reads the Salesforce UI label `Case Number` and trims leading zeroes.
Use `{caseNumberRaw}` if you need the original Salesforce value, such as `00065655`. The `{customerName}` token is kept as an alias for `{accountName}`.
**Have not tested this on Account -> Files pages yet.**

Leave the filename pattern blank to download files with their original Salesforce filenames and extensions as shown in the Files list when possible.

### Regression test

A lightweight regression script is included at `test-regression.js` and verifies Salesforce action-text cleanup plus filename preservation.

## Roadmap

| ID | Idea | Status | Notes |
| --- | --- | --- | --- |
| TD-001 | Save downloads into an account/case folder naming convention | Done | Fixed folder naming by adding a dedicated account extraction helper, stripping Salesforce action text such as `Preview`, `Download`, and `Open`, improving Case Number detection, and preserving original Salesforce download filenames and extensions. |
| TD-002 | Auto-zip all selected Salesforce files | Planned | Likely needs a temporary download/package step before placing the archive in Downloads. |
| TD-003 | Expand settings for default folder and filename templates | In progress | Current settings support subfolder and filename patterns; future work can add richer Salesforce record tokens. |
| TD-004 | Improve Salesforce file discovery across more Files tab layouts | Planned | Validate against Account, Case, and other object related lists, including lazy-loaded rows. |
| TD-005 | Add download progress and completion feedback | Planned | Surface active, completed, and failed downloads in the popup or page toast. |
| TD-006 | Package extension for release | Planned | Add icons, screenshots, release packaging, and Chrome Web Store metadata. |

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
