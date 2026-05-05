# Excel Sync Setup

Direct live editing of an open `.xlsx` workbook from a standalone browser page is not reliable.

The recommended setup is:

1. `job-tracker.html` auto-syncs `CSV` files to a folder.
2. Excel opens a separate workbook, imports those `CSV` files, and refreshes them.

This gives you automatic browser-to-Excel updates without making Excel the file the browser writes to.

## What the tracker writes

After you click `Connect CSV sync` in the tracker, it writes:

- `applications.csv`
- `coffee-chats.csv`
- `interview-rounds.csv`
- `career-hub-backup.json`

## Important rule

Do not use the raw `CSV` files as your main Excel file.

Reason:
- Excel can lock a `CSV` while it is open.
- If the file is locked, the tracker may fail to update it.

Instead:
- Keep the `CSV` files closed.
- Create one workbook like `JobTracker.xlsx` or `JobTracker.xlsm`.
- Import the `CSV` files into that workbook.

## Step 1: Turn on tracker sync

1. Open `job-tracker.html` in Chrome or Edge.
2. Click `Connect CSV sync`.
3. Choose a folder for your synced files.
4. Save something in the tracker once.
5. Confirm the folder now contains the synced files.

## Step 2: Create your Excel workbook

1. Open Excel.
2. Create a new workbook.
3. Save it as:
   - `JobTracker.xlsx` if you only want refresh on open or manual refresh
   - `JobTracker.xlsm` if you want timed auto-refresh with the macro below

## Step 3: Import the CSV files into Excel

For each file:

1. Go to `Data`.
2. Click `From Text/CSV`.
3. Choose one of:
   - `applications.csv`
   - `coffee-chats.csv`
   - `interview-rounds.csv`
4. Click `Load`.
5. Put each one on its own sheet.

Suggested sheet names:

- `Applications`
- `CoffeeChats`
- `InterviewRounds`

## Step 4: Make Excel refresh the data

After each import:

1. Open `Data` and find `Queries & Connections`.
2. Right-click the query.
3. Open `Properties`.
4. Turn on `Refresh data when opening the file`.
5. If your Excel version shows it, also turn on timed refresh like `Refresh every 1 minute`.

If timed refresh is not available in your Excel view, use the macro below.

## Optional: Full auto-refresh while workbook is open

I added a macro module file here:

- [excel-auto-refresh.bas](./excel-auto-refresh.bas)

### Import the macro

1. Save your workbook as `JobTracker.xlsm`.
2. Press `Alt + F11` in Excel.
3. In the VBA editor, go to `File` -> `Import File...`
4. Import `excel-auto-refresh.bas`.

### Add workbook event code

In the VBA editor:

1. Find `ThisWorkbook`.
2. Paste this code:

```vb
Private Sub Workbook_Open()
    StartAutoRefresh
End Sub

Private Sub Workbook_BeforeClose(Cancel As Boolean)
    StopAutoRefresh
End Sub
```

This refreshes all imported CSV queries every minute while the workbook is open.

## What this setup can and cannot do

What works:

- Save in browser
- Tracker updates CSV files automatically
- Excel workbook refreshes from those CSV files

What does not work:

- Editing the workbook directly and expecting the browser app to read changes back
- Safely writing into an already-open raw CSV file
- True two-way sync with Excel as the database

## Best practice

- Use the browser app as the place where you enter data.
- Use Excel as your reporting/filtering view.
- Keep the synced raw `CSV` files closed.
- Open the Excel workbook instead.
