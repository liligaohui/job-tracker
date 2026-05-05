
const STATUSES = ['Applied','Phone screen','Interview','Offer','Rejected'];
const SC = {
  'Applied':{bg:'#dbeafe',txt:'#1e40af'},
  'Phone screen':{bg:'#fef3c7',txt:'#92400e'},
  'Interview':{bg:'#ede9fe',txt:'#5b21b6'},
  'Offer':{bg:'#dcfce7',txt:'#166534'},
  'Rejected':{bg:'#fee2e2',txt:'#991b1b'},
};

let jobs = [], chats = [], editJobId = null, editCCId = null, currentView = 'jobs', activeFilter = '';
let chartPeriod = '90d';
let jobSort = 'date-desc';
let currentJobsPage = 1;
const searchFilters = {
  company: '',
  role: '',
  dateFrom: '',
  dateTo: '',
};
const JOBS_PER_PAGE = 10;
const CHART_PERIODS = {
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
  '180d': { label: 'Last 6 months', days: 180 },
  '365d': { label: 'Last 12 months', days: 365 },
  all: { label: 'All time', days: null },
};
const PROCESS_SORT_ORDERS = {
  'stage-desc': { Offer: 0, Interview: 1, 'Phone screen': 2, Applied: 3, Rejected: 4 },
  'stage-asc': { Applied: 0, 'Phone screen': 1, Interview: 2, Offer: 3, Rejected: 4 },
};
const JK = 'jt_jobs_v3', CK = 'jt_chats_v1';
const SYNC_DB = 'jt_sync_handles_v1';
const SYNC_STORE = 'handles';
const SYNC_FOLDER_KEY = 'csv-folder';
const SYNC_FILES = {
  apps: 'applications.csv',
  chats: 'coffee-chats.csv',
  rounds: 'interview-rounds.csv',
  backup: 'career-hub-backup.json',
};
const APP_SCRIPT_URL = document.currentScript && document.currentScript.src ? document.currentScript.src : '';
const syncState = {
  supported: typeof window.showDirectoryPicker === 'function',
  dirHandle: null,
  ready: false,
  busy: false,
  queued: false,
  statusKind: 'off',
  statusText: 'Saving in browser only',
};

function load() {
  try { jobs = JSON.parse(localStorage.getItem(JK)||'[]'); } catch(e){ jobs=[]; }
  try { chats = JSON.parse(localStorage.getItem(CK)||'[]'); } catch(e){ chats=[]; }
  jobs = Array.isArray(jobs) ? jobs : [];
  chats = Array.isArray(chats) ? chats : [];
  render();
}
function persistBrowserData() {
  localStorage.setItem(JK, JSON.stringify(jobs));
  localStorage.setItem(CK, JSON.stringify(chats));
}
function save() {
  persistBrowserData();
  queueAutoSync();
}

function initSync() {
  refreshSyncFolderHint();
  refreshSyncUI();
  void restoreSyncFolder();
}

function refreshSyncUI() {
  const status = document.getElementById('sync-status');
  const connectBtn = document.getElementById('sync-connect-btn');
  const reloadBtn = document.getElementById('sync-reload-btn');
  const syncNowBtn = document.getElementById('sync-now-btn');
  const disconnectBtn = document.getElementById('sync-disconnect-btn');

  status.className = `sync-status ${syncState.statusKind}`;
  status.textContent = syncState.statusText;

  if (!syncState.supported) {
    connectBtn.disabled = true;
    connectBtn.textContent = 'CSV sync unavailable';
    reloadBtn.style.display = 'none';
    syncNowBtn.style.display = 'none';
    disconnectBtn.style.display = 'none';
    status.textContent = 'CSV sync needs Chrome or Edge';
    return;
  }

  connectBtn.disabled = syncState.busy;
  if (!syncState.dirHandle) connectBtn.textContent = 'Connect CSV sync';
  else if (syncState.ready) connectBtn.textContent = 'Change sync folder';
  else connectBtn.textContent = 'Reconnect CSV sync';

  reloadBtn.style.display = syncState.dirHandle ? '' : 'none';
  reloadBtn.disabled = syncState.busy;
  syncNowBtn.style.display = syncState.dirHandle ? '' : 'none';
  syncNowBtn.disabled = syncState.busy;
  syncNowBtn.textContent = syncState.busy ? 'Syncing...' : 'Sync now';

  disconnectBtn.style.display = syncState.dirHandle ? '' : 'none';
  disconnectBtn.disabled = syncState.busy;
}

async function connectSyncFolder() {
  if (!syncState.supported) {
    alert('CSV auto-sync needs a Chromium browser such as Chrome or Edge.');
    return;
  }

  if (syncState.dirHandle && !syncState.ready) {
    const reconnected = await ensureSyncReady(true);
    if (reconnected) {
      await loadDataFromCsvFiles({ canPrompt: false, showStatus: false });
      syncState.statusKind = 'connected';
      syncState.statusText = 'Auto-sync reconnected';
      refreshSyncUI();
      syncState.queued = true;
      await flushAutoSync(false);
    }
    return;
  }

  try {
    const pickerOptions = { id: 'career-hub-sync' };
    if (syncState.dirHandle) pickerOptions.startIn = syncState.dirHandle;
    const handle = await window.showDirectoryPicker(pickerOptions);
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      syncState.statusKind = 'off';
      syncState.statusText = 'Folder permission is required for CSV sync';
      refreshSyncUI();
      return;
    }

    syncState.dirHandle = handle;
    syncState.ready = true;
    try { await persistSyncFolder(handle); } catch (persistErr) { console.warn('Could not remember sync folder for next time.', persistErr); }
    syncState.statusKind = 'connected';
    syncState.statusText = 'Auto-sync connected';
    refreshSyncUI();
    await loadDataFromCsvFiles({ canPrompt: false, showStatus: false });
    syncState.queued = true;
    await flushAutoSync(false);
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error(err);
    syncState.statusKind = 'error';
    syncState.statusText = 'Could not connect sync folder';
    refreshSyncUI();
  }
}

async function disconnectSync() {
  syncState.dirHandle = null;
  syncState.ready = false;
  syncState.queued = false;
  syncState.statusKind = 'off';
  syncState.statusText = 'Saving in browser only';
  try { await clearPersistedSyncFolder(); } catch (clearErr) { console.warn('Could not clear saved sync folder.', clearErr); }
  refreshSyncUI();
}

async function manualSync() {
  if (!syncState.dirHandle) {
    await connectSyncFolder();
    return;
  }
  syncState.queued = true;
  await flushAutoSync(true);
}

async function reloadFromCsv() {
  if (!syncState.supported) {
    alert('CSV reload needs Chrome or Edge.');
    return;
  }
  if (!syncState.dirHandle) {
    await connectSyncFolder();
    return;
  }
  await loadDataFromCsvFiles({ canPrompt: true, showStatus: true });
}

function queueAutoSync() {
  if (!syncState.dirHandle || !syncState.supported) return;
  syncState.queued = true;
  if (!syncState.busy) void flushAutoSync(false);
}

async function flushAutoSync(promptForPermission) {
  if (syncState.busy) return;
  syncState.busy = true;
  refreshSyncUI();

  try {
    do {
      syncState.queued = false;
      const canSync = await ensureSyncReady(promptForPermission);
      promptForPermission = false;
      if (!canSync) break;

      syncState.statusKind = 'syncing';
      syncState.statusText = 'Syncing CSV files...';
      refreshSyncUI();

      await writeSyncFiles();

      syncState.ready = true;
      syncState.statusKind = 'connected';
      syncState.statusText = `Auto-sync on - Last synced ${formatSyncTime(new Date())}`;
      refreshSyncUI();
    } while (syncState.queued);
  } catch (err) {
    console.error(err);
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      syncState.ready = false;
      syncState.statusKind = 'off';
      syncState.statusText = 'Reconnect to resume CSV sync';
    } else {
      syncState.statusKind = 'error';
      syncState.statusText = 'Sync failed. Browser copy is still safe.';
    }
    refreshSyncUI();
  } finally {
    syncState.busy = false;
    refreshSyncUI();
  }
}

