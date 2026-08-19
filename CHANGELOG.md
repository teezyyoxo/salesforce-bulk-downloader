# Changelog

All notable changes to this project will be documented in this file.

## [0.4.1] - 2026-08-19

- Bumped the extension version to `0.4.1`.

### Added

- Added a **Save location** folder picker with persistent directory-handle storage through the File System Access API, allowing users to select folders outside Chrome's Downloads directory.
- Added Light, System, and Dark theme choices to the options page, using a sun, Auto, and moon control. The popup reflects the saved theme without exposing its own toggle.
- Added live filesystem-style previews for case folder groupings and filename patterns, including representative Salesforce test values and bulleted placeholder lists.
- Added a GitHub repository button with the GitHub Cat mark to the options page.
- Added a native browser warning when closing the options page with unsaved changes.
- Added live preview for toast notifications and a control toolbar with flyouts for toast appearance settings.
- Added randomized visual demo styling to the toast control buttons on each options-page load, without changing saved configuration values.
- Refined the Text Background demo to show color behind the button label, and fixed the Shadow Opacity and Shadow Blur demos to `.75` and `26`.
- Added customization for started/completed notification text, text and background colors, border color, background opacity, shadow opacity, and shadow blur.
- Added per-setting reset buttons with confirmation prompts and a confirmed red-bordered **Reset all settings** action.
- Added a hardcoded CSS checkmark to completed notifications; blank custom notification text falls back to the default messages.

### Changed

- Downloads now write directly to the selected folder while preserving the existing case-folder and filename template options. Chrome Downloads remains the fallback when no folder has been selected.
- The previous Downloads-subfolder setting is now a case folder grouping relative to the selected save location, with the existing Salesforce placeholder support preserved.
- Toast notifications now appear in the top-right of Salesforce pages and report both download start and final completion or failure.
- Toast customization now uses a full-width, theme-aware live preview with Started and Complete notifications shown side by side, centered with consistent spacing. Appearance controls are grouped in a centered bottom toolbar, with flyouts opening beneath each control.
- Background opacity, shadow opacity, and shadow blur use sliders with live values.
- **Ask every time** remains unavailable for conflicts when using a selected filesystem location; **Keep both** and **Replace existing** remain supported.
- The selected save location displays its folder name because Chrome does not expose the full absolute path for a directory handle to extension code.

## [0.4.0] - 2026-07-07

### Fixed

- Fixed missing file extensions on downloads (images, ZIPs, and any file whose Salesforce title has no extension were saving as extension-less "Document" files). Filenames now come from Salesforce's own download response (`Content-Disposition`) via `chrome.downloads.onDeterminingFilename`, so every file keeps its real, original name and extension.
- Fixed cross-case contamination when multiple Case tabs are open in the Salesforce Console. All record extraction (account name, case number, record name, file discovery) is now scoped to the `.oneWorkspace` console tab that the clicked **Download All** button lives in, instead of scanning the whole document (which could pull fields and page text from other open tabs).

### Added

- Added a doctype-icon extension hint (`docTypeToExtension`) as a fallback for the rare case where Salesforce sends no extension, covering unambiguous types such as `zip`, `pdf`, `csv`, `xlsx`, `docx`, and `pptx`.
- Added regression coverage for the doctype-to-extension mapping.

### Changed

- Custom filename patterns now derive the file extension from Salesforce's authoritative filename before falling back to scraped text.

## [0.3.6] - 2026-07-07

### Fixed

- Fixed per-file folder assignment so downloads use each file's own customer/case context.
- Scoped Salesforce record extraction to the current Files panel to prevent mixed-case downloads.
- Preserved existing filename and extension behavior while correcting folder routing.

## [0.3.5] - 2026-07-07

### Fixed

- Bumped extension version to `0.3.5`.
- Preserved Salesforce-provided filenames and extensions for downloaded files without additional renaming.
- Retained account/case folder naming behavior while avoiding filename modification.

## [0.3.4] - 2026-07-07

### Fixed

