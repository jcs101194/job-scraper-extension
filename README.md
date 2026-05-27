# Job Row Copier

A private, local Chrome extension that copies an **Indeed** or **ZipRecruiter** job posting into one tab-separated row for a job application spreadsheet.

## Column mapping

The copied row is ordered exactly as, starting after your manually entered `ID` cell:

`Position | Company | Sector | Industry | Requirements | Pay | Commute | Employement Type | App Submisison Date | # of Apps. | Response Sentiment | POC Name | POC Number | Status | Flags | Link | Comments`

Automatically populated:

- **Position**: posting title
- **Company**: hiring company
- **Sector**: `-`
- **Industry**: `-`
- **Requirements**: 2-4 newline-separated hyphen bullets summarizing years/languages, technologies, common skills, and education when available
- **Pay**: advertised/structured salary when available
- **Commute**: one of `Remote`, `Contract`, `Hybrid`, or `In Person`
- **Employement Type**: one of `Part-time`, `Contract`, `Temporary`, or `Full-time` when detected
- **App Submisison Date**: today's date in `mm/dd/yyyy` format
- **Response Sentiment**: `Low`
- **Flags**: Remote, Hybrid, or On-site when detected
- **Link**: canonical posting link, falling back to the browser URL

Intentionally left blank:

`ID`, `# of Apps.`, `POC Name`, `POC Number`, `Status`, and `Comments`.

## Install in Chrome

1. Unzip the folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `job-row-copier-extension` folder.
6. Pin **Job Row Copier** from Chrome's extensions menu.

## Use

1. Open an individual Indeed or ZipRecruiter job posting.
2. Click the **Job Row Copier** toolbar icon.
3. Click **Copy spreadsheet row**.
4. Type your sequential ID in the first cell.
5. Click the Position cell next to it and paste.

## How extraction works

The extension first reads standards-based `JobPosting` JSON-LD data when the job board exposes it. If fields are unavailable there, it uses narrow page-element fallbacks for Indeed and ZipRecruiter.

It has no backend, makes no network requests, and reads only the active page after you click the copy button.