async function ensureSyncReady(canPrompt) {
  if (!syncState.dirHandle) return false;

  const opts = { mode: 'readwrite' };
  let permission = await syncState.dirHandle.queryPermission(opts);

  if (permission === 'granted') {
    syncState.ready = true;
    return true;
  }

  if (!canPrompt) {
    syncState.ready = false;
    syncState.statusKind = 'off';
    syncState.statusText = 'Reconnect to resume CSV sync';
    refreshSyncUI();
    return false;
  }

  permission = await syncState.dirHandle.requestPermission(opts);
  syncState.ready = permission === 'granted';

  if (!syncState.ready) {
    syncState.statusKind = 'off';
    syncState.statusText = 'Reconnect to resume CSV sync';
    refreshSyncUI();
  }

  return syncState.ready;
}

async function writeSyncFiles() {
  if (!syncState.dirHandle) return;

  const files = [
    { name: SYNC_FILES.apps, contents: buildApplicationsCsv() },
    { name: SYNC_FILES.chats, contents: buildChatsCsv() },
    { name: SYNC_FILES.rounds, contents: buildRoundsCsv() },
    { name: SYNC_FILES.backup, contents: JSON.stringify({ jobs, chats }, null, 2) },
  ];

  for (const file of files) {
    const fileHandle = await syncState.dirHandle.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.contents);
    await writable.close();
  }
}

async function loadDataFromCsvFiles(options = {}) {
  const canPrompt = !!options.canPrompt;
  const showStatus = options.showStatus !== false;
  const canRead = await ensureSyncReady(canPrompt);
  if (!canRead) return false;

  try {
    const imported = await readCsvSyncData();
    if (!imported) {
      if (showStatus) {
        syncState.statusKind = 'connected';
        syncState.statusText = 'No CSV files found yet';
        refreshSyncUI();
      }
      return false;
    }

    jobs = imported.jobs;
    chats = imported.chats;
    persistBrowserData();
    render();

    if (showStatus) {
      syncState.statusKind = 'connected';
      syncState.statusText = `Loaded CSV data ${formatSyncTime(new Date())}`;
      refreshSyncUI();
    }
    return true;
  } catch (err) {
    console.error(err);
    syncState.statusKind = 'error';
    syncState.statusText = 'Could not load CSV files';
    refreshSyncUI();
    return false;
  }
}

async function readCsvSyncData() {
  const [appsText, chatsText, roundsText] = await Promise.all([
    readSyncFileText(SYNC_FILES.apps),
    readSyncFileText(SYNC_FILES.chats),
    readSyncFileText(SYNC_FILES.rounds),
  ]);

  if (appsText === null && chatsText === null && roundsText === null) return null;

  const applicationRecords = parseCsvRecords(appsText || '');
  const chatRecords = parseCsvRecords(chatsText || '');
  const roundRecords = parseCsvRecords(roundsText || '');

  return {
    jobs: buildJobsFromCsvRecords(applicationRecords, roundRecords),
    chats: buildChatsFromCsvRecords(chatRecords),
  };
}

async function readSyncFileText(name) {
  if (!syncState.dirHandle) return null;

  try {
    const fileHandle = await syncState.dirHandle.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    if (err && err.name === 'NotFoundError') return null;
    throw err;
  }
}

function parseCsvRecords(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const headers = rows[0].map(value => String(value || '').replace(/^\ufeff/, '').trim());
  return rows
    .slice(1)
    .filter(row => row.some(cell => String(cell || '').trim() !== ''))
    .map(row => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = decodeCsvValue(row[index] || '');
      });
      return record;
    });
}

function parseCsvRows(text) {
  if (!text) return [];

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter(currentRow => !(currentRow.length === 1 && currentRow[0] === ''));
}

function decodeCsvValue(value) {
  const text = String(value || '');
  if (/^'[=+\-@]/.test(text)) return text.slice(1);
  return text;
}

function getCsvRecordValue(record, key) {
  return String(record[key] == null ? '' : record[key]).trim();
}

function normalizeCsvStatus(value) {
  const status = String(value || '').trim();
  return STATUSES.includes(status) ? status : 'Applied';
}

function normalizeCsvOutcome(value) {
  const outcome = String(value || '').trim().toLowerCase();
  if (outcome === 'passed' || outcome === 'pass') return 'pass';
  if (outcome === 'did not pass' || outcome === 'fail' || outcome === 'failed') return 'fail';
  return 'pending';
}

function normalizeCsvFollowUpStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status === 'done' ? 'done' : 'pending';
}

function buildJobsFromCsvRecords(applicationRecords, roundRecords) {
  const jobsById = new Map();
  const orderedJobs = [];

  applicationRecords.forEach((record, index) => {
    const id = getCsvRecordValue(record, 'Job ID') || `job-${index + 1}`;
    const job = {
      id,
      company: getCsvRecordValue(record, 'Company'),
      role: getCsvRecordValue(record, 'Role'),
      date: getCsvRecordValue(record, 'Application Date'),
      status: normalizeCsvStatus(record.Status),
      source: getCsvRecordValue(record, 'Source'),
      link: getCsvRecordValue(record, 'Job Link'),
      recName: getCsvRecordValue(record, 'Recruiter Name'),
      recEmail: getCsvRecordValue(record, 'Recruiter Email'),
      cvPath: getCsvRecordValue(record, 'CV Path'),
      cvLabel: getCsvRecordValue(record, 'CV Version'),
      clPath: getCsvRecordValue(record, 'Cover Letter Path'),
      remDate: getCsvRecordValue(record, 'Follow-up Date'),
      remNote: getCsvRecordValue(record, 'Follow-up Note'),
      notes: getCsvRecordValue(record, 'Notes'),
      rounds: [],
    };
    jobsById.set(id, job);
    orderedJobs.push(job);
  });

  const roundsByJob = new Map();
  roundRecords.forEach((record, index) => {
    const jobId = getCsvRecordValue(record, 'Job ID');
    if (!jobId) return;

    if (!roundsByJob.has(jobId)) roundsByJob.set(jobId, []);
    roundsByJob.get(jobId).push({
      order: getCsvRoundOrder(record, index),
      round: {
        type: getCsvRecordValue(record, 'Round Type'),
        date: getCsvRecordValue(record, 'Round Date'),
        outcome: normalizeCsvOutcome(record.Outcome),
        notes: getCsvRecordValue(record, 'Notes'),
      },
    });
  });

  roundsByJob.forEach((items, jobId) => {
    let job = jobsById.get(jobId);
    if (!job) {
      job = {
        id: jobId,
        company: '',
        role: '',
        date: '',
        status: 'Applied',
        source: '',
        link: '',
        recName: '',
        recEmail: '',
        cvPath: '',
        cvLabel: '',
        clPath: '',
        remDate: '',
        remNote: '',
        notes: '',
        rounds: [],
      };
      jobsById.set(jobId, job);
      orderedJobs.push(job);
    }

    job.rounds = items
      .sort((a, b) => a.order - b.order)
      .map(item => item.round);
  });

  return orderedJobs;
}

function getCsvRoundOrder(record, fallbackIndex) {
  const roundId = getCsvRecordValue(record, 'Round ID');
  const match = roundId.match(/-R(\d+)$/i);
  if (match) return Number(match[1]);
  return fallbackIndex + 1;
}