- Stopped custom filename rewriting so downloads use Salesforce-provided filenames and extensions when possible.
- Continued preserving account/case folder naming while avoiding file name changes for downloaded attachments.

## [0.3.3] - 2026-07-06

### Fixed

- Fixed missing account name extraction by adding a dedicated `getAccountName()` helper.
- Stripped attached Salesforce action labels such as `Preview` from record title fallbacks and folder name tokens.
- Preserved original attachment filenames and prevented file extensions from being lost in filename candidate cleanup.

## [0.3.2] - 2026-07-06

### Fixed

- Fixed account name cleanup when falling back to the record title and removed attached Salesforce action labels like `Preview` from folder path values.
- Preserved original attachment filenames instead of inferring or stripping extensions.
- Improved `Case Number` extraction for download folder tokens when Salesforce field values contain embedded action text.

## [0.3.1] - 2026-07-06

### Fixed

- Restored account/case folder naming by stripping Salesforce field action text such as `Preview`, `Download`, and `Open` from extracted field values.
- Restored `Case Number` extraction for download folder tokens when Salesforce renders action labels inside output field containers.
- Improved filename candidate cleanup by removing Salesforce action suffixes from file row labels.

## [0.3.0] - 2026-07-06

### Added

- Added a Dark mode setting for the options page.
- Added light and dark theme variables for the settings UI.

## [0.2.5] - 2026-07-06

### Fixed

- Preferred clean Salesforce field attributes such as `title` and `aria-label` when extracting Account values.
- Stripped Salesforce lookup action text such as leading or trailing `Preview` from folder token values.
- Improved `Case Number` lookup by walking from the visible label to the nearest output field container.

## [0.2.4] - 2026-07-06

### Fixed

- Improved original filename extraction so Salesforce file-type labels like `Adobe PDF` and `Word document` are not prefixed onto filenames.
- Preserved file extensions when Salesforce exposes a filename in the Files row, with a fallback extension inference for concatenated type labels.
- Removed concatenated trailing Salesforce action text like `Preview` from account names.
- Restored Case Number extraction by reading values from the nearest visible Salesforce field container.

## [0.2.3] - 2026-07-06

### Fixed

- Restored deterministic multi-file downloads by removing the browser filename hook that could collapse Salesforce Shepherd downloads into duplicate names.
- Kept blank filename patterns using the original filename captured from each visible Files row.
- Filtered Salesforce field extraction to visible record fields so folder names update correctly after navigating to a different customer or Case in Lightning.
- Improved file and account-name cleanup for Salesforce action text such as `Preview`, `Download`, and `Open`.

## [0.2.2] - 2026-07-06

### Fixed

- Removed trailing Salesforce action text such as `Preview` from extracted account names.
- Changed the default filename pattern to blank so downloads keep their original Salesforce filenames.
- Fixed blank filename pattern handling in settings so it no longer falls back to a generated `{index}-{name}` pattern.

## [0.2.1] - 2026-07-06

### Changed

- Switched the default Case folder template to use `{accountName}` instead of the placeholder-style `{customerName}` token.
- Kept `{customerName}` as an alias for `{accountName}` for convenience.
- Improved Salesforce Lightning field extraction for values rendered in `slot="outputField"`, including the `Case Number` UI field.
- Clarified README token wording and updated roadmap item `TD-001`.

## [0.2.0] - 2026-07-06

### Added

- Added `{customerName}`, `{caseNumber}`, and `{caseNumberRaw}` template tokens for download folder and filename patterns.
- Updated the default download subfolder template to `Salesforce Files/{customerName} - {caseNumber}`.
- Documented the customer/case folder naming convention and updated roadmap item `TD-001`.

## [0.1.0] - 2026-07-06

### Added

- Created the initial Manifest V3 Chrome extension scaffold.
- Added a Salesforce content script that injects a native-looking **Download All** button beside **Add Files** on Files related lists.
- Added background download handling through `chrome.downloads`.
- Added a styled settings page for download subfolder, filename pattern, conflict behavior, and prompt behavior.
- Added a popup with quick access to settings.
- Documented local extension loading, current limits, and roadmap items.
