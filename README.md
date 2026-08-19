# Salesforce Bulk File Downloader

A Manifest V3 Chrome extension that adds a native-looking **Download All** button to Salesforce Lightning Files related lists. See roadmap for current development status.

<img width="236" height="90" alt="image" src="https://github.com/user-attachments/assets/268eeec6-e695-4bff-89b5-56b8b6f642b8" />

## How to use

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## How it works

- The content script looks for a visible Salesforce Files related list and appends **Download All** beside the standard **Add Files** action.
- When clicked, it collects visible Salesforce file links and converts ContentDocument/ContentVersion record links into Salesforce Shepherd download URLs.
- The background service worker starts the downloads through `chrome.downloads`, which keeps Salesforce session cookies attached.

## Features

- **Batch downloading** – Download multiple Salesforce files at once with a single click
- **Intelligent duplicate detection** – Autonomously identifies and ignores actual duplicates during the download flow to prevent redundant file copies
- **Flexible naming** – Customize downloaded filenames with template patterns (account name, case number, custom tokens, etc.) or keep original Salesforce filenames
- **Organized folders** – Group downloads into folders by account/case naming conventions
- **Session preservation** – Downloads maintain Salesforce session cookies for seamless authentication
- **Customizable behavior** – Choose any save location, configure case-folder and filename patterns, and control duplicate handling through extension settings

## Current limits

- The selected save location is granted through Chrome's File System Access API. If no location is selected, downloads use Chrome's configured Downloads folder.
- The extension downloads files individually. Auto-zip is represented in settings as a disabled roadmap option.
- It downloads files that are present in the current Files list DOM. If Salesforce lazy-loads more rows, scroll/load them first.

## Current issues

No known open issues. The account/case folder naming and filename/extension issues previously tracked here were resolved in 0.4.0 (see [CHANGELOG.md](CHANGELOG.md) and roadmap item `TD-001`).

## Settings

Open the extension popup and choose **Open settings** to customize:

- Save location, selected with the Browse button; use **Use Downloads Folder** to restore Chrome's default Downloads root
- Case download folder, relative to the selected save location
- Filename pattern, optionally blank to keep original filenames
- Existing-file behavior
- Theme preference: Light, System, or Dark

The case-folder and filename fields show live previews using representative Salesforce data. Chrome intentionally does not expose the absolute filesystem path behind a selected directory handle, so the Save location field displays the selected folder name rather than a full path.

The selected folder is persisted as a directory permission handle. If that permission is revoked, choose the folder again in settings. With a selected location, **Ask every time** cannot open an interactive conflict dialog from the service worker; use **Keep both** or **Replace existing** instead. **Use Downloads Folder** clears the custom handle and restores the root `~/Downloads` destination on macOS/Linux; it is never inferred from a downloaded file's subfolder. The `0.4.2` release contains this Downloads-root correction and button refinement.

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

Leave the filename pattern blank to download files with their original Salesforce filenames and extensions. The name is taken from Salesforce's own download response (`Content-Disposition`), so file extensions are preserved even for images and ZIPs whose title in the Files list has no extension.

### Regression test

A lightweight regression script is included at `test-regression.js` and verifies Salesforce action-text cleanup plus filename preservation.

## Roadmap

| ID | Idea | Status | Notes |
| --- | --- | --- | --- |
| TD-001 | Save downloads into an account/case folder naming convention | Done (verified 0.4.0) | Confirmed working. Folder naming uses account/case extraction scoped to the active Console workspace tab (`.oneWorkspace`) to prevent cross-case contamination, and filenames/extensions are preserved by reading Salesforce's own download response (`Content-Disposition`) rather than scraping the Files list. |
| TD-002 | Auto-zip all selected Salesforce files | Planned | Likely needs a temporary download/package step before placing the archive in Downloads. |
| TD-003 | Expand settings for default folder and filename templates | Done (verified 0.4.1) | Settings support a filesystem save location, case-folder templates, filename patterns, and Salesforce record tokens. |
| TD-004 | Improve Salesforce file discovery across more Files tab layouts | Planned | Validate against Account, Case, and other object related lists, including lazy-loaded rows. |
| TD-005 | Add download progress and completion feedback | Planned | Surface active, completed, and failed downloads in the popup or page toast. |
| TD-006 | Package extension for release | Planned | Add icons, screenshots, release packaging, and Chrome Web Store metadata. |

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