function buildChatsFromCsvRecords(chatRecords) {
  return chatRecords.map((record, index) => ({
    id: getCsvRecordValue(record, 'Chat ID') || `chat-${index + 1}`,
    date: getCsvRecordValue(record, 'Date'),
    name: getCsvRecordValue(record, 'Name'),
    company: getCsvRecordValue(record, 'Company'),
    position: getCsvRecordValue(record, 'Title'),
    linkedin: getCsvRecordValue(record, 'LinkedIn'),
    email: getCsvRecordValue(record, 'Email'),
    context: getCsvRecordValue(record, 'How You Met'),
    summary: getCsvRecordValue(record, 'Summary'),
    actions: getCsvRecordValue(record, 'Action Items'),
    tags: getCsvRecordValue(record, 'Tags').split(',').map(tag => tag.trim()).filter(Boolean),
    fuDate: getCsvRecordValue(record, 'Follow-up Date'),
    fuNote: getCsvRecordValue(record, 'Follow-up Note'),
    fuStatus: normalizeCsvFollowUpStatus(record['Follow-up Status']),
    relatedJobId: getCsvRecordValue(record, 'Related Job ID'),
    notes: getCsvRecordValue(record, 'Notes'),
  }));
}

function buildApplicationsCsv() {
  const headers = ['Job ID','Company','Role','Application Date','Status','Source','Job Link','Recruiter Name','Recruiter Email','CV Path','CV Version','Cover Letter Path','Follow-up Date','Follow-up Note','Notes'];
  const rows = jobs.map(j => [
    j.id || '',
    j.company || '',
    j.role || '',
    j.date || '',
    j.status || '',
    j.source || '',
    j.link || '',
    j.recName || '',
    j.recEmail || '',
    j.cvPath || '',
    j.cvLabel || '',
    j.clPath || '',
    j.remDate || '',
    j.remNote || '',
    j.notes || '',
  ]);
  return buildCsv(headers, rows);
}

function buildChatsCsv() {
  const headers = ['Chat ID','Date','Name','Company','Title','LinkedIn','Email','How You Met','Summary','Action Items','Tags','Follow-up Date','Follow-up Note','Follow-up Status','Related Job ID','Notes'];
  const rows = chats.map(c => [
    c.id || '',
    c.date || '',
    c.name || '',
    c.company || '',
    c.position || '',
    c.linkedin || '',
    c.email || '',
    c.context || '',
    c.summary || '',
    c.actions || '',
    (c.tags || []).join(', '),
    c.fuDate || '',
    c.fuNote || '',
    c.fuStatus || '',
    c.relatedJobId || '',
    c.notes || '',
  ]);
  return buildCsv(headers, rows);
}

function buildRoundsCsv() {
  const headers = ['Round ID','Job ID','Round Type','Round Date','Outcome','Notes'];
  const rows = [];
  jobs.forEach(job => {
    (job.rounds || []).forEach((round, index) => {
      rows.push([
        `${job.id || 'job'}-R${index + 1}`,
        job.id || '',
        round.type || '',
        round.date || '',
        formatRoundOutcome(round.outcome),
        round.notes || '',
      ]);
    });
  });
  return buildCsv(headers, rows);
}

function buildCsv(headers, rows) {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value) {
  let text = String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatRoundOutcome(outcome) {
  if (outcome === 'pass') return 'Passed';
  if (outcome === 'fail') return 'Did not pass';
  return 'Pending';
}

function formatSyncTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function refreshSyncFolderHint() {
  const hint = document.getElementById('sync-folder-hint');
  if (!hint) return;

  const detectedPath = getDetectedAppFolderPath();
  if (detectedPath) {
    hint.textContent = `Suggested sync folder: ${detectedPath}`;
    return;
  }

  hint.textContent = 'Suggested sync folder: Choose the folder that contains job-tracker.html, job-tracker.js, and job-tracker.css.';
}

function getDetectedAppFolderPath() {
  const script = document.querySelector('script[src*="job-tracker.js"]');
  const sourceUrl = APP_SCRIPT_URL || (script && script.src) || window.location.href;
  return getFolderPathFromFileUrl(sourceUrl);
}

function getFolderPathFromFileUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl, window.location.href);
    if (url.protocol !== 'file:') return '';

    let pathname = decodeURIComponent(url.pathname || '');
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1).replace(/\//g, '\\');
      return pathname.replace(/\\[^\\]+$/, '');
    }

    return pathname.replace(/\/[^/]+$/, '');
  } catch (err) {
    console.warn('Could not detect app folder path.', err);
    return '';
  }
}

async function restoreSyncFolder() {
  if (!syncState.supported || !('indexedDB' in window)) {
    refreshSyncUI();
    return;
  }

  try {
    const handle = await readPersistedSyncFolder();
    if (!handle) {
      refreshSyncUI();
      return;
    }

    syncState.dirHandle = handle;
    const permission = await handle.queryPermission({ mode: 'readwrite' });

    if (permission === 'granted') {
      syncState.ready = true;
      syncState.statusKind = 'connected';
      syncState.statusText = 'Auto-sync ready';
    } else {
      syncState.ready = false;
      syncState.statusKind = 'off';
      syncState.statusText = 'Reconnect to resume CSV sync';
    }
  } catch (err) {
    console.error(err);
    syncState.dirHandle = null;
    syncState.ready = false;
    syncState.statusKind = 'off';
    syncState.statusText = 'Saving in browser only';
  }

  refreshSyncUI();
  if (syncState.ready) {
    await loadDataFromCsvFiles({ canPrompt: false, showStatus: false });
    syncState.queued = true;
    void flushAutoSync(false);
  }
}

function persistSyncFolder(handle) {
  if (!('indexedDB' in window)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SYNC_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SYNC_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SYNC_STORE, 'readwrite');
      tx.objectStore(SYNC_STORE).put(handle, SYNC_FOLDER_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function readPersistedSyncFolder() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SYNC_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SYNC_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SYNC_STORE, 'readonly');
      const req = tx.objectStore(SYNC_STORE).get(SYNC_FOLDER_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    };
  });
}

