# Career Hub

Career Hub is a lightweight job search tracker built as a standalone HTML app.

It helps you track:

- job applications
- interview rounds
- follow-ups
- coffee chats
- summary pipeline progress

## What it can do

- Save applications with company, role, date, status, links, recruiter info, notes, and reminders
- Add and edit interview rounds after saving
- Search by company name, position, and application date
- Sort applications by application date or process stage
- Show 10 application records per page
- Track coffee chats separately
- Show a summary tree plot for applied, 1st interview, 2nd interview, and offer stages
- Export and import your data as JSON
- Sync CSV files for Excel reporting

## Main files

- [job-tracker.html](./job-tracker.html)  
  Main app entry file
- [job-tracker.css](./job-tracker.css)  
  Shared styles
- [job-tracker.js](./job-tracker.js)  
  Shared app logic
- [Archive/job-tracker.html](./Archive/job-tracker.html)  
  Archive copy that uses the same shared CSS and JS
- [JobTracker.xlsx](./JobTracker.xlsx)  
  Excel workbook connected to synced CSV files
- [excel-sync-setup.md](./excel-sync-setup.md)  
  Detailed Excel connection instructions

## Quick start

1. Open [job-tracker.html](./job-tracker.html) in your browser.
2. Use the `Applications` tab to add and update job records.
3. Use the `Summary` tab to review your pipeline.
4. Use the `Coffee chats` tab to log networking conversations.
5. If you use Excel sync, click `Connect CSV sync` and choose the folder suggested by the app.
6. When you finish updating records, click `Sync now` or confirm the sync status is green before closing the page.

## How saving works

Career Hub saves your records in the browser using local storage.

That means:

- if you reopen the same HTML file in the same browser, your data should still be there
- if you switch browsers, use private mode, or clear browser data, the saved records may not appear

For extra safety, use `Export` regularly.

## CSV sync and Excel

Career Hub does not write directly into the Excel workbook.

The data flow is:

`Career Hub -> CSV files -> Excel workbook`

When CSV sync is connected, the app writes:

- `applications.csv`
- `coffee-chats.csv`
- `interview-rounds.csv`
- `career-hub-backup.json`

Then Excel reads those CSV files through [JobTracker.xlsx](./JobTracker.xlsx).

Important notes:

- Use Chrome or Edge for `Connect CSV sync`
- Choose the app folder, not `JobTracker.xlsx`
- Keep the raw CSV files closed while syncing
- Excel does not sync changes back into the HTML app

For the full Excel setup, see [excel-sync-setup.md](./excel-sync-setup.md).

## Search, sort, and paging

The `Applications` tab supports:

- live search by company name
- live search by position
- date range filtering by application date
- sort by newest or oldest application date
- sort by process stage
- 10 records per page

## Summary tab

The `Summary` tab shows a tree-style pipeline view for a selected time period.

Current counts are based on:

- `Applied`: application date
- `1st interview`: the first saved interview round
- `2nd interview`: the second saved interview round
- `Offer`: jobs with status `Offer`

## Best practice

- Use Career Hub as the main place to enter and edit data
- Use Excel for reporting, filtering, and spreadsheet views
- Sync after you finalize records
- Export backups regularly

## Browser note

The app can detect and suggest the current folder for CSV sync, but the browser still requires the user to approve and choose the folder the first time.

## Portability note

Career Hub itself is portable because the HTML, CSS, and JS files use relative paths.

That means someone else can download the zip to a different folder on their computer and still open the app normally.

Two things do not automatically move with the files:

- browser-saved records in `localStorage`
- Excel CSV connections inside `JobTracker.xlsx`

If someone else uses the project on another computer, they may need to:

- import a backup JSON file if they want existing app data
- reconnect the CSV files in Excel on their own machine

## Author

Career Hub was created by Lili Gao.