function clearPersistedSyncFolder() {
  if (!('indexedDB' in window)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SYNC_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SYNC_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SYNC_STORE, 'readwrite');
      tx.objectStore(SYNC_STORE).delete(SYNC_FOLDER_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify({jobs,chats},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='career-hub-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
}
function triggerImport(){ document.getElementById('import-file').click(); }
function importData(e) {
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try {
      const d=JSON.parse(ev.target.result);
      if(!confirm('Merge with existing data?'))return;
      const jIds=new Set(jobs.map(j=>j.id));
      (Array.isArray(d)?d:(d.jobs||[])).forEach(j=>{if(!jIds.has(j.id))jobs.unshift(j);});
      const cIds=new Set(chats.map(c=>c.id));
      (d.chats||[]).forEach(c=>{if(!cIds.has(c.id))chats.unshift(c);});
      save(); render();
    } catch(err){alert('Could not read file.');}
  };
  r.readAsText(f); e.target.value='';
}

function switchView(v, el) {
  currentView=v;
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('view-jobs').style.display=v==='jobs'?'block':'none';
  document.getElementById('view-summary').style.display=v==='summary'?'block':'none';
  document.getElementById('view-coffee').style.display=v==='coffee'?'block':'none';
  document.getElementById('view-help').style.display=v==='help'?'block':'none';
  render();
}

function render() {
  renderStats();
  if(currentView==='jobs') renderJobs();
  if(currentView==='summary') renderSummary();
  if(currentView==='coffee') renderCoffee();
}

function renderStats() {
  const total=jobs.length, interviews=jobs.filter(j=>j.status==='Interview'||j.status==='Offer').length;
  const offers=jobs.filter(j=>j.status==='Offer').length;
  const rate=total?Math.round(interviews/total*100):0;
  document.getElementById('stats').innerHTML=`
    <div class="stat"><strong>${total}</strong>Applications</div>
    <div class="stat"><strong>${interviews}</strong>Interviews</div>
    <div class="stat"><strong>${offers}</strong>Offers</div>
    <div class="stat"><strong>${rate}%</strong>Interview rate</div>
    <div class="stat"><strong>${chats.length}</strong>Coffee chats</div>`;
}

function renderJobs() {
  // Filter pills
  const counts = {};
  STATUSES.forEach(s=>counts[s]=jobs.filter(j=>j.status===s).length);
  document.getElementById('filter-row').innerHTML =
    `<div class="filter-pill${activeFilter===''?' active':''}" onclick="setFilter('')">All (${jobs.length})</div>`+
    STATUSES.map(s=>`<div class="filter-pill${activeFilter===s?' active':''}" onclick="setFilter('${s}')">${s} (${counts[s]})</div>`).join('');

  const filtered = activeFilter ? jobs.filter(j=>j.status===activeFilter) : jobs;
  const list = document.getElementById('app-list');

  if(!filtered.length) {
    list.innerHTML='<div class="empty-state"><strong>No applications yet</strong>Click "+ Add" to log your first one.</div>';
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  list.innerHTML = filtered.map(j=>{
    const c = SC[j.status]||SC['Applied'];
    const rounds = j.rounds||[];
    const lastRound = rounds[rounds.length-1];
    const roundsSummary = rounds.length ? `${rounds.length} round${rounds.length>1?'s':''} Â· ${lastRound.outcome==='pass'?'Last: passed':lastRound.outcome==='fail'?'Last: did not pass':'In progress'}` : 'No rounds yet';

    // Reminder dot
    let remDot='';
    if(j.remDate){
      const diff=Math.ceil((new Date(j.remDate)-today)/86400000);
      const col=diff<0?'#dc2626':diff<=3?'#d97706':'#16a34a';
      remDot=`<span class="rem-dot" style="background:${col}"></span>${diff<0?'Overdue':diff===0?'Today':'In '+diff+'d'}`;
    }

    return `<div class="app-row" onclick="openJob('${j.id}')">
      <div class="app-row-left">
        <div class="app-row-company">${esc(j.company)}</div>
        <div class="app-row-role">${esc(j.role)}</div>
        <div class="app-row-meta">
          ${j.date?`<span>${j.date}</span>`:''}
          ${rounds.length?`<span>${roundsSummary}</span>`:''}
          ${remDot?`<span>${remDot}</span>`:''}
        </div>
      </div>
      <div class="app-row-right">
        <span class="status-badge" style="background:${c.bg};color:${c.txt}">${j.status}</span>
        <span class="chevron">â€º</span>
      </div>
    </div>`;
  }).join('');
}

function setFilter(s){
  activeFilter=s;
  currentJobsPage = 1;
  renderJobs();
}

function renderCoffee() {
  const list = document.getElementById('cc-list');
  if(!chats.length){
    list.innerHTML='<div class="empty-state"><strong>No coffee chats yet</strong>Click "+ Add chat" to log your first conversation.</div>';
    return;
  }
  const today=new Date();today.setHours(0,0,0,0);
  const sorted=[...chats].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  list.innerHTML=sorted.map(c=>{
    const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const tags=(c.tags||[]).filter(Boolean);
    let fuLine='';
    if(c.fuDate&&c.fuStatus!=='done'){
      const diff=Math.ceil((new Date(c.fuDate)-today)/86400000);
      const col=diff<0?'#dc2626':diff<=3?'#d97706':'#888';
      fuLine=`<span class="cc-followup" style="color:${col}">Follow-up: ${c.fuNote||'Check in'} Â· ${diff<0?'Overdue':diff===0?'Today':'In '+diff+'d'}</span>`;
    }
    return `<div class="cc-card" onclick="openCC('${c.id}')">
      <div class="cc-card-top">
        <div style="display:flex;gap:10px;flex:1">
          <div class="cc-avatar">${initials}</div>
          <div class="cc-info">
            <div class="cc-name">${esc(c.name)}</div>
            <div class="cc-sub">${esc(c.position||'')}${c.position&&c.company?' Â· ':''}${esc(c.company||'')}</div>
          </div>
        </div>
        <div class="cc-date">${c.date||''}</div>
      </div>
      ${c.summary?`<div class="cc-summary">${esc(c.summary)}</div>`:''}
      <div class="cc-footer">
        ${tags.map(t=>`<span class="cc-tag">${esc(t)}</span>`).join('')}
        ${fuLine}
      </div>
    </div>`;
  }).join('');
}

// --- Job modal ---
let currentRounds = [];
let currentStatus = 'Applied';

function openNewJob(){
  editJobId=null; currentRounds=[]; currentStatus='Applied';
  document.getElementById('j-company').value='';
  document.getElementById('j-role').value='';
  document.getElementById('j-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('j-link').value='';
  document.getElementById('j-rec-name').value='';
  document.getElementById('j-rec-email').value='';
  document.getElementById('j-cv').value='';
  document.getElementById('j-cv-label').value='';
  document.getElementById('j-cl').value='';
  document.getElementById('j-rem-date').value='';
  document.getElementById('j-rem-note').value='';
  document.getElementById('j-notes').value='';
  document.getElementById('r-type').value='';
  document.getElementById('r-date').value='';
  document.getElementById('r-outcome').value='pending';
  document.getElementById('r-notes').value='';
  document.getElementById('j-del-btn').style.display='none';
  setStatusUI('Applied');
  renderRounds();
  document.getElementById('job-overlay').classList.add('open');
}

function openJob(id){
  const j=jobs.find(x=>x.id===id); if(!j)return;
  editJobId=id; currentRounds=[...(j.rounds||[])]; currentStatus=j.status||'Applied';
  document.getElementById('j-company').value=j.company||'';
  document.getElementById('j-role').value=j.role||'';
  document.getElementById('j-date').value=j.date||'';
  document.getElementById('j-link').value=j.link||'';
  document.getElementById('j-rec-name').value=j.recName||'';
  document.getElementById('j-rec-email').value=j.recEmail||'';
  document.getElementById('j-cv').value=j.cvPath||'';
  document.getElementById('j-cv-label').value=j.cvLabel||'';
  document.getElementById('j-cl').value=j.clPath||'';
  document.getElementById('j-rem-date').value=j.remDate||'';
  document.getElementById('j-rem-note').value=j.remNote||'';
  document.getElementById('j-notes').value=j.notes||'';
  document.getElementById('r-type').value='';
  document.getElementById('r-date').value='';
  document.getElementById('r-outcome').value='pending';
  document.getElementById('r-notes').value='';
  document.getElementById('j-del-btn').style.display='';
  setStatusUI(j.status||'Applied');
  renderRounds();
  document.getElementById('job-overlay').classList.add('open');
}

function setStatus(el){
  currentStatus=el.dataset.s;
  setStatusUI(currentStatus);
}
function setStatusUI(s){
  currentStatus=s;
  document.querySelectorAll('.status-opt').forEach(o=>o.classList.toggle('active',o.dataset.s===s));
}

function renderRounds(){
  const container=document.getElementById('rounds-list');
  if(!currentRounds.length){ container.innerHTML=''; return; }
  container.innerHTML=currentRounds.map((r,i)=>{
    const dotClass=r.outcome==='pass'?'pass':r.outcome==='fail'?'fail':'pending';
    const badgeClass=r.outcome==='pass'?'outcome-pass':r.outcome==='fail'?'outcome-fail':'outcome-pending';
    const badgeText=r.outcome==='pass'?'Passed':r.outcome==='fail'?'Did not pass':'Pending';
    return `<div class="round-item">
      <div class="round-dot ${dotClass}"></div>
      <div class="round-info">
        <div class="round-type">${esc(r.type||'Round '+(i+1))}</div>
        <div class="round-meta">${r.date||''}${r.notes?' Â· '+esc(r.notes):''}</div>
      </div>
      <div>
        <div class="round-outcome ${badgeClass}">${badgeText}</div>
      </div>
      <button style="background:none;border:none;color:#ccc;cursor:pointer;font-size:16px;padding:0 2px" onclick="removeRound(${i})" title="Remove">Ã—</button>
    </div>`;
  }).join('');
}

function addRound(){
  const type=document.getElementById('r-type').value.trim();
  if(!type){alert('Please enter a round name.');return;}
  currentRounds.push({
    type,
    date:document.getElementById('r-date').value,
    outcome:document.getElementById('r-outcome').value,
    notes:document.getElementById('r-notes').value.trim(),
  });
  document.getElementById('r-type').value='';
  document.getElementById('r-date').value='';
  document.getElementById('r-outcome').value='pending';
  document.getElementById('r-notes').value='';
  renderRounds();
}

function removeRound(i){ currentRounds.splice(i,1); renderRounds(); }

function saveJob(){
  const company=document.getElementById('j-company').value.trim();
  const role=document.getElementById('j-role').value.trim();
  if(!company||!role){alert('Company and role are required.');return;}
  const job={
    id:editJobId||Date.now().toString(),
    company,role,
    status:currentStatus,
    date:document.getElementById('j-date').value,
    link:document.getElementById('j-link').value.trim(),
    recName:document.getElementById('j-rec-name').value.trim(),
    recEmail:document.getElementById('j-rec-email').value.trim(),
    cvPath:document.getElementById('j-cv').value.trim(),
    cvLabel:document.getElementById('j-cv-label').value.trim(),
    clPath:document.getElementById('j-cl').value.trim(),
    remDate:document.getElementById('j-rem-date').value,
    remNote:document.getElementById('j-rem-note').value.trim(),
    notes:document.getElementById('j-notes').value.trim(),
    rounds:currentRounds,
  };
  if(editJobId){jobs=jobs.map(j=>j.id===editJobId?job:j);}
  else{jobs.unshift(job);}
  save(); render(); closeJobModal();
}

function deleteJob(){
  if(!editJobId||!confirm('Delete this application?'))return;
  jobs=jobs.filter(j=>j.id!==editJobId);
  currentJobsPage = 1;
  save();render();closeJobModal();
}
function closeJobModal(){document.getElementById('job-overlay').classList.remove('open');}

// --- Coffee chat modal ---
function openNewCC(){
  editCCId=null;
  document.getElementById('cc-modal-title').textContent='Add coffee chat';
  document.getElementById('cc-del-btn').style.display='none';
  ['cc-name','cc-position','cc-company','cc-linkedin','cc-email','cc-context','cc-summary','cc-actions','cc-tags','cc-fu-date','cc-fu-note'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('cc-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('cc-fu-status').value='pending';
  document.getElementById('cc-overlay').classList.add('open');
}
function openCC(id){
  const c=chats.find(x=>x.id===id);if(!c)return;
  editCCId=id;
  document.getElementById('cc-modal-title').textContent='Edit coffee chat';
  document.getElementById('cc-del-btn').style.display='';
  document.getElementById('cc-name').value=c.name||'';
  document.getElementById('cc-date').value=c.date||'';
  document.getElementById('cc-position').value=c.position||'';
  document.getElementById('cc-company').value=c.company||'';
  document.getElementById('cc-linkedin').value=c.linkedin||'';
  document.getElementById('cc-email').value=c.email||'';
  document.getElementById('cc-context').value=c.context||'';
  document.getElementById('cc-summary').value=c.summary||'';
  document.getElementById('cc-actions').value=c.actions||'';
  document.getElementById('cc-tags').value=(c.tags||[]).join(', ');
  document.getElementById('cc-fu-date').value=c.fuDate||'';
  document.getElementById('cc-fu-note').value=c.fuNote||'';
  document.getElementById('cc-fu-status').value=c.fuStatus||'pending';
  document.getElementById('cc-overlay').classList.add('open');
}
function saveCC(){
  const name=document.getElementById('cc-name').value.trim();
  if(!name){alert('Name is required.');return;}
  const chat={
    id:editCCId||Date.now().toString(),
    name,
    date:document.getElementById('cc-date').value,
    position:document.getElementById('cc-position').value.trim(),
    company:document.getElementById('cc-company').value.trim(),
    linkedin:document.getElementById('cc-linkedin').value.trim(),
    email:document.getElementById('cc-email').value.trim(),
    context:document.getElementById('cc-context').value.trim(),
    summary:document.getElementById('cc-summary').value.trim(),
    actions:document.getElementById('cc-actions').value.trim(),
    tags:document.getElementById('cc-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    fuDate:document.getElementById('cc-fu-date').value,
    fuNote:document.getElementById('cc-fu-note').value.trim(),
    fuStatus:document.getElementById('cc-fu-status').value,
  };
  if(editCCId){chats=chats.map(c=>c.id===editCCId?chat:c);}
  else{chats.unshift(chat);}
  save();render();closeCCModal();
}
function deleteCC(){
  if(!editCCId||!confirm('Delete this chat?'))return;
  chats=chats.filter(c=>c.id!==editCCId);
  save();render();closeCCModal();
}
function closeCCModal(){document.getElementById('cc-overlay').classList.remove('open');}

// --- UI refresh overrides ---
let editingRoundIndex = null;

function normalizeText(value){
  return String(value || '').trim().toLowerCase();
}

function parseDateValue(value){
  if(!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime())) return null;
  date.setHours(0,0,0,0);
  return date;
}

function isWithinDateRange(value, from, to){
  const date = parseDateValue(value);
  if(!date) return false;
  if(from){
    const fromDate = parseDateValue(from);
    if(fromDate && date < fromDate) return false;
  }
  if(to){
    const toDate = parseDateValue(to);
    if(toDate && date > toDate) return false;
  }
  return true;
}

function getSearchBaseJobs(){
  const companyQuery = normalizeText(searchFilters.company);
  const roleQuery = normalizeText(searchFilters.role);

  return jobs.filter(job=>{
    if(companyQuery && !normalizeText(job.company).includes(companyQuery)) return false;
    if(roleQuery && !normalizeText(job.role).includes(roleQuery)) return false;
    if((searchFilters.dateFrom || searchFilters.dateTo) && !isWithinDateRange(job.date, searchFilters.dateFrom, searchFilters.dateTo)) return false;
    return true;
  });
}

function getVisibleJobs(){
  const baseJobs = getSearchBaseJobs();
  return activeFilter ? baseJobs.filter(job=>job.status===activeFilter) : baseJobs;
}

function compareJobDates(a, b, direction='desc'){
  const aDate = parseDateValue(a.date);
  const bDate = parseDateValue(b.date);
  if(!aDate && !bDate) return 0;
  if(!aDate) return 1;
  if(!bDate) return -1;
  return direction === 'asc' ? aDate - bDate : bDate - aDate;
}

function compareJobText(a, b){
  const companyCompare = String(a.company || '').localeCompare(String(b.company || ''), undefined, { sensitivity: 'base' });
  if(companyCompare) return companyCompare;
  return String(a.role || '').localeCompare(String(b.role || ''), undefined, { sensitivity: 'base' });
}

function sortJobsList(items){
  const sorted = [...items];
  sorted.sort((a, b)=>{
    if(jobSort === 'date-asc') return compareJobDates(a, b, 'asc') || compareJobText(a, b);
    if(jobSort === 'stage-desc' || jobSort === 'stage-asc'){
      const order = PROCESS_SORT_ORDERS[jobSort];
      const rankDiff = (order[a.status] ?? 99) - (order[b.status] ?? 99);
      return rankDiff || compareJobDates(a, b, 'desc') || compareJobText(a, b);
    }
    return compareJobDates(a, b, 'desc') || compareJobText(a, b);
  });
  return sorted;
}

function clampJobsPage(totalItems){
  const totalPages = Math.max(1, Math.ceil(totalItems / JOBS_PER_PAGE));
  currentJobsPage = Math.min(Math.max(currentJobsPage, 1), totalPages);
  return totalPages;
}

function getJobsPaginationModel(totalPages){
  const pages = [];
  const addPage = value => {
    if(value >= 1 && value <= totalPages && !pages.includes(value)) pages.push(value);
  };

  addPage(1);
  addPage(currentJobsPage - 1);
  addPage(currentJobsPage);
  addPage(currentJobsPage + 1);
  addPage(totalPages);

  pages.sort((a, b)=>a - b);

  const model = [];
  pages.forEach((page, index)=>{
    if(index && page - pages[index - 1] > 1) model.push('ellipsis');
    model.push(page);
  });
  return model;
}

function renderJobsPagination(totalItems, totalPages){
  const container = document.getElementById('job-pagination');
  if(!container) return;

  if(totalItems <= JOBS_PER_PAGE){
    container.innerHTML = '';
    return;
  }

  const model = getJobsPaginationModel(totalPages);
  container.innerHTML = `
    <div class="pagination-meta">Page ${currentJobsPage} of ${totalPages}</div>
    <div class="pagination-actions">
      <button class="page-btn" type="button" onclick="goToJobsPage(${currentJobsPage - 1})" ${currentJobsPage === 1 ? 'disabled' : ''}>Previous</button>
      ${model.map(item=>item === 'ellipsis'
        ? '<span class="page-ellipsis">...</span>'
        : `<button class="page-btn${item === currentJobsPage ? ' active' : ''}" type="button" onclick="goToJobsPage(${item})">${item}</button>`).join('')}
      <button class="page-btn" type="button" onclick="goToJobsPage(${currentJobsPage + 1})" ${currentJobsPage === totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

function setSearchFilter(key, value){
  if(!(key in searchFilters)) return;
  searchFilters[key] = value;
  currentJobsPage = 1;
  renderJobs();
}

function clearSearchFilters(){
  searchFilters.company = '';
  searchFilters.role = '';
  searchFilters.dateFrom = '';
  searchFilters.dateTo = '';
  document.getElementById('search-company').value = '';
  document.getElementById('search-role').value = '';
  document.getElementById('search-date-from').value = '';
  document.getElementById('search-date-to').value = '';
  currentJobsPage = 1;
  renderJobs();
}

function setJobSort(value){
  jobSort = ['date-desc', 'date-asc', 'stage-desc', 'stage-asc'].includes(value) ? value : 'date-desc';
  currentJobsPage = 1;
  renderJobs();
}

function goToJobsPage(page){
  const totalPages = Math.max(1, Math.ceil(getVisibleJobs().length / JOBS_PER_PAGE));
  currentJobsPage = Math.min(Math.max(page, 1), totalPages);
  renderJobs();
}

function setChartPeriod(value){
  chartPeriod = CHART_PERIODS[value] ? value : '90d';
  render();
}

function getChartRange(){
  const config = CHART_PERIODS[chartPeriod] || CHART_PERIODS['90d'];
  const end = new Date();
  end.setHours(0,0,0,0);
  if(!config.days) return { start: null, end, label: config.label };
  const start = new Date(end);
  start.setDate(start.getDate() - (config.days - 1));
  return { start, end, label: config.label };
}

function isDateInChartRange(value, range){
  const date = parseDateValue(value);
  if(!date) return false;
  if(range.start && date < range.start) return false;
  if(range.end && date > range.end) return false;
  return true;
}

function getJobRounds(job){
  return Array.isArray(job.rounds) ? job.rounds.filter(Boolean) : [];
}

function getRoundEventDate(job, roundIndex){
  const rounds = getJobRounds(job);
  const round = rounds[roundIndex];
  if(!round) return '';
  return round.date || job.date || '';
}

function getOfferEventDate(job){
  if(job.status !== 'Offer') return '';
  const rounds = getJobRounds(job);
  for(let i = rounds.length - 1; i >= 0; i--){
    if(rounds[i].date) return rounds[i].date;
  }
  return job.date || '';
}

function getPipelineMetrics(baseJobs){
  const range = getChartRange();
  const metrics = [
    {
      key: 'applied',
      label: 'Applied',
      className: 'applied',
      count: baseJobs.filter(job=>isDateInChartRange(job.date, range)).length,
    },
    {
      key: 'first',
      label: '1st interview',
      className: 'first',
      count: baseJobs.filter(job=>isDateInChartRange(getRoundEventDate(job, 0), range)).length,
    },
    {
      key: 'second',
      label: '2nd interview',
      className: 'second',
      count: baseJobs.filter(job=>isDateInChartRange(getRoundEventDate(job, 1), range)).length,
    },
    {
      key: 'offer',
      label: 'Offer',
      className: 'offer',
      count: baseJobs.filter(job=>isDateInChartRange(getOfferEventDate(job), range)).length,
    },
  ];
  return { metrics, range };
}

function formatDateLabel(date){
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function pct(numerator, denominator){
  if(!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function renderTreeNode(x, y, width, height, label, count, meta, className=''){
  return `
    <g transform="translate(${x} ${y})">
      <rect class="tree-node-card ${className}" rx="22" ry="22" width="${width}" height="${height}"></rect>
      <text class="tree-node-label" x="${width/2}" y="28" text-anchor="middle">${esc(label)}</text>
      <text class="tree-node-count" x="${width/2}" y="62" text-anchor="middle">${count}</text>
      <text class="tree-node-meta" x="${width/2}" y="86" text-anchor="middle">${esc(meta)}</text>
    </g>
  `;
}

function renderPipelineAnalytics(baseJobs){
  const summary = document.getElementById('pipeline-summary');
  const chart = document.getElementById('pipeline-chart');
  const { metrics, range } = getPipelineMetrics(baseJobs);
  const rangeLabel = range.start ? `${formatDateLabel(range.start)} to ${formatDateLabel(range.end)}` : 'All saved records';
  const appliedCount = metrics.find(metric=>metric.key==='applied')?.count || 0;
  const firstCount = metrics.find(metric=>metric.key==='first')?.count || 0;
  const secondCount = metrics.find(metric=>metric.key==='second')?.count || 0;
  const offerCount = metrics.find(metric=>metric.key==='offer')?.count || 0;
  const dropAfterApply = Math.max(appliedCount - firstCount, 0);
  const dropAfterFirst = Math.max(firstCount - secondCount, 0);
  const dropAfterSecond = Math.max(secondCount - offerCount, 0);

  summary.innerHTML = `
    <div class="chart-summary-pill"><span class="summary-dot" style="background:#1f6b53"></span>${range.label}</div>
    <div class="chart-summary-pill">${baseJobs.length} saved application${baseJobs.length===1?'':'s'}</div>
    <div class="chart-summary-pill">${rangeLabel}</div>
  `;

  if(!baseJobs.length){
    chart.innerHTML = '<div class="pipeline-empty">No applications saved yet, so there is nothing to chart.</div>';
    return;
  }

  const svg = `
    <div class="pipeline-tree">
      <svg class="pipeline-tree-svg" viewBox="0 0 920 360" role="img" aria-label="Interview pipeline tree plot">
        <path class="tree-link" d="M 195 94 H 255"></path>
        <path class="tree-link" d="M 415 94 H 475"></path>
        <path class="tree-link" d="M 635 94 H 695"></path>

        <path class="tree-link" d="M 135 124 V 168 H 305 V 184"></path>
        <path class="tree-link" d="M 355 124 V 168 H 525 V 184"></path>
        <path class="tree-link" d="M 575 124 V 168 H 745 V 184"></path>

        ${renderTreeNode(25, 40, 170, 96, 'Applied', appliedCount, `${pct(appliedCount, appliedCount || 1)}% of pipeline`, 'root')}
        ${renderTreeNode(245, 40, 170, 96, '1st interview', firstCount, `${pct(firstCount, appliedCount)}% of applied`, 'first')}
        ${renderTreeNode(465, 40, 170, 96, '2nd interview', secondCount, `${pct(secondCount, appliedCount)}% of applied`, 'second')}
        ${renderTreeNode(685, 40, 170, 96, 'Offer', offerCount, `${pct(offerCount, appliedCount)}% of applied`, 'offer')}

        ${renderTreeNode(220, 184, 170, 96, 'No 1st interview', dropAfterApply, `${pct(dropAfterApply, appliedCount)}% stopped here`, 'dropoff')}
        ${renderTreeNode(440, 184, 170, 96, 'Stopped after 1st', dropAfterFirst, `${pct(dropAfterFirst, appliedCount)}% stopped here`, 'dropoff')}
        ${renderTreeNode(660, 184, 170, 96, 'No offer yet', dropAfterSecond, `${pct(dropAfterSecond, appliedCount)}% still short of offer`, 'dropoff')}
      </svg>
    </div>
  `;

  chart.innerHTML = svg;
}

function renderSummary(){
  const periodSelect = document.getElementById('chart-period');
  if(periodSelect && periodSelect.value !== chartPeriod) periodSelect.value = chartPeriod;
  renderPipelineAnalytics(jobs);
}

function renderJobs() {
  const baseJobs = getSearchBaseJobs();
  const counts = {};
  STATUSES.forEach(s=>counts[s]=baseJobs.filter(j=>j.status===s).length);
  document.getElementById('filter-row').innerHTML =
    `<div class="filter-pill${activeFilter===''?' active':''}" onclick="setFilter('')">All (${baseJobs.length})</div>`+
    STATUSES.map(s=>`<div class="filter-pill${activeFilter===s?' active':''}" onclick="setFilter('${s}')">${s} (${counts[s]})</div>`).join('');

  const filtered = activeFilter ? baseJobs.filter(j=>j.status===activeFilter) : baseJobs;
  const sorted = sortJobsList(filtered);
  const totalPages = clampJobsPage(sorted.length);
  const startIndex = (currentJobsPage - 1) * JOBS_PER_PAGE;
  const pageJobs = sorted.slice(startIndex, startIndex + JOBS_PER_PAGE);
  const list = document.getElementById('app-list');
  const summary = document.getElementById('job-results-summary');
  const sortSelect = document.getElementById('job-sort');

  if(sortSelect && sortSelect.value !== jobSort) sortSelect.value = jobSort;

  if(!filtered.length) summary.textContent = `Showing 0 of ${jobs.length} application${jobs.length===1?'':'s'}.`;
  else {
    const endIndex = startIndex + pageJobs.length;
    const totalLabel = jobs.length === filtered.length ? `${filtered.length}` : `${filtered.length} matching (${jobs.length} total)`;
    summary.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalLabel} application${filtered.length===1?'':'s'}.`;
  }

  if(!filtered.length) {
    list.innerHTML = jobs.length
      ? '<div class="empty-state"><strong>No matching applications</strong>Try a different company, position, date range, or status filter.</div>'
      : '<div class="empty-state"><strong>No applications yet</strong>Click "+ Add application" to log your first one.</div>';
    renderJobsPagination(0, 1);
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  list.innerHTML = pageJobs.map(j=>{
    const c = SC[j.status]||SC['Applied'];
    const rounds = j.rounds||[];
    const lastRound = rounds[rounds.length-1];
    const roundsSummary = rounds.length ? `${rounds.length} round${rounds.length>1?'s':''} &middot; ${lastRound.outcome==='pass'?'Last: passed':lastRound.outcome==='fail'?'Last: did not pass':'In progress'}` : 'No rounds yet';

    let remDot='';
    if(j.remDate){
      const diff=Math.ceil((new Date(j.remDate)-today)/86400000);
      const col=diff<0?'#dc2626':diff<=3?'#d97706':'#16a34a';
      remDot=`<span class="rem-dot" style="background:${col}"></span>${diff<0?'Overdue':diff===0?'Today':'In '+diff+'d'}`;
    }

    return `<div class="app-row" onclick="openJob('${j.id}')">
      <div class="app-row-left">
        <div class="app-row-company">${esc(j.company)}</div>
        <div class="app-row-role">${esc(j.role)}</div>
        <div class="app-row-meta">
          ${j.date?`<span>${j.date}</span>`:''}
          ${rounds.length?`<span>${roundsSummary}</span>`:''}
          ${remDot?`<span>${remDot}</span>`:''}
        </div>
      </div>
      <div class="app-row-right">
        <span class="status-badge" style="background:${c.bg};color:${c.txt}">${j.status}</span>
        <span class="chevron">&rsaquo;</span>
      </div>
    </div>`;
  }).join('');

  renderJobsPagination(sorted.length, totalPages);
}

function renderCoffee() {
  const list = document.getElementById('cc-list');
  if(!chats.length){
    list.innerHTML='<div class="empty-state"><strong>No coffee chats yet</strong>Click "+ Add chat" to log your first conversation.</div>';
    return;
  }
  const today=new Date();today.setHours(0,0,0,0);
  const sorted=[...chats].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  list.innerHTML=sorted.map(c=>{
    const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const tags=(c.tags||[]).filter(Boolean);
    let fuLine='';
    if(c.fuDate&&c.fuStatus!=='done'){
      const diff=Math.ceil((new Date(c.fuDate)-today)/86400000);
      const col=diff<0?'#dc2626':diff<=3?'#d97706':'#888';
      fuLine=`<span class="cc-followup" style="color:${col}">Follow-up: ${c.fuNote||'Check in'} &middot; ${diff<0?'Overdue':diff===0?'Today':'In '+diff+'d'}</span>`;
    }
    return `<div class="cc-card" onclick="openCC('${c.id}')">
      <div class="cc-card-top">
        <div style="display:flex;gap:10px;flex:1">
          <div class="cc-avatar">${initials}</div>
          <div class="cc-info">
            <div class="cc-name">${esc(c.name)}</div>
            <div class="cc-sub">${esc(c.position||'')}${c.position&&c.company?' &middot; ':''}${esc(c.company||'')}</div>
          </div>
        </div>
        <div class="cc-date">${c.date||''}</div>
      </div>
      ${c.summary?`<div class="cc-summary">${esc(c.summary)}</div>`:''}
      <div class="cc-footer">
        ${tags.map(t=>`<span class="cc-tag">${esc(t)}</span>`).join('')}
        ${fuLine}
      </div>
    </div>`;
  }).join('');
}

function resetRoundDraft(){
  document.getElementById('r-type').value='';
  document.getElementById('r-date').value='';
  document.getElementById('r-outcome').value='pending';
  document.getElementById('r-notes').value='';
  editingRoundIndex=null;
  updateRoundFormUI();
}

function updateRoundFormUI(){
  const submitBtn=document.getElementById('round-submit-btn');
  const cancelBtn=document.getElementById('round-cancel-btn');
  const isEditing=editingRoundIndex!==null;
  if(submitBtn) submitBtn.textContent=isEditing?'Update step':'Add step';
  if(cancelBtn) cancelBtn.style.display=isEditing?'':'none';
}

function readRoundDraft(){
  return {
    type:document.getElementById('r-type').value.trim(),
    date:document.getElementById('r-date').value,
    outcome:document.getElementById('r-outcome').value,
    notes:document.getElementById('r-notes').value.trim(),
  };
}

function hasRoundDraft(round=readRoundDraft()){
  return Boolean(round.type || round.date || round.notes || round.outcome!=='pending');
}

function commitRoundDraft(autoSave=false){
  const round=readRoundDraft();
  if(!hasRoundDraft(round)) return false;
  if(!round.type){
    alert(autoSave ? 'Please name the round before saving, or clear the draft round.' : 'Please enter a round name.');
    document.getElementById('r-type').focus();
    return null;
  }
  if(editingRoundIndex!==null) currentRounds[editingRoundIndex]=round;
  else currentRounds.push(round);
  resetRoundDraft();
  renderRounds();
  return true;
}

function startRoundEdit(i){
  const round=currentRounds[i];
  if(!round) return;
  editingRoundIndex=i;
  document.getElementById('r-type').value=round.type||'';
  document.getElementById('r-date').value=round.date||'';
  document.getElementById('r-outcome').value=round.outcome||'pending';
  document.getElementById('r-notes').value=round.notes||'';
  updateRoundFormUI();
  document.getElementById('r-type').focus();
}

function cancelRoundEdit(){
  resetRoundDraft();
  document.getElementById('r-type').focus();
}

function fillRoundType(type){
  document.getElementById('r-type').value=type;
  document.getElementById('r-type').focus();
}

function handleRoundDraftKeydown(event){
  if(event.key!=='Enter') return;
  event.preventDefault();
  addRound();
}

function openNewJob(){
  editJobId=null; currentRounds=[]; currentStatus='Applied';
  document.getElementById('job-modal-title').textContent='Add application';
  document.getElementById('j-company').value='';
  document.getElementById('j-role').value='';
  document.getElementById('j-date').value=new Date().toISOString().slice(0,10);
  document.getElementById('j-link').value='';
  document.getElementById('j-rec-name').value='';
  document.getElementById('j-rec-email').value='';
  document.getElementById('j-cv').value='';
  document.getElementById('j-cv-label').value='';
  document.getElementById('j-cl').value='';
  document.getElementById('j-rem-date').value='';
  document.getElementById('j-rem-note').value='';
  document.getElementById('j-notes').value='';
  resetRoundDraft();
  document.getElementById('j-del-btn').style.display='none';
  setStatusUI('Applied');
  renderRounds();
  document.getElementById('job-overlay').classList.add('open');
  document.getElementById('j-company').focus();
}

function openJob(id){
  const j=jobs.find(x=>x.id===id); if(!j)return;
  editJobId=id; currentRounds=(j.rounds||[]).map(r=>({...r})); currentStatus=j.status||'Applied';
  document.getElementById('job-modal-title').textContent='Edit application';
  document.getElementById('j-company').value=j.company||'';
  document.getElementById('j-role').value=j.role||'';
  document.getElementById('j-date').value=j.date||'';
  document.getElementById('j-link').value=j.link||'';
  document.getElementById('j-rec-name').value=j.recName||'';
  document.getElementById('j-rec-email').value=j.recEmail||'';
  document.getElementById('j-cv').value=j.cvPath||'';
  document.getElementById('j-cv-label').value=j.cvLabel||'';
  document.getElementById('j-cl').value=j.clPath||'';
  document.getElementById('j-rem-date').value=j.remDate||'';
  document.getElementById('j-rem-note').value=j.remNote||'';
  document.getElementById('j-notes').value=j.notes||'';
  resetRoundDraft();
  document.getElementById('j-del-btn').style.display='';
  setStatusUI(j.status||'Applied');
  renderRounds();
  document.getElementById('job-overlay').classList.add('open');
  document.getElementById('j-company').focus();
}

function renderRounds(){
  const container=document.getElementById('rounds-list');
  if(!currentRounds.length){
    container.innerHTML='<div class="round-empty">No interview steps logged yet. Use the quick picks below or type your own round.</div>';
    return;
  }
  container.innerHTML=currentRounds.map((r,i)=>{
    const dotClass=r.outcome==='pass'?'pass':r.outcome==='fail'?'fail':'pending';
    const badgeClass=r.outcome==='pass'?'outcome-pass':r.outcome==='fail'?'outcome-fail':'outcome-pending';
    const badgeText=r.outcome==='pass'?'Passed':r.outcome==='fail'?'Did not pass':'Pending';
    const metaParts=[];
    if(r.date) metaParts.push(r.date);
    if(r.notes) metaParts.push(esc(r.notes));
    const metaText=metaParts.length ? metaParts.join(' &middot; ') : 'No notes yet';
    return `<div class="round-item">
      <div class="round-dot ${dotClass}"></div>
      <div class="round-info">
        <div class="round-step">Step ${i+1}</div>
        <div class="round-item-top">
          <div>
            <div class="round-type">${esc(r.type||'Round '+(i+1))}</div>
            <div class="round-meta">${metaText}</div>
          </div>
          <div class="round-outcome ${badgeClass}">${badgeText}</div>
        </div>
      </div>
      <div class="round-item-actions">
        <button class="ghost-link" type="button" onclick="startRoundEdit(${i})">Edit</button>
        <button class="icon-btn" type="button" onclick="removeRound(${i})" title="Remove round">&times;</button>
      </div>
    </div>`;
  }).join('');
}

function addRound(){
  const added=commitRoundDraft(false);
  if(added) document.getElementById('r-type').focus();
}

function removeRound(i){
  if(editingRoundIndex===i) resetRoundDraft();
  else if(editingRoundIndex!==null && i<editingRoundIndex) editingRoundIndex--;
  currentRounds.splice(i,1);
  renderRounds();
}

function saveJob(){
  const company=document.getElementById('j-company').value.trim();
  const role=document.getElementById('j-role').value.trim();
  if(!company||!role){alert('Company and role are required.');return;}
  const draftCommitted=commitRoundDraft(true);
  if(draftCommitted===null) return;
  const job={
    id:editJobId||Date.now().toString(),
    company,role,
    status:currentStatus,
    date:document.getElementById('j-date').value,
    link:document.getElementById('j-link').value.trim(),
    recName:document.getElementById('j-rec-name').value.trim(),
    recEmail:document.getElementById('j-rec-email').value.trim(),
    cvPath:document.getElementById('j-cv').value.trim(),
    cvLabel:document.getElementById('j-cv-label').value.trim(),
    clPath:document.getElementById('j-cl').value.trim(),
    remDate:document.getElementById('j-rem-date').value,
    remNote:document.getElementById('j-rem-note').value.trim(),
    notes:document.getElementById('j-notes').value.trim(),
    rounds:currentRounds.map(r=>({...r})),
  };
  if(editJobId){jobs=jobs.map(j=>j.id===editJobId?job:j);}
  else{
    jobs.unshift(job);
    currentJobsPage = 1;
  }
  save(); render(); closeJobModal();
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

document.getElementById('job-overlay').addEventListener('click',function(e){if(e.target===this)closeJobModal();});
document.getElementById('cc-overlay').addEventListener('click',function(e){if(e.target===this)closeCCModal();});
load();
initSync();

