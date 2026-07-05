/* ===================================================================
   i-rCQI — APP.JS
   Sambungan ke Google Apps Script (backend) + logik penuh sistem
   =================================================================== */

// ===== KONFIGURASI — GANTI URL NI DENGAN WEB APP URL APPS SCRIPT AWAK =====
const API_URL = 'https://script.google.com/macros/s/AKfycbyfW-4nbX5SXNZ_YFO1IiY0S5n0BOXeab_m0_8sSBvJXKWj-UhZgmehq2Z1E0zGu7VYQg/exec';

// ===== STATE =====
let currentUser = null;
let cqiReports = [];
let laporanList = [];
let usersList = [];
let courseMasterList = [];
let programKursusList = [];
let pensyarahList = [];
let kelasList = [];
let pdfLogList = [];
let _shownPdfLogs = [];
let currentPage = 'dashboard';
let editingReportId = null;

// ===== ACCESS CONTROL =====
// Returns filtered reports based on current user's role and assigned course
function getVisibleReports() {
  if (!currentUser) return [];
  // Admin sees all
  if (currentUser.Peranan === 'admin') return cqiReports;
  // Coordinator & Head — only see their assigned course code(s)
  const assigned = (currentUser.KodKursus || '').toString().trim();
  if (!assigned) return cqiReports; // fallback: no restriction if unassigned
  const codes = assigned.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  return cqiReports.filter(r => codes.includes((r.KodKursus || '').toString().trim()));
}
async function apiGet(action, params) {
  const qs = new URLSearchParams({ action, ...(params || {}) }).toString();
  const res = await fetch(API_URL + '?' + qs);
  if (!res.ok) throw new Error('Ralat rangkaian: ' + res.status);
  return res.json();
}

async function apiPost(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // text/plain elak CORS preflight
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error('Ralat rangkaian: ' + res.status);
  return res.json();
}

// ===== TOAST NOTIFICATIONS =====
function toast(msg, type) {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ===== AUTH =====
async function doLogin() {
  const ic = document.getElementById('ic-input').value.trim().toUpperCase();
  const role = document.getElementById('role-select').value;
  const errEl = document.getElementById('login-err');
  const loadingEl = document.getElementById('login-loading');
  const btnEl = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (!ic) {
    errEl.textContent = 'Please enter your Staff ID.';
    errEl.style.display = 'block';
    return;
  }

  btnEl.disabled = true;
  loadingEl.style.display = 'block';

  try {
    const result = await apiGet('login', { ic, role });
    if (!result.success) {
      errEl.textContent = result.message || 'Staff ID not found or role mismatch.';
      errEl.style.display = 'block';
      return;
    }
    currentUser = result.data;
    enterApp();
  } catch (err) {
    errEl.textContent = 'Tidak dapat hubungi server. Semak sambungan internet awak. (' + err.message + ')';
    errEl.style.display = 'block';
  } finally {
    btnEl.disabled = false;
    loadingEl.style.display = 'none';
  }
}

function doLogout() {
  currentUser = null;
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('ic-input').value = '';
  document.getElementById('login-err').style.display = 'none';
}

async function enterApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-name-top').textContent = currentUser.Nama;
  document.getElementById('user-avatar').textContent = (currentUser.Nama || '').split(' ').map(w => w[0]).slice(0, 2).join('');
  renderSidebar();
  // Show loading state on dashboard first
  document.getElementById('main-content').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px;">
      <div class="spinner spinner-dark" style="width:36px;height:36px;border-width:3px;"></div>
      <div class="text-muted">Loading system data, please wait...</div>
    </div>`;
  await loadAllData();
  showPage('dashboard');
}

// ===== DATA LOADING =====
async function loadAllData() {
  try {
    const [reportsRes, laporanRes, courseRes, programRes, pensyarahRes, kelasRes, pdfLogRes] = await Promise.all([
      apiGet('getCQIReports'),
      apiGet('getLaporan'),
      apiGet('getCourseMaster'),
      apiGet('getProgramKursus'),
      apiGet('getPensyarah'),
      apiGet('getKelas'),
      apiGet('getPDFLog'),
    ]);
    if (reportsRes.success) cqiReports = reportsRes.data;
    if (laporanRes.success) laporanList = laporanRes.data;
    if (courseRes.success) courseMasterList = courseRes.data;
    if (programRes.success) programKursusList = programRes.data;
    if (pensyarahRes.success) pensyarahList = pensyarahRes.data;
    if (kelasRes.success) kelasList = kelasRes.data;
    if (pdfLogRes.success) pdfLogList = pdfLogRes.data;
    refreshCurrentPage();
  } catch (err) {
    toast('Gagal memuatkan data: ' + err.message, 'error');
  }
}

async function loadUsers() {
  try {
    const res = await apiGet('getUsers');
    if (res.success) usersList = res.data;
  } catch (err) {
    toast('Gagal memuatkan senarai pengguna: ' + err.message, 'error');
  }
}

function refreshCurrentPage() {
  showPage(currentPage, true);
}

// ===== NAVIGATION =====
const NAV_ITEMS = [
  { sep: 'Main Menu' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'reports', icon: '📝', label: 'CQI Reports', hideForLecturer: true },
  { id: 'pdfarchive', icon: '🗂️', label: 'PDF Archive' },
  { sep: 'Administration' },
  { id: 'kursus', icon: '🎓', label: 'Course Management', adminOnly: true },
  { id: 'pensyarah', icon: '👨‍🏫', label: 'Lecturers & Classes', adminOnly: true },
  { id: 'pengguna', icon: '👥', label: 'Users', adminOnly: true },
];

function renderSidebar() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = NAV_ITEMS.map(item => {
    if (item.sep) return `<div class="nav-sep">${item.sep}</div>`;
    if (item.adminOnly && currentUser.Peranan !== 'admin') return '';
    if (item.hideForLecturer && currentUser.Peranan === 'lecturer') return '';
    return `<div class="nav-item" data-page="${item.id}" onclick="showPage('${item.id}')">
      <span class="nav-icon">${item.icon}</span> ${item.label}
    </div>`;
  }).join('');
}

function setActiveNav(id) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === id);
  });
}

function showPage(id, silent) {
  currentPage = id;
  setActiveNav(id);
  const main = document.getElementById('main-content');
  if (id === 'dashboard') main.innerHTML = renderDashboard();
  // Lecturer — read only: dashboard and pdfarchive only
  if (currentUser.Peranan === 'lecturer' && !['dashboard', 'pdfarchive'].includes(id)) {
    main.innerHTML = `<div class="page-title">Access Restricted</div>
      <p class="text-muted">Lecturers can only access the Dashboard and PDF Archive.</p>`;
    return;
  }
  else if (id === 'reports') main.innerHTML = renderReportsPage();
  else if (id === 'pdfarchive') main.innerHTML = renderFullPDFArchivePage();
  else if (id === 'perbandingan') main.innerHTML = renderComparisonPage();
  else if (id === 'laporan') main.innerHTML = renderLaporanPage();
  else if (id === 'kursus') main.innerHTML = renderKursusPage();
  else if (id === 'pensyarah') main.innerHTML = renderPensyarahPage();
  else if (id === 'pengguna') { main.innerHTML = renderPenggunaPage(); loadUsers().then(() => { if (currentPage === 'pengguna') main.innerHTML = renderPenggunaPage(); }); }
}

window.onload = () => { initAllSigCanvases(); };
/* ===================================================================
   PAPAN PEMUKA (DASHBOARD)
   =================================================================== */

function renderDashboard() {
  const visibleReports = cqiReports; // Dashboard shows the overall picture (all courses)

  // Get unique filter options
  const allKursus = [...new Set(visibleReports.map(r => r.KodKursus).filter(Boolean))].sort();
  const allProgram = [...new Set(visibleReports.map(r => r.Program).filter(Boolean))].sort();
  const allSesi = [...new Set(visibleReports.map(r => r.Sesi).filter(Boolean))].sort().reverse();

  // Recent PDFs for this user
  const assignedKod = currentUser.KodKursus;
  let recentPDFs = pdfLogList.slice().reverse().slice(0, 5);
  if (currentUser.Peranan !== 'admin' && assignedKod) {
    recentPDFs = recentPDFs.filter(l => l.KodKursus === assignedKod);
  }

  const totalReports = visibleReports.length;
  const fullySigned = visibleReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan').length;
  const pendingSign = visibleReports.filter(r => r.StatusPenyelaras !== 'Disahkan').length;
  const pendingHead = visibleReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan').length;

  return `
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Welcome, ${esc(currentUser.Nama)}. Analytical overview of CQI Reports.</div>

    <!-- STATS ROW -->
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Reports</div><div class="stat-value">${totalReports}</div></div>
      <div class="stat-card"><div class="stat-label">✅ Fully Verified</div><div class="stat-value" style="color:var(--success);">${fullySigned}</div></div>
      <div class="stat-card"><div class="stat-label">⏳ Pending Coordinator</div><div class="stat-value" style="color:var(--amber);">${pendingSign}</div></div>
      <div class="stat-card"><div class="stat-label">⏳ Pending Head</div><div class="stat-value" style="color:var(--amber);">${pendingHead}</div></div>
    </div>

    <!-- FILTER BAR -->
    <div class="card" style="padding:1rem 1.5rem;">
      <b class="text-sm" style="display:block;margin-bottom:10px;">🔍 Filter &amp; Analyse</b>
      <div class="form-grid3">
        <div class="form-group mb-0">
          <label>Course Code</label>
          <select id="dash-filter-kursus" onchange="renderDashCharts()">
            <option value="">— All Courses —</option>
            ${allKursus.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Programme</label>
          <select id="dash-filter-program" onchange="renderDashCharts()">
            <option value="">— All Programmes —</option>
            ${allProgram.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Session</label>
          <select id="dash-filter-sesi" onchange="renderDashCharts()">
            <option value="">— All Sessions —</option>
            ${allSesi.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- CHARTS AREA -->
    <div id="dash-charts-area">
      <div class="card" style="text-align:center;padding:2rem;color:var(--text-muted);">
        <div style="font-size:36px;margin-bottom:8px;">📊</div>
        <div>Select a filter above to display CLO/PLO trend charts.</div>
      </div>
    </div>

    <!-- RECENT PDFS -->
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
        📁 PDF Archive
        <button class="btn btn-outline btn-sm" onclick="showPage('pdfarchive')">View Full Archive ↗</button>
      </div>
      <div class="form-grid3" style="margin-bottom:1rem;">
        <div class="form-group mb-0">
          <label>Filter by Course</label>
          <select id="pdf-dash-kursus" onchange="renderDashPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Courses —</option>
            ${[...new Set(pdfLogList.map(l => l.KodKursus).filter(Boolean))].sort().map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Filter by Session</label>
          <select id="pdf-dash-sesi" onchange="renderDashPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Sessions —</option>
            ${[...new Set(pdfLogList.map(l => l.Sesi).filter(Boolean))].sort().reverse().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Filter by Generated By</label>
          <select id="pdf-dash-oleh" onchange="renderDashPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Users —</option>
            ${[...new Set(pdfLogList.map(l => l.JanaOleh).filter(Boolean))].sort().map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="dash-pdf-list">
        ${renderDashPDFTable(recentPDFs)}
      </div>
    </div>`;
}

function showAllPDFs() {
  showPage('pdfarchive');
}

function renderDashPDFTable(logs, allowDelete) {
  if (!logs.length) return `<p class="text-sm text-muted">No PDFs found for the selected filters.</p>`;
  const canDelete = allowDelete && currentUser.Peranan === 'admin';
  if (canDelete) _shownPdfLogs = logs;
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>File Name</th><th>Course</th><th>Session</th><th>Generated By</th><th>Date</th><th></th>${canDelete ? '<th></th>' : ''}</tr></thead>
    <tbody>${logs.map((l, i) => `<tr>
      <td style="color:var(--text-muted);font-size:12px;">${i + 1}</td>
      <td style="font-size:12px;">${esc(l.NamaFail || l.KodKursus)}</td>
      <td><span class="tag tag-blue">${esc(l.KodKursus)}</span></td>
      <td>${esc(l.Sesi)}</td>
      <td>${esc(l.JanaOleh)}</td>
      <td>${fmtDate(l.TarikhJana)}</td>
      <td>${l.DriveURL ? `<a href="${esc(l.DriveURL)}" target="_blank" class="btn btn-blue btn-sm">📄 Open</a>` : '—'}</td>
      ${canDelete ? `<td><button class="btn btn-red btn-sm" onclick="deletePDFLog(${i})">Delete</button></td>` : ''}
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderDashPDFs() {
  const kod = document.getElementById('pdf-dash-kursus')?.value || '';
  const sesi = document.getElementById('pdf-dash-sesi')?.value || '';
  const oleh = document.getElementById('pdf-dash-oleh')?.value || '';
  const assignedKod = currentUser.KodKursus;
  let logs = pdfLogList.slice().reverse();
  if (currentUser.Peranan !== 'admin' && assignedKod) logs = logs.filter(l => l.KodKursus === assignedKod);
  if (kod) logs = logs.filter(l => l.KodKursus === kod);
  if (sesi) logs = logs.filter(l => l.Sesi === sesi);
  if (oleh) logs = logs.filter(l => l.JanaOleh === oleh);
  const el = document.getElementById('dash-pdf-list');
  if (el) el.innerHTML = renderDashPDFTable(logs);
}

function renderFullPDFArchivePage() {
  const assignedKod = currentUser.KodKursus;
  let logs = pdfLogList.slice().reverse();
  if (currentUser.Peranan !== 'admin' && assignedKod) logs = logs.filter(l => l.KodKursus === assignedKod);

  const allKursus = [...new Set(logs.map(l => l.KodKursus).filter(Boolean))].sort();
  const allSesi = [...new Set(logs.map(l => l.Sesi).filter(Boolean))].sort().reverse();
  const allOleh = [...new Set(logs.map(l => l.JanaOleh).filter(Boolean))].sort();

  return `
    <div class="page-title">🗂️ PDF Archive</div>
    <div class="page-sub">All generated CQI Report PDFs. Filter and open directly from Google Drive.</div>

    <div class="card" style="padding:1rem 1.5rem;">
      <b class="text-sm" style="display:block;margin-bottom:10px;">🔍 Filter PDFs</b>
      <div class="form-grid3">
        <div class="form-group mb-0">
          <label>Course Code</label>
          <select id="pdf-full-kursus" onchange="filterFullPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Courses —</option>
            ${allKursus.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Session</label>
          <select id="pdf-full-sesi" onchange="filterFullPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Sessions —</option>
            ${allSesi.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label>Generated By</label>
          <select id="pdf-full-oleh" onchange="filterFullPDFs()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:100%;">
            <option value="">— All Users —</option>
            ${allOleh.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div id="pdf-full-list">${renderDashPDFTable(logs, true)}</div>
    </div>`;
}

function filterFullPDFs() {
  const kod = document.getElementById('pdf-full-kursus')?.value || '';
  const sesi = document.getElementById('pdf-full-sesi')?.value || '';
  const oleh = document.getElementById('pdf-full-oleh')?.value || '';
  const assignedKod = currentUser.KodKursus;
  let logs = pdfLogList.slice().reverse();
  if (currentUser.Peranan !== 'admin' && assignedKod) logs = logs.filter(l => l.KodKursus === assignedKod);
  if (kod) logs = logs.filter(l => l.KodKursus === kod);
  if (sesi) logs = logs.filter(l => l.Sesi === sesi);
  if (oleh) logs = logs.filter(l => l.JanaOleh === oleh);
  const el = document.getElementById('pdf-full-list');
  if (el) el.innerHTML = renderDashPDFTable(logs, true);
}

async function deletePDFLog(i) {
  const l = _shownPdfLogs[i];
  if (!l) return;
  if (!confirm(`Delete this PDF archive entry?\n\n${l.NamaFail || l.KodKursus}\n\nThis removes the log entry (and its Drive file if linked). This cannot be undone.`)) return;
  try {
    const result = await apiPost('deletePDFLog', {
      id: l.ID || '',
      driveURL: l.DriveURL || '',
      namaFail: l.NamaFail || ''
    });
    if (result.success) {
      toast('Archive entry deleted.', 'success');
      await loadAllData();
      showPage('pdfarchive');
    } else {
      toast(result.message || 'Delete failed.', 'error');
    }
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function renderDashCharts() {
  const kod = document.getElementById('dash-filter-kursus')?.value || '';
  const program = document.getElementById('dash-filter-program')?.value || '';
  const sesi = document.getElementById('dash-filter-sesi')?.value || '';
  const area = document.getElementById('dash-charts-area');
  if (!area) return;

  let filtered = getVisibleReports().filter(r =>
    (!kod || r.KodKursus === kod) &&
    (!program || r.Program === program) &&
    (!sesi || r.Sesi === sesi)
  ).sort((a, b) => String(a.Sesi).localeCompare(String(b.Sesi)));

  if (!filtered.length) {
    area.innerHTML = `<div class="card" style="text-align:center;padding:2rem;color:var(--text-muted);"><div style="font-size:36px;margin-bottom:8px;">🔍</div><div>No reports match the selected filters.</div></div>`;
    return;
  }

  // Build CLO trend data (all CLOs across sessions)
  const cloIds = [...new Set(filtered.flatMap(r => safeParseArr(r.CLOData).map(c => c.id)))];
  const ploIds = [...new Set(filtered.flatMap(r => safeParseArr(r.PLOData).map(p => p.id)))];
  const sessions = filtered.map(r => r.Sesi);
  const colors = ['#185FA5','#3B6D11','#BA7517','#A32D2D','#5F5E5A','#378ADD','#6DB33F'];

  // CLO chart
  const cloLines = cloIds.map((id, i) => {
    const points = filtered.map(r => {
      const clo = safeParseArr(r.CLOData).find(c => c.id === id);
      return parseFloat(clo?.pct) || 0;
    });
    return { id, points, color: colors[i % colors.length] };
  });

  // PLO chart
  const ploLines = ploIds.map((id, i) => {
    const points = filtered.map(r => {
      const plo = safeParseArr(r.PLOData).find(p => p.id === id);
      return parseFloat(plo?.pct) || 0;
    });
    return { id, points, color: colors[i % colors.length] };
  });

  // Grade trend
  const gradeKeys = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'];
  const gradeColors = { 'A+':'#185FA5','A':'#378ADD','A-':'#6BAED6','B+':'#3B6D11','B':'#74C476','B-':'#A1D99B','C+':'#BA7517','C':'#FEC44F','C-':'#FEE391','D+':'#A32D2D','D':'#FB6A4A','E':'#FCBBA1','E-':'#FEE0D2','F':'#5F5E5A' };

  const chartHTML = (title, lines, labels, threshold) => {
    threshold = threshold || 50;
    if (!labels.length) return '';
    if (!lines.length) return `<div class="card" style="margin-bottom:1.25rem;"><div class="card-title">${title}</div><p class="text-sm text-muted">No data available. Please fill in % Current values in the CQI Report form.</p></div>`;

    const maxVal = 100;
    const w = 700, h = 240, padL = 45, padB = 40, padT = 20, padR = 20;
    const chartW = w - padL - padR;
    const chartH = h - padB - padT;
    const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW / 2;

    // Grid lines
    const gridLines = [0, 25, 50, 75, 100].map(v => {
      const y = padT + chartH - (v / maxVal) * chartH;
      const isThreshold = v === threshold;
      return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}"
        stroke="${isThreshold ? '#A32D2D' : '#e0e0e0'}"
        stroke-width="${isThreshold ? 1.5 : 1}"
        stroke-dasharray="${isThreshold ? '6,3' : 'none'}"/>
        <text x="${padL - 5}" y="${y + 4}" text-anchor="end" font-size="10"
          fill="${isThreshold ? '#A32D2D' : '#999'}" font-weight="${isThreshold ? 'bold' : 'normal'}">${v}%</text>
        ${isThreshold ? `<text x="${w - padR + 2}" y="${y + 4}" font-size="9" fill="#A32D2D">≥${threshold}%</text>` : ''}`;
    }).join('');

    // X labels
    const xLabels = labels.map((l, i) => {
      const x = padL + i * xStep;
      return `<text x="${x}" y="${h - 6}" text-anchor="middle" font-size="10" fill="#666">${esc(l)}</text>`;
    }).join('');

    // Lines & dots with color based on threshold
    const linesSVG = lines.map(line => {
      const pts = line.points.map((v, i) => `${padL + i * xStep},${padT + chartH - (v / maxVal) * chartH}`).join(' ');
      const dots = line.points.map((v, i) => {
        const cx = padL + i * xStep;
        const cy = padT + chartH - (v / maxVal) * chartH;
        const dotColor = v < threshold ? '#A32D2D' : line.color;
        return `<circle cx="${cx}" cy="${cy}" r="5" fill="${dotColor}" stroke="white" stroke-width="1.5">
          <title>${line.id}: ${v}% (${v >= threshold ? '✓ Achieved' : '✗ Below ' + threshold + '%'})</title>
        </circle>
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="9" fill="${dotColor}">${v}%</text>`;
      }).join('');
      return `<polyline points="${pts}" fill="none" stroke="${line.color}" stroke-width="2" stroke-linejoin="round" opacity="0.8"/>
              ${dots}`;
    }).join('');

    // Legend
    const legend = lines.map(l => `
      <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:12px;">
        <span style="width:16px;height:3px;background:${l.color};display:inline-block;border-radius:2px;"></span>${esc(l.id)}
      </span>`).join('');

    return `<div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">${title}</div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-height:240px;">
        ${gridLines}${xLabels}${linesSVG}
      </svg>
      <div style="margin-top:8px;flex-wrap:wrap;display:flex;align-items:center;">
        ${legend}
        <span style="margin-left:auto;font-size:11px;color:#A32D2D;">— — Threshold ≥${threshold}%  🔴 = Below threshold</span>
      </div>
    </div>`;
  };

  // Build achievement indicator — list CLO/PLO that failed ≥50%
  const failedItems = [];
  filtered.forEach(r => {
    safeParseArr(r.CLOData).forEach(c => {
      if ((parseFloat(c.pct) || 0) < 50) failedItems.push({ type: 'CLO', id: c.id, desc: c.desc, pct: c.pct, sesi: r.Sesi, kod: r.KodKursus, prog: r.Program });
    });
    safeParseArr(r.PLOData).forEach(p => {
      if ((parseFloat(p.pct) || 0) < 50) failedItems.push({ type: 'PLO', id: p.id, desc: p.desc, pct: p.pct, sesi: r.Sesi, kod: r.KodKursus, prog: r.Program });
    });
  });

  const achievementCard = `
    <div class="card" style="margin-bottom:1.25rem;">
      <div class="card-title">🎯 CLO/PLO Achievement Indicator (Threshold: ≥50%)</div>
      ${failedItems.length === 0
        ? `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--success-light);border-radius:8px;">
            <span style="font-size:28px;">✅</span>
            <div><b style="color:var(--success);">All CLO & PLO Achieved!</b><div class="text-sm text-muted">All outcomes meet the ≥50% threshold for the selected filters.</div></div>
          </div>`
        : `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--danger-light);border-radius:8px;margin-bottom:12px;">
            <span style="font-size:28px;">⚠️</span>
            <div><b style="color:var(--danger);">${failedItems.length} outcome(s) below 50% threshold</b>
            <div class="text-sm text-muted">The following CLO/PLO did not achieve the minimum ≥50%:</div></div>
          </div>
          <div class="table-wrap"><table style="font-size:13px;">
            <thead><tr><th>Type</th><th>ID</th><th>Description</th><th>%</th><th>Course</th><th>Programme</th><th>Session</th></tr></thead>
            <tbody>${failedItems.map(f => `
              <tr>
                <td><span class="tag ${f.type === 'CLO' ? 'tag-blue' : 'tag-amber'}">${f.type}</span></td>
                <td><b>${esc(f.id)}</b></td>
                <td style="max-width:200px;font-size:12px;">${esc(f.desc || '—')}</td>
                <td><b style="color:var(--danger);">${esc(f.pct)}%</b></td>
                <td>${esc(f.kod)}</td>
                <td>${esc(f.prog)}</td>
                <td>${esc(f.sesi)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
    </div>`;

  area.innerHTML =
    achievementCard +
    chartHTML('📈 CLO Achievement Trend (%)', cloLines, sessions, 50) +
    chartHTML('📈 PLO Achievement Trend (%)', ploLines, sessions, 50) +
    (filtered.length > 0 ? renderGradeTable(filtered) : '');
}

function renderGradeTable(reports) {
  if (!reports.length) return '';
  const gradeKeys = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'];
  const rows = reports.map(r => {
    const gd = safeParseObj(r.GredData);
    return `<tr>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.Program)}</td>
      <td>${esc(r.Sesi)}</td>
      ${gradeKeys.map(g => `<td style="text-align:center;font-size:12px;">${gd[g] || '—'}</td>`).join('')}
    </tr>`;
  }).join('');
  return `<div class="card">
    <div class="card-title">📊 Student Grade Distribution (%)</div>
    <div class="table-wrap"><table style="font-size:12px;">
      <thead><tr><th>Code</th><th>Prog</th><th>Session</th>${gradeKeys.map(g => `<th>${g}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function computeAvgCloAll(reports) {
  const list = reports || getVisibleReports();
  const allClo = [];
  list.forEach(r => {
    const clos = safeParseArr(r.CLOData);
    clos.forEach(c => { if (c.pct !== '' && c.pct !== undefined) allClo.push(parseFloat(c.pct) || 0); });
  });
  if (!allClo.length) return null;
  return Math.round(allClo.reduce((a, b) => a + b, 0) / allClo.length);
}

function statusBadge(r) {
  if (r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan') {
    return '<span class="tag tag-green">✓ Fully Verified</span>';
  }
  if (r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan') {
    return '<span class="tag tag-amber">⏳ Pending Head</span>';
  }
  return '<span class="tag tag-gray">📝 Draft</span>';
}

function emptyState(icon, msg) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div>${msg}</div></div>`;
}

/* ===================================================================
   SENARAI LAPORAN CQI
   =================================================================== */

function renderReportsPage() {
  const visibleReports = getVisibleReports();

  // Get unique sessions for filter
  const sessions = [...new Set(visibleReports.map(r => r.Sesi).filter(Boolean))].sort().reverse();
  const filterHTML = `
    <div class="flex items-center gap-8" style="margin-bottom:1rem;">
      <label class="text-sm" style="white-space:nowrap;font-weight:500;">Filter by Session:</label>
      <select id="session-filter-reports" onchange="filterReportsBySession()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">
        <option value="">— All Sessions —</option>
        ${sessions.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
      </select>
      ${sessions.length === 0 ? '<span class="text-sm text-muted">(No sessions recorded yet)</span>' : ''}
    </div>`;

  const rows = visibleReports.map((r, i) => `
    <tr class="report-row" data-sesi="${esc(r.Sesi)}">
      <td style="color:var(--text-muted);font-size:12px;">${i + 1}</td>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.NamaKursus)}</td>
      <td><span class="tag tag-gray">${esc(r.Program || '—')}</span></td>
      <td>${esc(r.Sesi)}</td>
      <td>${esc(r.BilPelajar)}</td>
      <td>${statusBadge(r)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openReportDetail('${r.ID}')">Verify</button>
        <button class="btn btn-outline btn-sm" onclick="openReportForm('${r.ID}')">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="duplicateReport('${r.ID}')" title="Copy this report to new session">⧉ Copy</button>
        ${currentUser.Peranan === 'admin' ? `<button class="btn btn-red btn-sm" onclick="deleteReport('${r.ID}')">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="page-title">CQI Reports</div>
    <div class="page-sub">Manage Continuous Quality Improvement reports for each course.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openReportForm()">＋ Add CQI Report</button>
    </div>
    <div class="card">
      ${filterHTML}
      ${visibleReports.length === 0 ? emptyState('📝', 'No CQI reports yet. Click "Add CQI Report" to start.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Code</th><th>Course Name</th><th>Programme</th><th>Session</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="reports-tbody">${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

/* ===================================================================
   PERBANDINGAN SESI
   =================================================================== */

function renderComparisonPage() {
  const options = getVisibleReports().map(r => `<option value="${r.ID}">${esc(r.KodKursus)} — ${esc(r.NamaKursus)} (${esc(r.Sesi)})</option>`).join('');
  return `
    <div class="page-title">Session Comparison</div>
    <div class="page-sub">Compare CLO &amp; PLO achievement between current and previous sessions.</div>
    <div class="card">
      <div class="form-group">
        <label>Select Report</label>
        <select id="compare-select" onchange="renderComparisonResult()">
          <option value="">— Select Course —</option>
          ${options}
        </select>
      </div>
    </div>
    <div id="compare-result"></div>`;
}

function renderComparisonResult() {
  const id = document.getElementById('compare-select').value;
  const resEl = document.getElementById('compare-result');
  if (!id) { resEl.innerHTML = ''; return; }
  const r = cqiReports.find(x => x.ID === id);
  if (!r) { resEl.innerHTML = ''; return; }

  const clos = safeParseArr(r.CLOData);
  const plos = safeParseArr(r.PLOData);

  const cloBars = clos.map(c => compareBarHTML(c.id, c.desc, c.pct, c.pctLepas)).join('');
  const ploBars = plos.map(p => compareBarHTML(p.id, p.desc, p.pct, p.pctLepas)).join('');

  resEl.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Current Session</div><div class="stat-value" style="font-size:18px;">${esc(r.Sesi)}</div></div>
      <div class="stat-card"><div class="stat-label">Previous Session</div><div class="stat-value" style="font-size:18px;">${esc(r.SesiLepas) || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">No. of Students</div><div class="stat-value">${esc(r.BilPelajar)}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Perbandingan CLO</div>
      ${clos.length ? cloBars : '<p class="text-muted text-sm">No CLO data.</p>'}
      ${legendHTML()}
    </div>
    <div class="card">
      <div class="card-title">Perbandingan PLO</div>
      ${plos.length ? ploBars : '<p class="text-muted text-sm">No PLO data.</p>'}
      ${legendHTML()}
    </div>
    <div class="card">
      <div class="card-title">Comments &amp; Recommendations</div>
      <p class="text-sm" style="margin-bottom:8px;"><b>Ulasan:</b> ${esc(r.Ulasan) || '<em class="text-muted">Tiada</em>'}</p>
      <p class="text-sm"><b>Cadangan:</b> ${esc(r.Cadangan) || '<em class="text-muted">Tiada</em>'}</p>
    </div>`;
}

function compareBarHTML(id, desc, pctCurr, pctPrev) {
  const c = parseFloat(pctCurr) || 0;
  const p = parseFloat(pctPrev) || 0;
  const diff = (c - p).toFixed(1);
  const dc = diff > 0 ? '#3B6D11' : diff < 0 ? '#A32D2D' : '#5F5E5A';
  return `
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;display:flex;justify-content:space-between;">
        <span><b>${esc(id)}</b> — ${esc(desc)}</span>
        <span style="color:${dc};font-weight:600;">${diff > 0 ? '+' : ''}${diff}%</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">Semasa: ${c}%</div>
      <div style="height:20px;background:var(--bg2);border-radius:4px;"><div style="height:100%;width:${Math.min(c,100)}%;background:#378ADD;border-radius:4px;"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin:4px 0 2px;">Previous Session: ${p}%</div>
      <div style="height:20px;background:var(--bg2);border-radius:4px;"><div style="height:100%;width:${Math.min(p,100)}%;background:#B5D4F4;border-radius:4px;"></div></div>
    </div>`;
}

function legendHTML() {
  return `<div style="display:flex;gap:16px;margin-top:8px;font-size:12px;">
    <span><span style="display:inline-block;width:12px;height:12px;background:#378ADD;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Current Session</span>
    <span><span style="display:inline-block;width:12px;height:12px;background:#B5D4F4;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Previous Session</span>
  </div>`;
}

/* ===================================================================
   UTILITI
   =================================================================== */

function esc(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeParseArr(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { const p = JSON.parse(s); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

function safeParseObj(s) {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s) || {}; } catch (e) { return {}; }
}
/* ===================================================================
   BORANG LAPORAN CQI PENUH — 7 BAHAGIAN (ikut template rasmi)
   =================================================================== */

let pendingFiles = { minit: null, aktiviti: null };

function openReportForm(id) {
  editingReportId = id || null;
  const existing = id ? cqiReports.find(r => r.ID === id) : null;
  pendingFiles = { minit: null, aktiviti: null };

  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open" id="modal-report">
    <div class="modal" style="max-width:1080px;width:96vw;">
      <div class="modal-title">${existing ? '✏️ Edit' : '📝 Add'} CQI Report</div>

      <!-- 1.0 COURSE INFORMATION -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">1</span>Course Information</div>
        ${programKursusList.length === 0 ? `<div class="alert alert-amber">⏳ Data is still loading. Please close and reopen this form in a moment.</div>` : ''}
        <div class="form-grid mt-2">
          <div class="form-group">
            <label>Department</label>
            <select id="f-jabatan" onchange="onJabatanChange()">
              <option value="">— Select Department —</option>
              ${[...new Set(programKursusList.map(p => p.Jabatan))].map(j => `<option value="${esc(j)}" ${existing?.Jabatan === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Programme</label>
            <select id="f-program" onchange="onProgramChange()">
              <option value="">— Select Department first —</option>
            </select>
          </div>
          <div class="form-group full">
            <label>Course Code &amp; Name</label>
            <select id="f-kod" onchange="onKursusChange()" style="margin-bottom:6px;">
              <option value="">— Select Programme first —</option>
            </select>
            <input type="hidden" id="f-nama" value="${esc(existing?.NamaKursus)}">
            <div class="form-hint" id="kursus-hint"></div>
          </div>
          <div class="form-group"><label>Current Session</label><input id="f-sesi" value="${esc(existing?.Sesi)}" placeholder="e.g.: 2:2025/2026"></div>
          <input type="hidden" id="f-sesi-lepas" value="${esc(existing?.SesiLepas)}">
          <div class="form-group"><label>1.4 Number of Students</label><input type="number" id="f-pelajar" value="${esc(existing?.BilPelajar)}"></div>
        </div>
        <div class="mt-2">
          <div class="flex items-center justify-between"><b class="text-sm">1.2/1.3 Class &amp; Lecturer</b>
            <div class="flex gap-8">
              <button class="btn btn-outline btn-sm" type="button" onclick="addLecturerRow()">+ Add Row</button>
              <button class="btn btn-outline btn-sm" type="button" onclick="openAddLecturerModal()">+ New Lecturer</button>
              <button class="btn btn-outline btn-sm" type="button" onclick="openAddClassModal()">+ New Class</button>
            </div>
          </div>
          <div class="repeat-header" style="grid-template-columns:1fr 1fr 40px;margin-top:6px;">
            <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">LECTURER NAME</span>
            <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">CLASS NAME</span>
            <span></span>
          </div>
          <div id="lecturer-rows"></div>
          <p class="form-hint mt-1">Select from list or type if name/class is not in the list.</p>
        </div>
      </div>

      <div class="alert alert-info" id="no-course-warning" style="display:none;">⚠️ Belum ada kursus disetup oleh Admin. Sila hubungi Administrator untuk menambah kursus &amp; CLO/PLO terlebih dahulu di "Pengurusan Kursus".</div>

      <!-- 2.0 MINIT PERBINCANGAN -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">2</span>Discussion Minutes</div>
        <div class="form-grid mt-2">
          <div class="form-group"><label>2.1 Meeting Attendance</label>
            <div id="kehadiran-wrap" style="border:1px solid var(--border);border-radius:7px;padding:10px;background:#fff;min-height:44px;max-height:160px;overflow-y:auto;">
              <div id="kehadiran-checkboxes" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"></div>
              <div id="kehadiran-empty" class="text-sm text-muted">Select course first to display lecturer list.</div>
            </div>
            <div class="form-hint mt-1">Tick all lecturers who attended the meeting.</div>
          </div>
          <div class="form-group"><label>2.2 Date</label><input type="date" id="f-minit-tarikh" value="${esc(existing?.MinitTarikh)}"></div>
          <div class="form-group"><label>2.3 Time</label><input type="time" id="f-minit-masa" value="${esc(existing?.MinitMasa)}"></div>
          <div class="form-group"><label>2.4 Venue</label><input id="f-minit-tempat" value="${esc(existing?.MinitTempat)}"></div>
        </div>
      </div>

      <!-- 3.0 ISU CLO & PLO -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">3</span>CLO &amp; PLO Issues</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>3.1 CLO Issues</label><textarea id="f-isu-clo" style="min-height:50px;">${esc(existing?.IsuCLO)}</textarea></div>
          <div class="form-group full"><label>3.2 PLO Issues</label><textarea id="f-isu-plo" style="min-height:50px;">${esc(existing?.IsuPLO)}</textarea></div>
        </div>
      </div>

      <!-- 4.0 PROGRAM/AKTIVITI CQI -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">4</span>CQI Programme / Activity / Task</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>4.1 Activity / Programme Name</label><input id="f-akt-nama" value="${esc(existing?.AktivitiNama)}"></div>
          <div class="form-group"><label>4.2 Implementation Date</label><input type="date" id="f-akt-tarikh" value="${esc(existing?.AktivitiTarikh)}"></div>
          <div class="form-group"><label>4.3 Number of Students</label><input type="number" id="f-akt-pelajar" value="${esc(existing?.AktivitiBilPelajar)}"></div>
          <div class="form-group full"><label>4.4 Objective</label><textarea id="f-akt-objektif" style="min-height:50px;">${esc(existing?.AktivitiObjektif)}</textarea></div>
          <div class="form-group full"><label>4.5 Activity Summary</label><textarea id="f-akt-ringkasan" style="min-height:60px;">${esc(existing?.AktivitiRingkasan)}</textarea></div>
        </div>
      </div>

      <!-- 5.0 STUDENT PERFORMANCE -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">5</span>Student Performance</div>

        <!-- Previous Session Comparison — at top of section 5 -->
        <div class="section-block mt-2" style="background:var(--amber-light);border:1px solid #FAC775;">
          <b class="text-sm" style="color:var(--amber);">📂 Previous Session Comparison</b>
          <p class="text-sm mt-1" style="color:var(--amber);margin-bottom:8px;">Fill in all current data below first, then select a previous session to auto-fill comparison data (grades, CLO &amp; PLO).</p>
          <div class="flex items-center gap-8">
            <select id="prev-session-select" style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;" onchange="loadPreviousSessionData()">
              <option value="">— Select previous session —</option>
            </select>
            <button class="btn btn-outline btn-sm" onclick="clearPreviousData()">✕ Clear</button>
          </div>
        </div>

        <div class="mt-2"><b class="text-sm">5.1 Student Grades (% of students)</b>
          <div class="alert alert-info mt-1" style="margin-bottom:8px;font-size:12px;">
            💡 <b>How to fill:</b> Enter the <b>percentage (%) of students</b> for each grade. Total of all grades must equal <b>100%</b>. Previous session data will auto-fill when you select a previous session above (📂 box).
          </div>
          <div class="table-wrap mt-1">
            <table style="font-size:11px;">
              <thead>
                <tr>
                  <th style="background:var(--bg2);min-width:80px;">Session</th>
                  ${['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'].map(g=>`<th>${g}</th>`).join('')}
                  <th style="background:var(--primary-light);color:var(--primary);">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr id="grade-row-inputs" style="background:#F0F7FF;">
                  <td style="font-weight:600;font-size:11px;color:var(--primary);padding:4px 6px;">Current</td>
                  ${['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'].map(g => {
                    const gd = safeParseObj(existing?.GredData);
                    return `<td><input type="number" step="0.1" min="0" max="100" data-grade="${g}" value="${esc(gd[g] || '')}" style="width:48px;padding:4px;font-size:11px;" oninput="if(parseFloat(this.value)<0)this.value=0; autoCalcQO()"></td>`;
                  }).join('')}
                  <td id="grade-total" style="font-weight:700;font-size:12px;color:var(--primary);text-align:center;vertical-align:middle;">0%</td>
                </tr>
                <tr style="background:#F8F9FA;">
                  <td style="font-weight:600;font-size:11px;color:var(--gray);padding:4px 6px;">Previous</td>
                  ${['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'].map(g => {
                    const gdPrev = safeParseObj(existing?.GredDataLepas);
                    return `<td><input type="number" step="0.1" min="0" max="100" data-grade-prev="${g}" value="${esc(gdPrev[g] || '')}" style="width:48px;padding:4px;font-size:11px;background:#F8F9FA;" readonly></td>`;
                  }).join('')}
                  <td id="grade-total-prev" style="font-weight:700;font-size:12px;color:var(--gray);text-align:center;vertical-align:middle;">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div id="grade-total-warn" class="hidden" style="color:var(--danger);font-size:12px;margin-top:4px;">⚠️ Total exceeds 100% — please check values entered. Make sure you are entering PERCENTAGE (%), not number of students.</div>
          <div class="form-hint mt-1">Total of all grades should equal 100%.</div>
        </div>

        <div class="mt-2"><b class="text-sm">5.2 Quality Objectives (Auto-Calculated)</b>
          <span id="qo-kpi-badge" class="tag tag-blue" style="margin-left:8px;font-size:11px;display:none;"></span>
          <div class="section-block mt-1" style="background:var(--primary-light);">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div>
                <div class="text-sm text-muted mb-0" id="qo1-label">QO1: ≥90% students achieved grade D and above</div>
                <div id="qo1-result" style="font-size:20px;font-weight:700;margin:4px 0;">—</div>
                <div id="qo1-calc" class="text-sm text-muted"></div>
              </div>
              <div>
                <div class="text-sm text-muted mb-0" id="qo2-label">QO2: ≥25% students achieved grade B and above</div>
                <div id="qo2-result" style="font-size:20px;font-weight:700;margin:4px 0;">—</div>
                <div id="qo2-calc" class="text-sm text-muted"></div>
              </div>
            </div>
          </div>
          <div class="form-grid mt-1">
            <div class="form-group">
              <label>Preventive/Corrective Action (QO1: ≥D grade)</label>
              <input id="f-qo1-tindakan" value="${esc(existing?.QualityObj1Tindakan)}" placeholder="State action if required...">
            </div>
            <div class="form-group">
              <label>Preventive/Corrective Action (QO2: ≥B grade)</label>
              <input id="f-qo2-tindakan" value="${esc(existing?.QualityObj2Tindakan)}" placeholder="State action if required...">
            </div>
          </div>
          <input type="hidden" id="f-qo1-capai" value="${esc(existing?.QualityObj1Capai || '')}">
          <input type="hidden" id="f-qo2-capai" value="${esc(existing?.QualityObj2Capai || '')}">
        </div>

        <div class="mt-2">
          <b class="text-sm">5.3 Course Learning Outcome (CLO)</b>
          <div class="text-sm text-muted" style="font-size:11px;margin:2px 0 4px;">Isi kolum <b>Now</b> (sesi semasa); <b>Prev</b> auto-isi dari sesi lepas.</div>
          <div style="display:grid;grid-template-columns:46px 1fr 68px 68px 48px 68px 68px 48px;align-items:end;gap:2px;margin-top:6px;">
            <span></span><span></span>
            <span style="grid-column:span 3;text-align:center;font-weight:700;font-size:11px;color:var(--primary);border-bottom:2px solid #B5D4F4;padding-bottom:2px;">Group Attainment (%)</span>
            <span style="grid-column:span 3;text-align:center;font-weight:700;font-size:11px;color:var(--primary);border-bottom:2px solid #B5D4F4;padding-bottom:2px;">Student Achievement ≥50% (%)</span>
          </div>
          <div class="repeat-header" style="grid-template-columns:46px 1fr 68px 68px 48px 68px 68px 48px;" id="clo-header-row"><span>CLO</span><span>Description</span><span>Now</span><span>Prev</span><span>Diff</span><span>Now</span><span>Prev</span><span>Diff</span></div>
          <div id="clo-rows"></div>
          <div class="text-sm text-muted mt-1" id="clo-empty-msg">Select course first to display CLO.</div>
        </div>

        <div class="mt-2">
          <b class="text-sm">5.4 Programme Learning Outcome (PLO)</b>
          <div class="text-sm text-muted" style="font-size:11px;margin:2px 0 4px;">Isi kolum <b>Now</b> (sesi semasa); <b>Prev</b> auto-isi dari sesi lepas.</div>
          <div style="display:grid;grid-template-columns:46px 1fr 68px 68px 48px 68px 68px 48px;align-items:end;gap:2px;margin-top:6px;">
            <span></span><span></span>
            <span style="grid-column:span 3;text-align:center;font-weight:700;font-size:11px;color:var(--primary);border-bottom:2px solid #B5D4F4;padding-bottom:2px;">Group Attainment (%)</span>
            <span style="grid-column:span 3;text-align:center;font-weight:700;font-size:11px;color:var(--primary);border-bottom:2px solid #B5D4F4;padding-bottom:2px;">Student Achievement ≥50% (%)</span>
          </div>
          <div class="repeat-header" style="grid-template-columns:46px 1fr 68px 68px 48px 68px 68px 48px;" id="plo-header-row"><span>PLO</span><span>Description</span><span>Now</span><span>Prev</span><span>Diff</span><span>Now</span><span>Prev</span><span>Diff</span></div>
          <div id="plo-rows"></div>
          <div class="text-sm text-muted mt-1" id="plo-empty-msg">Select Department, Programme &amp; course first to display PLO.</div>
        </div>
      </div>

      <!-- 6.0 COMMENTS -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">6</span>Comments &amp; Recommendations</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>6.1 Comments</label><textarea id="f-ulasan" style="min-height:60px;">${esc(existing?.Ulasan)}</textarea></div>
          <div class="form-group full"><label>6.2 Recommendations</label><textarea id="f-cadangan" style="min-height:60px;">${esc(existing?.Cadangan)}</textarea></div>
        </div>
      </div>


      <!-- 7.0 ATTACHMENTS -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">7</span>Attachments</div>
        <div class="form-grid mt-2">
          <div class="form-group">
            <label>7.1 Discussion Minutes</label>
            <div class="file-drop ${existing?.LampiranMinitURL ? 'has-file' : ''}" id="drop-minit" onclick="document.getElementById('file-minit').click()">
              <input type="file" id="file-minit" class="hidden" accept=".pdf,.png,.jpg,.jpeg" onchange="handleFileSelect(this,'minit')">
              <div id="drop-minit-label">${existing?.LampiranMinitURL ? '📎 File exists — click to replace' : '📎 Click to select file (PDF/Image)'}</div>
            </div>
            ${existing?.LampiranMinitURL ? `<div class="file-item"><a href="${esc(existing.LampiranMinitURL)}" target="_blank" class="file-link">View existing file ↗</a></div>` : ''}
          </div>
          <div class="form-group">
            <label>7.2 CQI Activity / Programme Report</label>
            <div class="file-drop ${existing?.LampiranAktivitiURL ? 'has-file' : ''}" id="drop-aktiviti" onclick="document.getElementById('file-aktiviti').click()">
              <input type="file" id="file-aktiviti" class="hidden" accept=".pdf,.png,.jpg,.jpeg" onchange="handleFileSelect(this,'aktiviti')">
              <div id="drop-aktiviti-label">${existing?.LampiranAktivitiURL ? '📎 File exists — click to replace' : '📎 Click to select file (PDF/Image)'}</div>
            </div>
            ${existing?.LampiranAktivitiURL ? `<div class="file-item"><a href="${esc(existing.LampiranAktivitiURL)}" target="_blank" class="file-link">View existing file ↗</a></div>` : ''}
          </div>
        </div>
      </div>

      <!-- COORDINATOR SIGNATURE (sign before saving to submit) -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">✓</span>Coordinator Signature</div>
        <div class="form-hint mt-1">Sign below to <b>submit</b> this report for Head of Course verification. If left blank, it is saved as a <b>Draft</b>.</div>
        <div class="sig-wrap mt-2">
          <canvas class="sig-canvas" id="sig-canvas-coord" width="460" height="140"></canvas>
          <div class="sig-hint" id="sig-hint-coord">Sign here</div>
        </div>
        <div class="sig-actions mt-1" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-outline btn-sm" type="button" onclick="clearSigCanvas('coord')">Clear</button>
          <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;">📤 Upload signature<input type="file" accept="image/*" style="display:none;" onchange="uploadSigImage('coord', this)"></label>
          <span class="text-muted" style="font-size:11px;">Draw or upload. Signed by: <b>${esc(currentUser.Nama)}</b></span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeReportModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-report" onclick="saveReportForm()">Save Report</button>
      </div>
    </div>
  </div>`;

  // Populate repeatable rows
  const lecturers = existing?.Pensyarah ? safeParseArr(existing.Pensyarah) : [];
  if (lecturers.length) {
    lecturers.forEach(l => addLecturerRow(typeof l === 'object' ? l : { kelas: '', pensyarah: l }));
  } else {
    addLecturerRow();
  }

  // Setup cascading dropdowns
  populateProgramDropdown(existing?.Jabatan, existing?.Program);
  populateKursusDropdown(existing?.Jabatan, existing?.Program, existing?.KodKursus);

  // If editing an existing report, render its saved CLO/PLO immediately
  if (existing) {
    renderOutcomeRows('clo', safeParseArr(existing.CLOData));
    renderOutcomeRows('plo', safeParseArr(existing.PLOData));
  }

  // Coordinator signature pad (sign to submit)
  initSigCanvas('sig-canvas-coord');
  if (existing?.SigPenyelarasData) loadSigOntoCanvas('sig-canvas-coord', existing.SigPenyelarasData);

  if (courseMasterList.length === 0) {
    document.getElementById('no-course-warning').style.display = 'block';
  }

  // Refresh Jabatan dropdown dynamically (in case data loaded after form opened)
  refreshJabatanDropdown(existing?.Jabatan, existing?.Program, existing?.KodKursus);

  // Trigger auto-calculate jika edit mode (data gred sedia ada)
  if (existing?.GredData) setTimeout(() => autoCalcQO(), 100);
}

function refreshJabatanDropdown(selectedJabatan, selectedProgram, selectedKod) {
  const sel = document.getElementById('f-jabatan');
  if (!sel) return;
  const jabatanList = [...new Set(programKursusList.map(p => p.Jabatan))].sort();
  sel.innerHTML = '<option value="">— Select Department —</option>' +
    jabatanList.map(j => `<option value="${esc(j)}" ${j === selectedJabatan ? 'selected' : ''}>${esc(j)}</option>`).join('');
  if (selectedJabatan) {
    populateProgramDropdown(selectedJabatan, selectedProgram);
    populateKursusDropdown(selectedJabatan, selectedProgram, selectedKod);
  }
}

function closeReportModal() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ===== CASCADING DROPDOWN: Jabatan -> Program -> Kursus -> CLO/PLO ===== */

function populateProgramDropdown(selectedJabatan, selectedProgram) {
  const sel = document.getElementById('f-program');
  const jabatan = selectedJabatan || document.getElementById('f-jabatan').value;
  if (!jabatan) { sel.innerHTML = '<option value="">— Select Department first —</option>'; return; }
  const programs = [...new Set(programKursusList.filter(p => p.Jabatan === jabatan).map(p => p.Program))];
  sel.innerHTML = '<option value="">— Select Programme —</option>' + programs.map(p => `<option value="${esc(p)}" ${p === selectedProgram ? 'selected' : ''}>${esc(p)}</option>`).join('');
}

function onJabatanChange() {
  populateProgramDropdown();
  populateKursusDropdown();
  clearOutcomeRows();
}

function populateKursusDropdown(selectedJabatan, selectedProgram, selectedKod) {
  const sel = document.getElementById('f-kod');
  const jabatan = selectedJabatan || document.getElementById('f-jabatan').value;
  const program = selectedProgram || document.getElementById('f-program').value;
  if (!jabatan || !program) { sel.innerHTML = '<option value="">— Select Programme first —</option>'; return; }
  const links = programKursusList.filter(p => p.Jabatan === jabatan && p.Program === program);
  if (!links.length) { sel.innerHTML = '<option value="">— No courses linked to this programme —</option>'; return; }
  sel.innerHTML = '<option value="">— Select Course —</option>' + links.map(l => {
    const course = courseMasterList.find(c => c.KodKursus === l.KodKursus);
    const label = course ? `${course.KodKursus} — ${course.NamaKursus}` : l.KodKursus;
    return `<option value="${esc(l.KodKursus)}" ${l.KodKursus === selectedKod ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');

  if (selectedKod) onKursusChange();
}

function onProgramChange() {
  populateKursusDropdown();
  clearOutcomeRows();
}

function onKursusChange() {
  const jabatan = document.getElementById('f-jabatan').value;
  const program = document.getElementById('f-program').value;
  const kod = document.getElementById('f-kod').value;
  const hintEl = document.getElementById('kursus-hint');

  if (!kod) { clearOutcomeRows(); if (hintEl) hintEl.textContent = ''; return; }

  const course = courseMasterList.find(c => c.KodKursus === kod);
  const link = programKursusList.find(p => p.Jabatan === jabatan && p.Program === program && p.KodKursus === kod);

  document.getElementById('f-nama').value = course ? course.NamaKursus : '';
  if (hintEl) hintEl.textContent = course ? `Course Name: ${course.NamaKursus}` : '';

  // Kalau courseMasterList belum load, retry selepas 1 saat
  if (!course && courseMasterList.length === 0) {
    if (hintEl) hintEl.textContent = 'Loading course data...';
    setTimeout(() => onKursusChange(), 1000);
    return;
  }

  const clos = course ? safeParseArr(course.CLOList) : [];
  const plos = link ? safeParseArr(link.PLOList) : [];

  // preserve existing % values if this kursus matches what's already saved (edit mode)
  const existing = editingReportId ? cqiReports.find(r => r.ID === editingReportId) : null;
  const savedClos = existing && existing.KodKursus === kod ? safeParseArr(existing.CLOData) : [];
  const savedPlos = existing && existing.KodKursus === kod ? safeParseArr(existing.PLOData) : [];

  const cloRows = clos.map(c => {
    const saved = savedClos.find(s => s.id === c.id);
    return { id: c.id, desc: c.desc, pct: saved?.pct || '', pctLepas: saved?.pctLepas || '', pctGA: saved?.pctGA || '', pctGALepas: saved?.pctGALepas || '' };
  });
  const ploRows = plos.map(p => {
    const saved = savedPlos.find(s => s.id === p.id);
    return { id: p.id, desc: p.desc, pct: saved?.pct || '', pctLepas: saved?.pctLepas || '', pctGA: saved?.pctGA || '', pctGALepas: saved?.pctGALepas || '' };
  });

  renderOutcomeRows('clo', cloRows);
  renderOutcomeRows('plo', ploRows);

  // Refresh datalist untuk Kelas & Pensyarah ikut kursus yang dipilih
  refreshLecturerDatalist(kod);
  // Refresh senarai kehadiran
  refreshKehadiranCheckboxes(kod);
  // Populate previous session dropdown
  populatePrevSessionDropdown(kod, jabatan, program);
  // Update KPI badge terus bila kursus dipilih
  const course2 = courseMasterList.find(c => c.KodKursus === kod);
  const t1 = parseFloat(course2?.QO1Threshold) || 90;
  const t2 = parseFloat(course2?.QO2Threshold) || 25;
  const badge = document.getElementById('qo-kpi-badge');
  const lbl1 = document.getElementById('qo1-label');
  const lbl2 = document.getElementById('qo2-label');
  if (badge) { badge.textContent = `Course KPI: QO1 ≥${t1}% | QO2 ≥${t2}%`; badge.style.display = 'inline-block'; }
  if (lbl1) lbl1.textContent = `QO1: ≥${t1}% students achieved grade D and above`;
  if (lbl2) lbl2.textContent = `QO2: ≥${t2}% students achieved grade B and above`;
}

function refreshKehadiranCheckboxes(kod) {
  const wrap = document.getElementById('kehadiran-checkboxes');
  const emptyMsg = document.getElementById('kehadiran-empty');
  if (!wrap) return;
  const pList = pensyarahList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah);
  if (!pList.length) {
    wrap.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';
  // Get currently checked (for edit mode)
  const existing = editingReportId ? cqiReports.find(r => r.ID === editingReportId) : null;
  const savedKehadiran = existing ? safeParseArr(existing.MinitKehadiran) : [];
  wrap.innerHTML = pList.map(p => `
    <label style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:13px;background:#fff;white-space:nowrap;transition:all 0.15s;"
      onmouseover="this.style.background='var(--primary-light)'" onmouseout="if(!this.querySelector('input').checked)this.style.background='#fff'">
      <input type="checkbox" class="kehadiran-cb" value="${esc(p)}" ${savedKehadiran.includes(p) ? 'checked' : ''}
        style="cursor:pointer;width:14px;height:14px;"
        onchange="this.closest('label').style.background=this.checked?'var(--primary-light)':'#fff';this.closest('label').style.borderColor=this.checked?'var(--primary)':'var(--border)';">
      ${esc(p)}
    </label>`).join('');
}

function populatePrevSessionDropdown(kod, jabatan, program) {
  const sel = document.getElementById('prev-session-select');
  if (!sel) return;
  const currentId = editingReportId || null;
  const matches = cqiReports.filter(r =>
    r.KodKursus === kod &&
    r.Jabatan === jabatan &&
    r.Program === program &&
    r.ID !== currentId &&
    safeParseArr(r.CLOData).length > 0
  );
  if (!matches.length) {
    sel.innerHTML = '<option value="">— No previous session data found for this course —</option>';
    return;
  }
  const sorted = matches.slice().sort((a, b) => String(b.Sesi).localeCompare(String(a.Sesi)));
  sel.innerHTML = '<option value="">— Select previous session to auto-fill % Previous —</option>' +
    sorted.map(r => `<option value="${esc(r.ID)}">${esc(r.Sesi)} (${esc(r.Program)})</option>`).join('');
}

function loadPreviousSessionData() {
  const sel = document.getElementById('prev-session-select');
  const prevId = sel?.value;
  if (!prevId) return;
  const prevReport = cqiReports.find(r => r.ID === prevId);
  if (!prevReport) return;
  const prevClos = safeParseArr(prevReport.CLOData);
  const prevPlos = safeParseArr(prevReport.PLOData);

  // Update % Previous untuk CLO
  document.querySelectorAll('#clo-rows .repeat-row').forEach(row => {
    const id = row.querySelector('.oc-id')?.value;
    const prevClo = prevClos.find(c => c.id === id);
    const prevInput = row.querySelector('.oc-pct-lepas');
    if (prevInput && prevClo) { prevInput.value = prevClo.pct || ''; const _ga = row.querySelector('.oc-ga-lepas'); if (_ga) _ga.value = prevClo.pctGA || ''; updateOcDiff(row.querySelector('.oc-pct')); }
  });

  // Update % Previous untuk PLO
  document.querySelectorAll('#plo-rows .repeat-row').forEach(row => {
    const id = row.querySelector('.oc-id')?.value;
    const prevPlo = prevPlos.find(p => p.id === id);
    const prevInput = row.querySelector('.oc-pct-lepas');
    if (prevInput && prevPlo) { prevInput.value = prevPlo.pct || ''; const _ga = row.querySelector('.oc-ga-lepas'); if (_ga) _ga.value = prevPlo.pctGA || ''; updateOcDiff(row.querySelector('.oc-pct')); }
  });

  // Auto-isi baris gred Previous dari laporan sesi lepas
  const prevGrades = safeParseObj(prevReport.GredData);
  let prevTotal = 0;
  document.querySelectorAll('[data-grade-prev]').forEach(inp => {
    const g = inp.dataset.gradePrev;
    const val = parseFloat(prevGrades[g] || 0);
    inp.value = val || '';
    prevTotal += val;
  });
  const prevTotalEl = document.getElementById('grade-total-prev');
  if (prevTotalEl) {
    prevTotalEl.textContent = prevTotal > 0 ? prevTotal.toFixed(1) + '%' : '—';
    prevTotalEl.style.color = prevTotal >= 99 && prevTotal <= 101 ? 'var(--success)' : 'var(--gray)';
  }

  // Auto-isi field Previous Session
  const sesiLepasInput = document.getElementById('f-sesi-lepas');
  if (sesiLepasInput && prevReport.Sesi) sesiLepasInput.value = prevReport.Sesi;

  toast(`Previous session data loaded: ${prevReport.Sesi}`, 'success');
}

function clearPreviousData() {
  document.querySelectorAll('#clo-rows .repeat-row, #plo-rows .repeat-row').forEach(row => {
    const prevInput = row.querySelector('.oc-pct-lepas');
    if (prevInput) { prevInput.value = ''; updateOcDiff(row.querySelector('.oc-pct')); }
  });
  // Clear baris gred Previous
  document.querySelectorAll('[data-grade-prev]').forEach(inp => inp.value = '');
  const prevTotalEl = document.getElementById('grade-total-prev');
  if (prevTotalEl) { prevTotalEl.textContent = '—'; prevTotalEl.style.color = 'var(--gray)'; }

  const sel = document.getElementById('prev-session-select');
  if (sel) sel.value = '';
  const sesiLepasInput = document.getElementById('f-sesi-lepas');
  if (sesiLepasInput) sesiLepasInput.value = '';
  toast('Previous session data cleared.', 'success');
}

function refreshLecturerDatalist(kod) {
  const program = document.getElementById('f-program')?.value || '';
  const allKelas = kelasList.filter(k => k.KodKursus === kod).map(k => k.NamaKelas);
  const kList = program
    ? allKelas.filter(k => k.toUpperCase().startsWith(program.toUpperCase()))
    : allKelas;
  const pList = pensyarahList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah);

  document.querySelectorAll('#lecturer-rows .repeat-row').forEach(row => {
    const kelasInput = row.querySelector('.lec-kelas');
    if (kelasInput) {
      const dl = document.getElementById(kelasInput.getAttribute('list'));
      if (dl) dl.innerHTML = kList.map(k => `<option value="${esc(k)}">`).join('');
    }
    const pensyarahInput = row.querySelector('.lec-pensyarah');
    if (pensyarahInput && pensyarahInput.tagName === 'INPUT') {
      const dl = document.getElementById(pensyarahInput.getAttribute('list'));
      if (dl) dl.innerHTML = pList.map(p => `<option value="${esc(p)}">`).join('');
    }
  });
}

function clearOutcomeRows() {
  document.getElementById('clo-rows').innerHTML = '';
  document.getElementById('plo-rows').innerHTML = '';
  document.getElementById('clo-empty-msg').style.display = 'block';
  document.getElementById('plo-empty-msg').style.display = 'block';
}

function autoCalcQO() {
  const grades = {};
  let total = 0;
  document.querySelectorAll('#grade-row-inputs input[data-grade]').forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    grades[inp.dataset.grade] = val;
    total += val;
  });

  // Update jumlah
  const totalEl = document.getElementById('grade-total');
  const warnEl = document.getElementById('grade-total-warn');
  if (totalEl) {
    totalEl.textContent = total.toFixed(1) + '%';
    if (total === 0) { totalEl.style.color = 'var(--text-muted)'; }
    else if (total >= 99 && total <= 101) { totalEl.style.color = 'var(--success)'; }
    else if (total > 101) { totalEl.style.color = 'var(--danger)'; }
    else { totalEl.style.color = 'var(--amber)'; } // hampir 100% tapi belum tepat
  }
  if (warnEl) {
    if (total > 101) {
      warnEl.textContent = `⚠️ Jumlah ${total.toFixed(1)}% melebihi 100% — sila semak semula nilai yang dimasukkan. Pastikan anda memasukkan PERATUSAN (%), bukan bilangan pelajar.`;
      warnEl.classList.remove('hidden');
    } else if (total > 0 && total < 99) {
      warnEl.textContent = `ℹ️ Jumlah semasa: ${total.toFixed(1)}% — belum mencapai 100%. Sila pastikan semua gred sudah diisi.`;
      warnEl.classList.remove('hidden');
      warnEl.style.color = 'var(--amber)';
    } else {
      warnEl.classList.add('hidden');
    }
  }

  // Ambil threshold dari kursus yang dipilih (default 90/25)
  const kod = document.getElementById('f-kod')?.value || '';
  const course = courseMasterList.find(c => c.KodKursus === kod);
  const threshold1 = parseFloat(course?.QO1Threshold) || 90;
  const threshold2 = parseFloat(course?.QO2Threshold) || 25;

  // QO1: gred D ke atas
  const dAndAbove = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D'];
  const sumQO1 = dAndAbove.reduce((s, g) => s + (grades[g] || 0), 0);

  // QO2: gred B ke atas
  const bAndAbove = ['A+','A','A-','B+','B','B-'];
  const sumQO2 = bAndAbove.reduce((s, g) => s + (grades[g] || 0), 0);

  const allZero = total === 0;
  const qo1Pass = sumQO1 >= threshold1;
  const qo2Pass = sumQO2 >= threshold2;

  const r1 = document.getElementById('qo1-result');
  const r2 = document.getElementById('qo2-result');
  const c1 = document.getElementById('qo1-calc');
  const c2 = document.getElementById('qo2-calc');

  if (r1) {
    r1.textContent = allZero ? '—' : (qo1Pass ? '✅ Yes' : '❌ No');
    r1.style.color = allZero ? 'var(--text-muted)' : (qo1Pass ? 'var(--success)' : 'var(--danger)');
    if (c1) c1.textContent = !allZero ? `Total D and above: ${sumQO1.toFixed(1)}% (Threshold: ≥${threshold1}%)` : '';
  }
  if (r2) {
    r2.textContent = allZero ? '—' : (qo2Pass ? '✅ Yes' : '❌ No');
    r2.style.color = allZero ? 'var(--text-muted)' : (qo2Pass ? 'var(--success)' : 'var(--danger)');
    if (c2) c2.textContent = !allZero ? `Total B and above: ${sumQO2.toFixed(1)}% (Threshold: ≥${threshold2}%)` : '';
  }

  // Update label threshold & badge
  const badge = document.getElementById('qo-kpi-badge');
  const lbl1 = document.getElementById('qo1-label');
  const lbl2 = document.getElementById('qo2-label');
  if (badge) {
    badge.textContent = `Course KPI: QO1 ≥${threshold1}% | QO2 ≥${threshold2}%`;
    badge.style.display = 'inline-block';
  }
  if (lbl1) lbl1.textContent = `QO1: ≥${threshold1}% students achieved grade D and above`;
  if (lbl2) lbl2.textContent = `QO2: ≥${threshold2}% students achieved grade B and above`;

  // Save dalam hidden fields
  const h1 = document.getElementById('f-qo1-capai');
  const h2 = document.getElementById('f-qo2-capai');
  if (h1) h1.value = allZero ? '' : (qo1Pass ? 'Ya' : 'Tidak');
  if (h2) h2.value = allZero ? '' : (qo2Pass ? 'Ya' : 'Tidak');
}

function renderOutcomeRows(kind, items) {
  const wrap = document.getElementById(kind + '-rows');
  const emptyMsg = document.getElementById(kind + '-empty-msg');
  wrap.innerHTML = '';
  if (!items.length) { emptyMsg.style.display = 'block'; return; }
  emptyMsg.style.display = 'none';
  items.forEach(d => {
    const row = document.createElement('div');
    row.className = 'repeat-row';
    row.style.gridTemplateColumns = '46px 1fr 68px 68px 48px 68px 68px 48px';
    row.innerHTML = `
      <input type="text" class="oc-id" value="${esc(d.id)}" readonly style="background:#F1EFE8;font-size:12px;">
      <input type="text" class="oc-desc" value="${esc(d.desc)}" readonly style="background:#F1EFE8;font-size:12px;" title="${esc(d.desc)}">
      <input type="number" class="oc-ga" value="${esc(d.pctGA || '')}" step="0.1" placeholder="%" oninput="updateOcDiff(this)" style="font-size:12px;">
      <input type="number" class="oc-ga-lepas" value="${esc(d.pctGALepas || '')}" step="0.1" placeholder="%" oninput="updateOcDiff(this)" style="font-size:12px;">
      <span class="oc-ga-diff text-sm" style="text-align:center;color:var(--text-muted);font-size:11px;">—</span>
      <input type="number" class="oc-pct" value="${esc(d.pct)}" step="0.1" placeholder="%" oninput="updateOcDiff(this)" style="font-size:12px;">
      <input type="number" class="oc-pct-lepas" value="${esc(d.pctLepas)}" step="0.1" placeholder="%" oninput="updateOcDiff(this)" style="font-size:12px;">
      <span class="oc-diff text-sm" style="text-align:center;color:var(--text-muted);font-size:11px;">—</span>`;
    wrap.appendChild(row);
    updateOcDiff(row.querySelector('.oc-pct'));
  });
}

function addLecturerRow(val) {
  const wrap = document.getElementById('lecturer-rows');
  const kod = document.getElementById('f-kod')?.value || '';
  const program = document.getElementById('f-program')?.value || '';

  // Pensyarah list — ikut kod kursus
  const pList = pensyarahList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah);

  // Kelas list — ikut kod kursus, difilter ikut prefix program
  const allKelas = kelasList.filter(k => k.KodKursus === kod).map(k => k.NamaKelas);
  const kList = program
    ? allKelas.filter(k => k.toUpperCase().startsWith(program.toUpperCase()))
    : allKelas;

  const uid = Date.now() + Math.floor(Math.random() * 1000);
  const pensyarah = (val && typeof val === 'object') ? (val.pensyarah || '') : (typeof val === 'string' ? val : '');
  const kelas = (val && typeof val === 'object') ? (val.kelas || '') : '';

  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '1fr 1fr 40px';
  row.innerHTML = `
    <div>
      <input type="text" class="lec-pensyarah" value="${esc(pensyarah)}"
        placeholder="Type or select lecturer" list="pensyarah-list-${uid}" autocomplete="off"
        onblur="autoSavePensyarah(this, '${esc(kod)}')">
      <datalist id="pensyarah-list-${uid}">${pList.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    </div>
    <div>
      <input type="text" class="lec-kelas" value="${esc(kelas)}"
        placeholder="Type or select class" list="kelas-list-${uid}" autocomplete="off"
        onblur="autoSaveKelas(this, '${esc(kod)}')">
      <datalist id="kelas-list-${uid}">${kList.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
    </div>
    <button class="btn btn-red btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

async function autoSavePensyarah(input, kod) {
  const nama = input.value.trim();
  if (!nama || !kod) return;
  if (pensyarahList.some(p => p.KodKursus === kod && p.NamaPensyarah.toLowerCase() === nama.toLowerCase())) return;
  try {
    const result = await apiPost('savePensyarah', { data: { KodKursus: kod, NamaPensyarah: nama } });
    if (result.success) {
      pensyarahList.push({ ID: result.id, KodKursus: kod, NamaPensyarah: nama });
      refreshLecturerDatalist(kod);
    }
  } catch (e) { /* silent fail */ }
}

async function autoSaveKelas(input, kod) {
  const nama = input.value.trim();
  if (!nama || !kod) return;
  // Semak kalau dah ada dalam senarai tempatan
  if (kelasList.some(k => k.KodKursus === kod && k.NamaKelas.toLowerCase() === nama.toLowerCase())) return;
  // Save ke Sheets secara senyap (silent)
  try {
    const result = await apiPost('saveKelas', { data: { KodKursus: kod, NamaKelas: nama } });
    if (result.success && result.message !== 'Kelas sudah wujud.') {
      // Add ke senarai tempatan supaya datalist terus kemaskini
      kelasList.push({ ID: result.id, KodKursus: kod, NamaKelas: nama });
      refreshLecturerDatalist(kod);
      refreshKehadiranCheckboxes(kod);
    }
  } catch (e) { /* silent fail */ }
}

function updateOcDiff(el) {
  const row = el.closest('.repeat-row');
  const setDiff = (curSel, prevSel, diffSel) => {
    const curEl = row.querySelector(curSel), prevEl = row.querySelector(prevSel), diffEl = row.querySelector(diffSel);
    if (!diffEl) return;
    const cur = parseFloat(curEl ? curEl.value : '') || 0;
    const prev = parseFloat(prevEl ? prevEl.value : '') || 0;
    const diff = (cur - prev).toFixed(1);
    diffEl.textContent = (diff > 0 ? '+' : '') + diff + '%';
    diffEl.style.color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)';
  };
  setDiff('.oc-ga', '.oc-ga-lepas', '.oc-ga-diff');
  setDiff('.oc-pct', '.oc-pct-lepas', '.oc-diff');
}


function handleFileSelect(input, kind) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Fail terlalu besar (maksimum 5MB).', 'error');
    input.value = '';
    return;
  }
  pendingFiles[kind] = file;
  document.getElementById('drop-' + kind).classList.add('has-file');
  document.getElementById('drop-' + kind + '-label').textContent = '✓ ' + file.name;
}

function collectGradeData() {
  const data = {};
  document.querySelectorAll('#grade-row-inputs [data-grade], [data-grade]').forEach(inp => {
    if (inp.dataset.grade) data[inp.dataset.grade] = inp.value || '';
  });
  return data;
}

function collectGradeDataPrev() {
  const data = {};
  document.querySelectorAll('[data-grade-prev]').forEach(inp => {
    data[inp.dataset.gradePrev] = inp.value || '';
  });
  return data;
}

function collectOutcomeData(kind) {
  const rows = document.querySelectorAll(`#${kind}-rows .repeat-row`);
  return Array.from(rows).map(row => ({
    id: row.querySelector('.oc-id').value,
    desc: row.querySelector('.oc-desc').value,
    pct: row.querySelector('.oc-pct').value,
    pctLepas: row.querySelector('.oc-pct-lepas').value,
    pctGA: row.querySelector('.oc-ga') ? row.querySelector('.oc-ga').value : '',
    pctGALepas: row.querySelector('.oc-ga-lepas') ? row.querySelector('.oc-ga-lepas').value : '',
  }));
}

async function uploadPendingFile(kind, kodKursus) {
  const file = pendingFiles[kind];
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        const result = await apiPost('uploadFile', {
          data: {
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64,
            kodKursus: kodKursus,
            jenisLampiran: kind === 'minit' ? 'Discussion Minutes' : 'Laporan Aktiviti',
            uploadOleh: currentUser.Nama,
          }
        });
        if (result.success) resolve(result.url);
        else reject(new Error(result.message));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveReportForm() {
  const btn = document.getElementById('btn-save-report');
  const jabatan = document.getElementById('f-jabatan').value;
  const program = document.getElementById('f-program').value;
  const kod = document.getElementById('f-kod').value.trim();
  const nama = document.getElementById('f-nama').value.trim();
  if (!jabatan || !program || !kod) { toast('Sila pilih Jabatan, Program, dan Kod Kursus.', 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

  try {
    const existing = editingReportId ? cqiReports.find(r => r.ID === editingReportId) : null;

    // Upload files first if any selected
    let minitUrl = existing?.LampiranMinitURL || '';
    let aktivitiUrl = existing?.LampiranAktivitiURL || '';
    if (pendingFiles.minit) minitUrl = await uploadPendingFile('minit', kod);
    if (pendingFiles.aktiviti) aktivitiUrl = await uploadPendingFile('aktiviti', kod);

    // Collect kehadiran dari checkboxes
    const kehadiran = Array.from(document.querySelectorAll('.kehadiran-cb:checked')).map(cb => cb.value);

    const lecturers = Array.from(document.querySelectorAll('#lecturer-rows .repeat-row')).map(row => ({
      kelas: row.querySelector('.lec-kelas').value,
      pensyarah: row.querySelector('.lec-pensyarah').value,
    })).filter(l => l.kelas || l.pensyarah);

    const payload = {
      ID: editingReportId || undefined,
      Jabatan: jabatan,
      Program: program,
      KodKursus: kod,
      NamaKursus: nama,
      Pensyarah: JSON.stringify(lecturers),
      Sesi: document.getElementById('f-sesi').value,
      SesiLepas: document.getElementById('f-sesi-lepas').value,
      BilPelajar: document.getElementById('f-pelajar').value,
      MinitKehadiran: JSON.stringify(kehadiran),
      MinitTarikh: document.getElementById('f-minit-tarikh').value,
      MinitMasa: document.getElementById('f-minit-masa').value,
      MinitTempat: document.getElementById('f-minit-tempat').value,
      IsuCLO: document.getElementById('f-isu-clo').value,
      IsuPLO: document.getElementById('f-isu-plo').value,
      AktivitiNama: document.getElementById('f-akt-nama').value,
      AktivitiTarikh: document.getElementById('f-akt-tarikh').value,
      AktivitiBilPelajar: document.getElementById('f-akt-pelajar').value,
      AktivitiObjektif: document.getElementById('f-akt-objektif').value,
      AktivitiRingkasan: document.getElementById('f-akt-ringkasan').value,
      GredData: JSON.stringify(collectGradeData()),
      GredDataLepas: JSON.stringify(collectGradeDataPrev()),
      QualityObj1Capai: document.getElementById('f-qo1-capai').value,
      QualityObj1Tindakan: document.getElementById('f-qo1-tindakan').value,
      QualityObj2Capai: document.getElementById('f-qo2-capai').value,
      QualityObj2Tindakan: document.getElementById('f-qo2-tindakan').value,
      CLOData: JSON.stringify(collectOutcomeData('clo')),
      PLOData: JSON.stringify(collectOutcomeData('plo')),
      Ulasan: document.getElementById('f-ulasan').value,
      Cadangan: document.getElementById('f-cadangan').value,
      LampiranMinitURL: minitUrl,
      LampiranAktivitiURL: aktivitiUrl,
      CreatedBy: currentUser.Nama,
    };

    // Coordinator signature captured in the form → submit for Head verification.
    // Editing never cancels signatures: if blank on edit, existing signature is preserved.
    const coordSig = sigCanvasState['sig-canvas-coord'];
    if (coordSig && coordSig.hasSig) {
      const coordCanvas = document.getElementById('sig-canvas-coord');
      payload.SigPenyelarasData = coordCanvas.toDataURL('image/png');
      payload.SignedByPenyelaras = existing?.SignedByPenyelaras || currentUser.Nama;
      payload.StatusPenyelaras = 'Disahkan';
      payload.TarikhPenyelaras = existing?.TarikhPenyelaras || new Date().toISOString();
    }

    const result = await apiPost('saveCQIReport', { data: payload });
    if (!result.success) { toast(result.message || 'Gagal menyimpan.', 'error'); return; }

    toast('Laporan CQI berjaya disimpan.', 'success');
    closeReportModal();
    await loadAllData();
    showPage('reports');
  } catch (err) {
    toast('Ralat: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Report';
  }
}

async function deleteReport(id) {
  const rep = cqiReports.find(x => x.ID === id);
  if (!confirm('Delete this CQI report? This will also remove its PDF(s) from the archive. This cannot be undone.')) return;
  try {
    const result = await apiPost('deleteCQIReport', { id });
    if (result.success) {
      // Cascade: remove matching PDF archive entries for this report
      if (rep) {
        const fileName = `CQI_${rep.KodKursus}_${rep.Program || ''}_${(rep.Sesi || '').replace(/[\/\s]/g, '-')}.pdf`;
        try { await apiPost('deletePDFLog', { namaFail: fileName, all: true }); } catch (e) {}
      }
      toast('Report and its archive PDFs deleted.', 'success');
      await loadAllData();
      showPage('reports');
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}
/* ===================================================================
   PAPARAN DETAIL LAPORAN + TANDATANGAN DIGITAL 2 PERINGKAT
   =================================================================== */

function openReportDetail(id) {
  const r = cqiReports.find(x => x.ID === id);
  if (!r) return;
  const clos = safeParseArr(r.CLOData);
  const plos = safeParseArr(r.PLOData);
  const lecturers = safeParseArr(r.Pensyarah);

  // Get Head of Course name from CourseMaster
  const course = courseMasterList.find(c => c.KodKursus === r.KodKursus);
  const headName = course?.HeadOfCourse || '—';

  // Determine what actions current user can take
  const isCoord = currentUser.Peranan === 'penyelaras' || currentUser.Peranan === 'admin';
  const isHead = currentUser.Peranan === 'ketua' || currentUser.Peranan === 'admin';
  const isDraft = r.StatusPenyelaras !== 'Disahkan';
  const isSubmitted = r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan';
  const isComplete = r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan';

  const canCoordSign = isCoord && isDraft;
  const canHeadSign = isHead && isSubmitted;

  // Progress steps
  const step1Done = !isDraft;
  const step2Done = isComplete;
  const progressHTML = `
    <div class="progress-steps" style="margin-bottom:1.5rem;">
      <div class="progress-step ${step1Done ? 'done' : 'active'}">
        <div style="font-size:18px;margin-bottom:4px;">${step1Done ? '✅' : '✏️'}</div>
        <div>Coordinator Signs</div>
      </div>
      <div style="flex:0;padding:0 8px;font-size:20px;color:var(--border);margin-top:8px;">→</div>
      <div class="progress-step ${step2Done ? 'done' : step1Done ? 'active' : ''}">
        <div style="font-size:18px;margin-bottom:4px;">${step2Done ? '✅' : step1Done ? '⏳' : '🔒'}</div>
        <div>Head of Course Signs</div>
      </div>
      <div style="flex:0;padding:0 8px;font-size:20px;color:var(--border);margin-top:8px;">→</div>
      <div class="progress-step ${step2Done ? 'done' : ''}">
        <div style="font-size:18px;margin-bottom:4px;">${step2Done ? '✅' : '🔒'}</div>
        <div>PDF Ready</div>
      </div>
    </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open" id="modal-detail">
    <div class="modal" style="max-width:820px;">
      <div class="modal-title">${esc(r.KodKursus)} — ${esc(r.NamaKursus)}</div>
      <div class="text-sm text-muted mt-1" style="margin-bottom:1rem;">Session: ${esc(r.Sesi)} &nbsp;|&nbsp; ${esc(r.Program)} &nbsp;|&nbsp; ${esc(r.Jabatan)} &nbsp; ${statusBadge(r)}</div>

      ${progressHTML}

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">1</span>Course Information</div>
        <table style="font-size:13px;margin-top:8px;">
          <tr><td class="text-muted" style="width:180px;">Programme</td><td>${esc(r.Program)}</td></tr>
          <tr><td class="text-muted">No. of Students</td><td>${esc(r.BilPelajar)}</td></tr>
          <tr><td class="text-muted">Class &amp; Lecturer</td><td>${lecturers.map(l => typeof l === 'object' ? `${esc(l.kelas)} — ${esc(l.pensyarah)}` : esc(l)).join('<br>') || '—'}</td></tr>
          <tr><td class="text-muted">Head of Course</td><td><b>${esc(headName)}</b></td></tr>
        </table>
      </div>

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">5</span>CLO Achievement</div>
        ${clos.length ? clos.map(c => `
          <div class="text-sm" style="margin-bottom:6px;">
            <b>${esc(c.id)}</b> — ${esc(c.desc)}:
            <span style="color:var(--primary);">Current: ${esc(c.pct)}%</span>
            ${c.pctLepas ? `| <span style="color:var(--gray);">Previous: ${esc(c.pctLepas)}%</span>
            | <span style="color:${parseFloat(c.pct)-parseFloat(c.pctLepas)>=0?'var(--success)':'var(--danger)'};">
              Diff: ${((parseFloat(c.pct)||0)-(parseFloat(c.pctLepas)||0)).toFixed(1)}%</span>` : ''}
          </div>`).join('') : '<p class="text-sm text-muted">No CLO data.</p>'}
      </div>

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">7</span>Attachments</div>
        <div class="text-sm">
          ${r.LampiranMinitURL ? `<div class="file-item">Discussion Minutes: <a href="${esc(r.LampiranMinitURL)}" target="_blank" class="file-link">View ↗</a></div>` : '<div class="text-muted">Discussion Minutes: none</div>'}
          ${r.LampiranAktivitiURL ? `<div class="file-item">CQI Activity Report: <a href="${esc(r.LampiranAktivitiURL)}" target="_blank" class="file-link">View ↗</a></div>` : '<div class="text-muted">CQI Activity Report: none</div>'}
        </div>
      </div>

      <!-- VERIFICATION SECTION -->
      <div class="section-block">
        <div class="card-title mb-0">Verification &amp; Signatures</div>

        <!-- STEP 1: Coordinator -->
        <div class="mt-2" style="border:2px solid ${step1Done ? 'var(--success)' : 'var(--primary)'};border-radius:10px;padding:14px;">
          <div class="flex items-center gap-8" style="margin-bottom:10px;">
            <span style="background:${step1Done ? 'var(--success)' : 'var(--primary)'};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${step1Done ? '✓' : '1'}</span>
            <b>Course Coordinator</b>
          </div>
          ${step1Done ? `
            <div class="text-sm" style="color:var(--success);">✅ Signed by: <b>${esc(r.SignedByPenyelaras)}</b> — ${fmtDate(r.TarikhPenyelaras)}</div>
            ${r.SigPenyelarasData ? `<img src="${r.SigPenyelarasData}" style="max-width:160px;border:1px solid var(--border);border-radius:6px;margin-top:8px;display:block;">` : ''}
          ` : canCoordSign ? `
            <div class="sig-wrap">
              <canvas class="sig-canvas" id="sig-canvas-penyelaras" width="460" height="140"></canvas>
              <div class="sig-hint" id="sig-hint-penyelaras">Sign here</div>
            </div>
            <div class="sig-actions mt-1" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button class="btn btn-outline btn-sm" type="button" onclick="clearSigCanvas('penyelaras')">Clear</button>
              <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;">📤 Upload signature<input type="file" accept="image/*" style="display:none;" onchange="uploadSigImage('penyelaras', this)"></label>
              <span class="text-muted" style="font-size:11px;">Draw above, or upload a signature image.</span>
            </div>
            <div class="form-group mt-1">
              <label>Date of Signature</label>
              <input type="date" id="tarikh-penyelaras" value="${new Date().toISOString().split('T')[0]}" style="max-width:200px;">
              <div class="form-hint">You may change this to reflect the actual signing date.</div>
            </div>
            <button class="btn btn-green mt-2" onclick="confirmSign('penyelaras','${r.ID}')">✓ Sign &amp; Submit to Head of Course →</button>
          ` : '<div class="text-sm text-muted">⏳ Awaiting coordinator signature.</div>'}
        </div>

        <!-- STEP 2: Head of Course -->
        <div class="mt-2" style="border:2px solid ${isComplete ? 'var(--success)' : isDraft ? 'var(--border)' : 'var(--amber)'};border-radius:10px;padding:14px;">
          <div class="flex items-center gap-8" style="margin-bottom:10px;">
            <span style="background:${isComplete ? 'var(--success)' : isDraft ? 'var(--gray)' : 'var(--amber)'};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${isComplete ? '✓' : '2'}</span>
            <b>Head of Course — ${esc(headName)}</b>
          </div>
          ${isComplete ? `
            <div class="text-sm" style="color:var(--success);">✅ Verified by: <b>${esc(r.SignedByKetua)}</b> — ${fmtDate(r.TarikhKetua)}</div>
            ${r.SigKetuaData ? `<img src="${r.SigKetuaData}" style="max-width:160px;border:1px solid var(--border);border-radius:6px;margin-top:8px;display:block;">` : ''}
            ${r.KomenKetua ? `<div class="text-sm mt-1"><b>Comment:</b> ${esc(r.KomenKetua)}</div>` : ''}
          ` : isDraft ? `
            <div class="text-sm" style="color:var(--gray);">🔒 Available after Course Coordinator signs.</div>
          ` : canHeadSign ? `
            <div class="sig-wrap">
              <canvas class="sig-canvas" id="sig-canvas-ketua" width="460" height="140"></canvas>
              <div class="sig-hint" id="sig-hint-ketua">Sign here</div>
            </div>
            <div class="sig-actions mt-1" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button class="btn btn-outline btn-sm" type="button" onclick="clearSigCanvas('ketua')">Clear</button>
              <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;">📤 Upload signature<input type="file" accept="image/*" style="display:none;" onchange="uploadSigImage('ketua', this)"></label>
              <span class="text-muted" style="font-size:11px;">Draw above, or upload a signature image.</span>
            </div>
            <div class="form-group mt-1">
              <label>Date of Signature</label>
              <input type="date" id="tarikh-ketua" value="${new Date().toISOString().split('T')[0]}" style="max-width:200px;">
              <div class="form-hint">You may change this to reflect the actual signing date.</div>
            </div>
            <div class="form-group mt-1"><label>Comment (optional)</label><textarea id="komen-ketua" style="min-height:50px;"></textarea></div>
            <button class="btn btn-green mt-1" onclick="confirmSign('ketua','${r.ID}')">✓ Verify &amp; Approve Report</button>
          ` : `<div class="text-sm text-muted">⏳ Awaiting Head of Course action.</div>`}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Close</button>
        ${isComplete
          ? `<button class="btn btn-blue" onclick="generateReportPDF('${r.ID}')">🖨️ Generate PDF</button>`
          : `<button class="btn btn-outline" disabled title="Both signatures required">🖨️ Generate PDF (pending signatures)</button>`}
      </div>
    </div>
  </div>`;

  if (canCoordSign) initSigCanvas('sig-canvas-penyelaras');
  if (canHeadSign) initSigCanvas('sig-canvas-ketua');
}

function signaturePadHTML(role, reportId) {
  const label = role === 'penyelaras' ? 'Tandatangan Course Coordinator' : 'Tandatangan Course Head';
  return `
    <div class="mt-2" style="border-top:1px solid var(--border);padding-top:12px;">
      <b class="text-sm">${label}</b>
      <div class="sig-wrap mt-1">
        <canvas class="sig-canvas" id="sig-canvas-${role}" width="460" height="140"></canvas>
        <div class="sig-hint" id="sig-hint-${role}">Lukis tandatangan di sini</div>
      </div>
      <div class="sig-actions">
        <button class="btn btn-outline btn-sm" type="button" onclick="clearSigCanvas('${role}')">Delete</button>
      </div>
      ${role === 'ketua' ? `<div class="form-group mt-1"><label>Komen (opsional)</label><textarea id="komen-ketua" style="min-height:50px;"></textarea></div>` : ''}
      <button class="btn btn-green mt-1" onclick="confirmSign('${role}','${reportId}')">✓ Sahkan &amp; Tandatangan</button>
    </div>`;
}

function closeDetailModal() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ===== SIGNATURE CANVAS LOGIC ===== */
const sigCanvasState = {};

function initAllSigCanvases() {}

function initSigCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#185FA5'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  sigCanvasState[canvasId] = { ctx, drawing: false, hasSig: false };

  const getPos = (e, evt) => {
    const r = canvas.getBoundingClientRect();
    const cx = evt.clientX !== undefined ? evt.clientX : evt.touches[0].clientX;
    const cy = evt.clientY !== undefined ? evt.clientY : evt.touches[0].clientY;
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return [(cx - r.left) * scaleX, (cy - r.top) * scaleY];
  };

  const start = (evt) => {
    evt.preventDefault();
    sigCanvasState[canvasId].drawing = true;
    ctx.beginPath();
    ctx.moveTo(...getPos(canvas, evt));
    const hint = document.getElementById('sig-hint-' + canvasId.replace('sig-canvas-', ''));
    if (hint) hint.style.display = 'none';
  };
  const move = (evt) => {
    if (!sigCanvasState[canvasId].drawing) return;
    evt.preventDefault();
    ctx.lineTo(...getPos(canvas, evt));
    ctx.stroke();
    sigCanvasState[canvasId].hasSig = true;
  };
  const end = () => { sigCanvasState[canvasId].drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function clearSigCanvas(role) {
  const canvasId = 'sig-canvas-' + role;
  const canvas = document.getElementById(canvasId);
  const state = sigCanvasState[canvasId];
  if (!canvas || !state) return;
  state.ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.hasSig = false;
  const hint = document.getElementById('sig-hint-' + role);
  if (hint) hint.style.display = 'block';
}

// Muat naik imej tandatangan → lukis ke kanvas (guna aliran simpan sedia ada)
function uploadSigImage(role, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file (PNG/JPG).', 'error'); input.value = ''; return; }
  if (file.size > 2 * 1024 * 1024) { toast('Image too large (max 2MB).', 'error'); input.value = ''; return; }
  const canvasId = 'sig-canvas-' + role;
  const canvas = document.getElementById(canvasId);
  const state = sigCanvasState[canvasId];
  if (!canvas || !state) { toast('Signature area not ready.', 'error'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const cw = canvas.width, ch = canvas.height;
      state.ctx.clearRect(0, 0, cw, ch);
      // Muat imej dalam kanvas, kekalkan nisbah, di tengah
      const scale = Math.min(cw / img.width, ch / img.height);
      const w = img.width * scale, h = img.height * scale;
      state.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      state.hasSig = true;
      const hint = document.getElementById('sig-hint-' + role);
      if (hint) hint.style.display = 'none';
      toast('Signature image loaded. Click "Sign" to submit.', 'success');
    };
    img.onerror = () => toast('Could not load that image.', 'error');
    img.src = e.target.result;
  };
  reader.onerror = () => toast('Failed to read file.', 'error');
  reader.readAsDataURL(file);
  input.value = '';
}

// Lukis tandatangan sedia ada (data URL) ke atas kanvas (untuk mod edit)
function loadSigOntoCanvas(canvasId, dataUrl) {
  const canvas = document.getElementById(canvasId);
  const state = sigCanvasState[canvasId];
  if (!canvas || !state || !dataUrl) return;
  const img = new Image();
  img.onload = () => {
    const cw = canvas.width, ch = canvas.height;
    state.ctx.clearRect(0, 0, cw, ch);
    const scale = Math.min(cw / img.width, ch / img.height);
    const w = img.width * scale, h = img.height * scale;
    state.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    state.hasSig = true;
    const hint = document.getElementById('sig-hint-' + canvasId.replace('sig-canvas-', ''));
    if (hint) hint.style.display = 'none';
  };
  img.src = dataUrl;
}

async function confirmSign(role, reportId) {
  const canvasId = 'sig-canvas-' + role;
  const state = sigCanvasState[canvasId];
  if (!state || !state.hasSig) { toast('Please draw your signature first.', 'error'); return; }
  const canvas = document.getElementById(canvasId);
  const sigData = canvas.toDataURL('image/png');
  const komen = role === 'ketua' ? (document.getElementById('komen-ketua')?.value || '') : '';

  // Untuk langkah Head of Course, rekod nama Head yang ditetapkan (CourseMaster),
  // bukan nama akaun yang log masuk (cth. admin yang mengisi bagi pihak).
  let signerName = currentUser.Nama;
  if (role === 'ketua') {
    const rep = cqiReports.find(x => x.ID === reportId);
    const course = courseMasterList.find(c => c.KodKursus === rep?.KodKursus);
    signerName = course?.HeadOfCourse || currentUser.Nama;
  }

  // Get manual date — fallback to current datetime if not set
  const dateInput = document.getElementById('tarikh-' + role);
  const manualDate = dateInput?.value
    ? new Date(dateInput.value).toISOString()
    : new Date().toISOString();

  try {
    const result = await apiPost('signReport', {
      id: reportId, role,
      signerName,
      sigData, komen,
      manualDate
    });
    if (result.success) {
      toast('Signature saved successfully.', 'success');
      await loadAllData();
      openReportDetail(reportId);
    } else {
      toast(result.message || 'Failed to save signature.', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return iso; }
}

/* ===================================================================
   JANA PDF — LAPORAN CQI RASMI
   =================================================================== */

/* ===== PTSB LOGO (base64 PNG, terbenam — tiada hosting luar) ===== */
const PTSB_LOGO_BASE64 = "data:image/png;base64,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";
const PTSB_LOGO_RATIO = 2.605; // nisbah lebar/tinggi logo asal

function generateReportPDF(id) {
  const r = cqiReports.find(x => x.ID === id);
  if (!r) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 16;
  let y = margin;

  function checkPageBreak(needed) {
    if (y + needed > 280) { doc.addPage(); y = margin; }
  }
  function sectionTitle(num, title) {
    y += 5;            // jarak lebih lapang antara seksyen
    checkPageBreak(13);
    doc.setFillColor(230, 241, 251);
    doc.rect(margin, y, W - 2 * margin, 7, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
    doc.text(num + '.0  ' + title, margin + 2, y + 5);
    doc.setTextColor(30, 30, 30);
    y += 12;
  }
  function fieldRow(label, value, width) {
    checkPageBreak(7);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value || '—'), (width || (W - 2 * margin - 55)));
    doc.text(lines, margin + 55, y);
    y += Math.max(7, lines.length * 5.2);
  }

  // Sub-jadual outcome (dikongsi oleh 5.3.1/5.3.2/5.4.1/5.4.2)
  function ocTable(subTitle, idLabel, items, curKey, prevKey) {
    checkPageBreak(18);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(subTitle, margin, y); y += 5;
    doc.setFillColor(230, 241, 251); doc.rect(margin, y - 4, W - 2 * margin, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
    doc.text(idLabel, margin + 1, y);
    doc.text('Description', margin + 18, y);
    doc.text('% Current', margin + 118, y);
    doc.text('% Previous', margin + 143, y);
    doc.text('% Diff', margin + 168, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    items.forEach((c, ci) => {
      const descLines = doc.splitTextToSize(String(c.desc || ''), 95);
      const rowH = Math.max(6, descLines.length * 5);
      checkPageBreak(rowH + 2);
      if (ci % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, rowH + 1, 'F'); }
      doc.setTextColor(30, 30, 30);
      doc.text(String(c.id || ''), margin + 1, y);
      doc.text(descLines, margin + 18, y);
      const cur = c[curKey], prev = c[prevKey];
      const hasCur = cur !== '' && cur !== undefined && cur !== null;
      const hasPrev = prev !== '' && prev !== undefined && prev !== null;
      doc.text(hasCur ? String(cur) + '%' : '-', margin + 118, y);
      doc.text(hasPrev ? String(prev) + '%' : '-', margin + 143, y);
      const diff = ((parseFloat(cur) || 0) - (parseFloat(prev) || 0)).toFixed(1);
      doc.setTextColor(diff > 0 ? 60 : diff < 0 ? 163 : 95, diff > 0 ? 109 : diff < 0 ? 45 : 94, diff > 0 ? 17 : diff < 0 ? 45 : 90);
      doc.text((diff > 0 ? '+' : '') + diff + '%', margin + 168, y);
      doc.setTextColor(30, 30, 30);
      y += rowH + 1;
    });
    y += 4;
  }

  // Header — Logo PTSB + tajuk rasmi
  const _logoW = 46, _logoH = _logoW / PTSB_LOGO_RATIO; // ≈ 17.7mm
  doc.addImage(PTSB_LOGO_BASE64, 'PNG', margin, 8, _logoW, _logoH);
  doc.setTextColor(12, 68, 124);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('REPORT OF CONTINUOUS QUALITY', W - margin, 12, { align: 'right' });
  doc.text('IMPROVEMENT (CQI)', W - margin, 18, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
  doc.text('Session: ' + (r.Sesi || '—'), W - margin, 24, { align: 'right' });
  const _headBottom = 8 + _logoH + 2;
  doc.setDrawColor(24, 95, 165); doc.setLineWidth(0.8);
  doc.line(margin, _headBottom, W - margin, _headBottom);
  doc.setTextColor(30, 30, 30);
  y = _headBottom + 8;

  // 1.0 Course Information
  sectionTitle('1', 'Course Information');
  fieldRow('Program:', r.Program);
  fieldRow('Code & Course Name:', r.KodKursus + ' — ' + r.NamaKursus);
  const lecturers = safeParseArr(r.Pensyarah);
  // Class & Lecturer — satu baris setiap kelas/pensyarah
  {
    const clList = lecturers.map(l => (typeof l === 'object' ? `${l.kelas} — ${l.pensyarah}` : String(l))).filter(x => x && x.trim() && x.trim() !== '—');
    checkPageBreak(7);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text('Class & Lecturer:', margin, y);
    doc.setFont('helvetica', 'normal');
    if (!clList.length) {
      doc.text('—', margin + 55, y);
      y += 7;
    } else {
      clList.forEach((item, i) => {
        const wrapped = doc.splitTextToSize(item, W - 2 * margin - 55);
        if (i > 0) checkPageBreak(wrapped.length * 5.2 + 1);
        doc.text(wrapped, margin + 55, y);
        y += wrapped.length * 5.2;
      });
      y += 1.5;
    }
  }
  fieldRow('Number of Students:', r.BilPelajar);
  y += 2;

  // 2.0 Discussion Minutes
  sectionTitle('2', 'Discussion Minutes');
  const kehadiranArr = safeParseArr(r.MinitKehadiran);
  fieldRow('Attendance:', kehadiranArr.length ? kehadiranArr.join(', ') : (r.MinitKehadiran || '—'));
  fieldRow('Date:', r.MinitTarikh);
  fieldRow('Time:', r.MinitMasa);
  fieldRow('Venue:', r.MinitTempat);
  y += 2;

  // 3.0 Isu CLO & PLO
  sectionTitle('3', 'CLO & PLO Issues');
  fieldRow('CLO Issues:', r.IsuCLO, W - 2 * margin - 30);
  fieldRow('PLO Issues:', r.IsuPLO, W - 2 * margin - 30);
  y += 2;

  // 4.0 Aktiviti CQI
  sectionTitle('4', 'CQI Programme / Activity / Task');
  fieldRow('Activity Name:', r.AktivitiNama);
  fieldRow('Implementation Date:', r.AktivitiTarikh);
  fieldRow('Number of Students:', r.AktivitiBilPelajar);
  fieldRow('Objective:', r.AktivitiObjektif, W - 2 * margin - 30);
  fieldRow('Summary:', r.AktivitiRingkasan, W - 2 * margin - 30);
  y += 2;

  // 5.0 Student Performance
  sectionTitle('5', 'Student Performance');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.1 Student Grades (% of students)', margin, y); y += 5;
  const grades = safeParseObj(r.GredData);
  const gradesPrev = safeParseObj(r.GredDataLepas);
  const gradeKeys = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'];
  const tableW = W - 2 * margin;
  const labelW = 20;
  const totalColW = 18;                                   // lajur Total khusus (elak bertindih)
  const colW = (tableW - labelW - totalColW) / gradeKeys.length;
  const totalX = margin + labelW + colW * gradeKeys.length + 1;

  checkPageBreak(24);
  // Header row
  doc.setFillColor(230, 241, 251); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
  doc.text('Session', margin + 1, y);
  gradeKeys.forEach((g, i) => doc.text(g, margin + labelW + i * colW + 1, y));
  doc.text('Total', totalX, y);
  y += 6;

  // Current session row
  doc.setFillColor(240, 247, 255); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(24, 95, 165);
  doc.text(r.Sesi || 'Current', margin + 1, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  let totalCurr = 0;
  gradeKeys.forEach((g, i) => { const v = parseFloat(grades[g] || 0); totalCurr += v; doc.text(v > 0 ? v.toFixed(1) : '0', margin + labelW + i * colW + 1, y); });
  doc.setFont('helvetica', 'bold'); doc.setTextColor(24, 95, 165);
  doc.text(totalCurr.toFixed(1) + '%', totalX, y);
  doc.setTextColor(30, 30, 30); y += 6;

  // Previous session row
  doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(95, 94, 90);
  doc.text(r.SesiLepas || 'Previous', margin + 1, y);
  doc.setFont('helvetica', 'normal');
  let totalPrev = 0;
  gradeKeys.forEach((g, i) => { const v = parseFloat(gradesPrev[g] || 0); totalPrev += v; doc.text(v > 0 ? v.toFixed(1) : '—', margin + labelW + i * colW + 1, y); });
  doc.setFont('helvetica', 'bold');
  doc.text(totalPrev > 0 ? totalPrev.toFixed(1) + '%' : '—', totalX, y);
  doc.setTextColor(30, 30, 30); y += 10;

  // BAR CHART — 2 colours (Current vs Previous)
  checkPageBreak(55);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('(Graph: % of students vs Grade)', margin, y); y += 4;

  const chartH = 35;
  const chartW = tableW - labelW;
  const chartX = margin + labelW;
  const chartY = y;
  const maxVal = Math.max(...gradeKeys.map(g => Math.max(parseFloat(grades[g] || 0), parseFloat(gradesPrev[g] || 0))), 10);
  const barGroupW = chartW / gradeKeys.length;
  const barW = barGroupW * 0.35;

  // Chart background & axes
  doc.setFillColor(250, 250, 250); doc.rect(chartX, chartY, chartW, chartH, 'F');
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.rect(chartX, chartY, chartW, chartH);

  // Y-axis gridlines
  [25, 50, 75, 100].forEach(pct => {
    if (pct <= maxVal + 5) {
      const lineY = chartY + chartH - (pct / maxVal) * chartH;
      doc.setLineDashPattern([1, 1], 0); doc.line(chartX, lineY, chartX + chartW, lineY);
      doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
      doc.text(pct + '%', margin + 1, lineY + 1);
    }
  });
  doc.setLineDashPattern([], 0); doc.setTextColor(30, 30, 30);

  // Draw bars
  gradeKeys.forEach((g, i) => {
    const x = chartX + i * barGroupW;
    const currVal = parseFloat(grades[g] || 0);
    const prevVal = parseFloat(gradesPrev[g] || 0);

    // Current bar (blue)
    if (currVal > 0) {
      const bH = (currVal / maxVal) * chartH;
      doc.setFillColor(20, 66, 140);
      doc.rect(x + barGroupW * 0.05, chartY + chartH - bH, barW, bH, 'F');
    }
    // Previous bar (light blue)
    if (prevVal > 0) {
      const bH = (prevVal / maxVal) * chartH;
      doc.setFillColor(240, 190, 20);
      doc.rect(x + barGroupW * 0.05 + barW + 1, chartY + chartH - bH, barW, bH, 'F');
    }

    // Grade label
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(g, x + barGroupW * 0.15, chartY + chartH + 4);
  });

  // Legend
  y = chartY + chartH + 8;
  doc.setFillColor(20, 66, 140); doc.rect(margin + labelW, y, 8, 3, 'F');
  doc.setFontSize(6.5); doc.text(r.Sesi || 'Current Session', margin + labelW + 10, y + 2.5);
  doc.setFillColor(240, 190, 20); doc.rect(margin + labelW + 60, y, 8, 3, 'F');
  doc.text(r.SesiLepas || 'Previous Session', margin + labelW + 70, y + 2.5);
  y += 10;

  checkPageBreak(34);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30); doc.text('5.2 Quality Objectives', margin, y); y += 5;
  const qo1Th = parseFloat(courseMasterList.find(c => c.KodKursus === r.KodKursus)?.QO1Threshold) || 90;
  const qo2Th = parseFloat(courseMasterList.find(c => c.KodKursus === r.KodKursus)?.QO2Threshold) || 25;

  // --- Quality Objectives table ---
  const _qoX = margin, _qoW = W - 2 * margin;
  const _qoCol = [78, 22, 24, _qoW - 124];                 // column widths (mm)
  const _qoColX = [_qoX, _qoX + 78, _qoX + 100, _qoX + 124];
  const _qoHead = ['Quality Objective', 'Target', 'Achieved (%)', 'Preventive/Corrective Action'];
  const _qoRows = [
    ['Students achieving grade D and above', qo1Th + '%', (r.QualityObj1Capai || '—'), (r.QualityObj1Tindakan || '—')],
    ['Students achieving grade B and above', qo2Th + '%', (r.QualityObj2Capai || '—'), (r.QualityObj2Tindakan || '—')]
  ];
  // header row
  doc.setFillColor(230, 241, 251); doc.rect(_qoX, y, _qoW, 7, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
  _qoHead.forEach((h, i) => doc.text(h, _qoColX[i] + 2, y + 4.7));
  y += 7;
  // body rows
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  _qoRows.forEach(row => {
    const cells = row.map((val, i) => doc.splitTextToSize(String(val), _qoCol[i] - 4));
    const rowH = Math.max(6, ...cells.map(c => c.length * 4)) + 2;
    checkPageBreak(rowH);
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.rect(_qoX, y, _qoW, rowH);
    _qoColX.slice(1).forEach(cx => doc.line(cx, y, cx, y + rowH));
    cells.forEach((lines, i) => doc.text(lines, _qoColX[i] + 2, y + 4.5));
    y += rowH;
  });
  y += 5;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);

  const clos = safeParseArr(r.CLOData);
  if (clos.length) {
    checkPageBreak(14);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text('5.3 Course Learning Outcome (CLO)', margin, y); y += 6;
    ocTable('5.3.1 Analysis of CLO Group Attainment (%)', 'CLO', clos, 'pctGA', 'pctGALepas');
    ocTable('5.3.2 Analysis of CLO Student Achievement >= 50% (%)', 'CLO', clos, 'pct', 'pctLepas');
  }

  const plos = safeParseArr(r.PLOData);
  if (plos.length) {
    checkPageBreak(14);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text('5.4 Programme Learning Outcome (PLO)', margin, y); y += 6;
    ocTable('5.4.1 Analysis of PLO Group Attainment (%)', 'PLO', plos, 'pctGA', 'pctGALepas');
    ocTable('5.4.2 Analysis of PLO Student Achievement >= 50% (%)', 'PLO', plos, 'pct', 'pctLepas');
  }

  // 6.0 Ulasan
  sectionTitle('6', 'Comments & Suggestions');
  fieldRow('Comments:', r.Ulasan, W - 2 * margin - 30);
  fieldRow('Suggestions:', r.Cadangan, W - 2 * margin - 30);
  y += 2;

  // 7.0 Lampiran (clickable links)
  sectionTitle('7', 'Attachments');
  checkPageBreak(26);
  // --- Lampiran table ---
  const _lpX = margin, _lpW = W - 2 * margin;
  const _lpColX = [_lpX, _lpX + 16, _lpX + 118];
  doc.setFillColor(230, 241, 251); doc.rect(_lpX, y, _lpW, 7, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
  ['No.', 'Attachment Document', 'Status'].forEach((h, i) => doc.text(h, _lpColX[i] + 2, y + 4.7));
  y += 7;
  const _lpRows = [
    ['7.1', 'Discussion Minutes', r.LampiranMinitURL],
    ['7.2', 'CQI Activity / Programme Report', r.LampiranAktivitiURL]
  ];
  doc.setFont('helvetica', 'normal');
  _lpRows.forEach(row => {
    const rowH = 8;
    checkPageBreak(rowH);
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.rect(_lpX, y, _lpW, rowH);
    _lpColX.slice(1).forEach(cx => doc.line(cx, y, cx, y + rowH));
    doc.setFontSize(8); doc.setTextColor(30, 30, 30);
    doc.text(row[0], _lpColX[0] + 2, y + 5.3);
    doc.text(row[1], _lpColX[1] + 2, y + 5.3);
    if (row[2]) {
      doc.setTextColor(24, 95, 165);
      doc.textWithLink('View document', _lpColX[2] + 2, y + 5.3, { url: row[2] });
    } else {
      doc.setTextColor(140, 140, 140);
      doc.text('No attachment', _lpColX[2] + 2, y + 5.3);
    }
    y += rowH;
  });
  doc.setTextColor(30, 30, 30); doc.setFontSize(9);
  y += 6;

  // Pengesahan / Signatures
  checkPageBreak(70);
  doc.setFillColor(230, 241, 251);
  doc.rect(margin, y, W - 2 * margin, 7, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
  doc.text('CERTIFICATION', margin + 2, y + 5);
  doc.setTextColor(30, 30, 30);
  y += 12;

  const colWidth = (W - 2 * margin - 10) / 2;
  const leftX = margin, rightX = margin + colWidth + 10;
  const sigY = y;

  const courseForPDF = courseMasterList.find(c => c.KodKursus === r.KodKursus);
  const headOfCourse = courseForPDF?.HeadOfCourse || r.SignedByKetua || '___________________________';

  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Prepared by (Course Coordinator)', leftX, sigY);
  doc.text('Verified by (Head of Course)', rightX, sigY);
  y = sigY + 5;

  if (r.SigPenyelarasData) { try { doc.addImage(r.SigPenyelarasData, 'PNG', leftX, y, 55, 22); } catch (e) {} }
  if (r.SigKetuaData) { try { doc.addImage(r.SigKetuaData, 'PNG', rightX, y, 55, 22); } catch (e) {} }
  y += 25;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Name: ' + (r.SignedByPenyelaras || '___________________'), leftX, y);
  doc.text('Name: ' + (r.SignedByKetua || headOfCourse), rightX, y);
  y += 5;
  doc.text('Date: ' + (r.TarikhPenyelaras ? fmtDate(r.TarikhPenyelaras) : '________________'), leftX, y);
  doc.text('Date: ' + (r.TarikhKetua ? fmtDate(r.TarikhKetua) : '________________'), rightX, y);
  y += 5;
  if (r.KomenKetua) {
    const komenLines = doc.splitTextToSize('Comment: ' + r.KomenKetua, colWidth);
    doc.text(komenLines, rightX, y);
  }

  // (Footer dibuang atas permintaan pengguna)

  const fileName = `CQI_${r.KodKursus}_${r.Program || ''}_${(r.Sesi||'').replace(/[\/\s]/g,'-')}.pdf`;

  // Download to user's computer
  doc.save(fileName);

  // Save to Google Drive (auto-replace if exists)
  toast('PDF generated. Saving to Google Drive...', 'success');
  const pdfBase64 = btoa(
    new Uint8Array(doc.output('arraybuffer'))
      .reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  apiPost('savePDF', {
    data: {
      base64PDF: pdfBase64,
      fileName: fileName,
      jabatan: r.Jabatan || 'Unknown',
      program: r.Program || 'Unknown',
      kodKursus: r.KodKursus,
      sesi: r.Sesi,
      janaOleh: currentUser.Nama,
      reportId: r.ID,
    }
  }).then(result => {
    if (result.success) {
      toast(`✅ PDF saved to Google Drive successfully.`, 'success');
    } else {
      toast('PDF downloaded but failed to save to Drive: ' + result.message, 'error');
    }
  }).catch(() => {
    toast('PDF downloaded. Drive save failed — check connection.', 'error');
  });
}
/* ===================================================================
   LAPORAN & MINIT MESYUARAT (modul berasingan, bukan laporan CQI rasmi)
   =================================================================== */

function renderLaporanPage() {
  const rows = laporanList.slice().reverse().map(l => `
    <tr>
      <td>${fmtDate(l.Tarikh)}</td>
      <td>${esc(l.Title)}</td>
      <td><span class="tag tag-blue">${esc(l.Type)}</span></td>
      <td>${esc(l.Oleh)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewLaporanItem('${l.ID}')">View</button>
        ${currentUser.Peranan === 'admin' ? `<button class="btn btn-red btn-sm" onclick="deleteLaporanItem('${l.ID}')">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="page-title">Reports &amp; Meeting Minutes</div>
    <div class="page-sub">Record additional reports and meeting minutes outside of official CQI reports.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openLaporanForm()">＋ Add Report / Minutes</button>
    </div>
    <div class="card">
      ${laporanList.length === 0 ? emptyState('📄', 'No reports or meeting minutes yet.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tarikh</th><th>Title</th><th>Type</th><th>Oleh</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

function openLaporanForm() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">📄 Add Laporan / Minit</div>
      <div class="form-group"><label>Title</label><input id="l-tajuk" placeholder="cth: Meeting Minutes CQI Sem 2"></div>
      <div class="form-group">
        <label>Type</label>
        <select id="l-jenis">
          <option>Meeting Minutes</option>
          <option>Laporan Addan</option>
          <option>Others</option>
        </select>
      </div>
      <div class="form-group"><label>Content</label><textarea id="l-kandungan" style="min-height:140px;"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-laporan" onclick="saveLaporanItem()">Save</button>
      </div>
    </div>
  </div>`;
}

async function saveLaporanItem() {
  const tajuk = document.getElementById('l-tajuk').value.trim();
  if (!tajuk) { toast('Sila masukkan tajuk.', 'error'); return; }
  const btn = document.getElementById('btn-save-laporan');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('addLaporan', {
      data: { Title: tajuk, Type: document.getElementById('l-jenis').value, Content: document.getElementById('l-kandungan').value, Oleh: currentUser.Nama }
    });
    if (result.success) {
      toast('Laporan disimpan.', 'success');
      closeDetailModal();
      await loadAllData();
      showPage('laporan');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Save'; }
}

function viewLaporanItem(id) {
  const l = laporanList.find(x => x.ID === id);
  if (!l) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">${esc(l.Title)}</div>
      <div class="text-sm text-muted mt-1" style="margin-bottom:1rem;">${esc(l.Type)} • ${fmtDate(l.Tarikh)} • ${esc(l.Oleh)}</div>
      <div class="text-sm" style="white-space:pre-wrap;background:var(--bg2);padding:1rem;border-radius:8px;line-height:1.7;">${esc(l.Content) || '(Tiada kandungan)'}</div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="closeDetailModal()">Close</button></div>
    </div>
  </div>`;
}

async function deleteLaporanItem(id) {
  if (!confirm('Delete item ini?')) return;
  try {
    const result = await apiPost('deleteLaporan', { id });
    if (result.success) { toast('Dipadam.', 'success'); await loadAllData(); showPage('laporan'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}

/* ===================================================================
   PENGURUSAN PENGGUNA (Admin sahaja)
   =================================================================== */

function renderPenggunaPage() {
  if (currentUser.Peranan !== 'admin') {
    return `<div class="page-title">Akses Terhad</div><p class="text-muted">Hanya pentadbir boleh mengurus pengguna.</p>`;
  }
  const rows = usersList.map(u => `
    <tr>
      <td><span class="tag tag-gray">${esc(u.IC)}</span></td>
      <td>${esc(u.Nama)}</td>
      <td><span class="tag ${u.Peranan === 'admin' ? 'tag-red' : u.Peranan === 'ketua' ? 'tag-blue' : u.Peranan === 'lecturer' ? 'tag-gray' : 'tag-green'}">${roleLabel(u.Peranan)}</span></td>
      <td>${u.KodKursus ? esc(u.KodKursus) : '<span class="text-muted">—</span>'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openUserForm('${esc(u.IC)}')">Edit</button>
        <button class="btn btn-red btn-sm" onclick="deleteUserItem('${esc(u.IC)}')">Delete</button>
      </td>
    </tr>`).join('');

  return `
    <div class="page-title">User Management</div>
    <div class="page-sub">Add atau urus pengguna sistem i-rCQI.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openUserForm()">＋ Add Pengguna</button>
    </div>
    <div class="card">
      ${usersList.length === 0 ? emptyState('👥', 'No users yet.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Staff No.</th><th>Name</th><th>Role</th><th>Assigned Course</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

function roleLabel(role) {
  const labels = { admin: 'Administrator', ketua: 'Course Head', penyelaras: 'Course Coordinator', lecturer: 'Lecturer' };
  return labels[role] || role;
}

function openUserForm(editIC) {
  const editing = editIC ? usersList.find(u => String(u.IC) === String(editIC)) : null;
  const codeOptions = [...new Set(courseMasterList.map(c => c.KodKursus))].filter(Boolean).sort();
  const selected = editing ? String(editing.KodKursus || '').split(/[,;]/).map(x => x.trim()).filter(Boolean) : [];
  const allCodes = [...new Set([...codeOptions, ...selected])].sort();
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">${editing ? '✏️ Edit User' : '👤 Add User'}</div>
      <input type="hidden" id="u-edit" value="${editing ? esc(editing.IC) : ''}">
      <div class="form-group"><label>Staff ID</label><input id="u-ic" maxlength="20" placeholder="e.g.: STF12345" style="text-transform:uppercase;" value="${editing ? esc(editing.IC) : ''}" ${editing ? 'readonly' : ''}></div>
      <div class="form-group"><label>Full Name</label><input id="u-nama" value="${editing ? esc(editing.Nama) : ''}"></div>
      <div class="form-group">
        <label>Role</label>
        <select id="u-role">
          <option value="lecturer" ${editing && editing.Peranan === 'lecturer' ? 'selected' : ''}>Lecturer (Dashboard &amp; PDF only)</option>
          <option value="penyelaras" ${editing && editing.Peranan === 'penyelaras' ? 'selected' : ''}>Course Coordinator</option>
          <option value="ketua" ${editing && editing.Peranan === 'ketua' ? 'selected' : ''}>Course Head</option>
          <option value="admin" ${editing && editing.Peranan === 'admin' ? 'selected' : ''}>Administrator</option>
        </select>
      </div>
      <div class="form-group">
        <label>Assigned Course Code(s) <span class="text-muted" style="font-weight:400;">(Coordinator / Head)</span></label>
        <div id="u-kod-list" style="max-height:170px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;">
          ${allCodes.length ? allCodes.map(k => `<label style="display:flex;align-items:center;gap:8px;padding:3px 2px;cursor:pointer;font-weight:400;">
            <input type="checkbox" class="u-kod-cb" value="${esc(k)}" ${selected.includes(k) ? 'checked' : ''}> ${esc(k)}
          </label>`).join('') : '<div class="text-muted" style="font-size:12px;">No courses yet. Add them in Course Management first.</div>'}
        </div>
        <div class="form-hint">Tick one or more courses — the Coordinator/Head will only see CQI Reports for the ticked courses. Leave all unticked for no restriction (sees all).</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-user" onclick="saveUserItem()">${editing ? 'Save' : 'Add'}</button>
      </div>
    </div>
  </div>`;
}

async function saveUserItem() {
  const editIC = (document.getElementById('u-edit') ? document.getElementById('u-edit').value : '');
  const ic = document.getElementById('u-ic').value.trim().toUpperCase();
  const nama = document.getElementById('u-nama').value.trim();
  if (!ic) { toast('Please enter Staff ID.', 'error'); return; }
  if (!nama) { toast('Please enter full name.', 'error'); return; }
  const btn = document.getElementById('btn-save-user');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Saving...';
  try {
    const kodBoxes = Array.from(document.querySelectorAll('.u-kod-cb:checked')).map(cb => cb.value);
    const data = { IC: ic, Nama: nama, Peranan: document.getElementById('u-role').value, KodKursus: kodBoxes.join(',') };
    const result = editIC
      ? await apiPost('updateUser', { data })
      : await apiPost('addUser', { data });
    if (result.success) {
      toast(editIC ? 'User updated.' : 'User added.', 'success');
      closeDetailModal();
      await loadUsers();
      showPage('pengguna');
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = editIC ? 'Save' : 'Add'; }
}

async function deleteUserItem(ic) {
  if (!confirm('Delete pengguna ini?')) return;
  try {
    const result = await apiPost('deleteUser', { ic });
    if (result.success) { toast('Pengguna dipadam.', 'success'); await loadUsers(); showPage('pengguna'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}
/* ===================================================================
   PENGURUSAN KURSUS (Admin) — CourseMaster (CLO) + ProgramKursus (PLO ikut program)
   =================================================================== */

const JABATAN_LIST = ['JKM', 'JKE', 'JKA'];

function renderKursusPage() {
  if (currentUser.Peranan !== 'admin') {
    return `<div class="page-title">Akses Terhad</div><p class="text-muted">Hanya pentadbir boleh mengurus kursus.</p>`;
  }

  const courseRows = courseMasterList.map(c => {
    const clos = safeParseArr(c.CLOList);
    const linkedPrograms = programKursusList.filter(p => p.KodKursus === c.KodKursus);
    return `
    <tr>
      <td><span class="tag tag-blue">${esc(c.KodKursus)}</span></td>
      <td>${esc(c.NamaKursus)}</td>
      <td>${clos.length} CLO</td>
      <td>${linkedPrograms.length} programmes linked</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCourseMasterForm('${esc(c.KodKursus)}')">Edit CLO</button>
        <button class="btn btn-outline btn-sm" onclick="openProgramLinkPanel('${esc(c.KodKursus)}')">Manage Programme/PLO</button>
        <button class="btn btn-red btn-sm" onclick="deleteCourseMasterItem('${esc(c.KodKursus)}')">Delete</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="page-title">Course Management</div>
    <div class="page-sub">Set up course codes, CLO (fixed for all programmes), and link with Department/Programme along with their respective PLO.</div>
    <div class="alert alert-info">💡 This setup only needs to be done <b>once</b> for each course. Course coordinators do not need to retype CLO/PLO — it will appear automatically when they select a course in the CQI Report form.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openCourseMasterForm()">＋ Add Kursus Baharu</button>
    </div>
    <div class="card">
      ${courseMasterList.length === 0 ? emptyState('🎓', 'No courses set up yet. Klik "Add Kursus Baharu" untuk mula.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Course Code</th><th>Course Name</th><th>CLO</th><th>Programme Links</th><th>Action</th></tr></thead>
          <tbody>${courseRows}</tbody>
        </table>
      </div>`}
    </div>`;
}

/* ===== CourseMaster: Kod Kursus + Nama + CLO ===== */

function openCourseMasterForm(kodKursus) {
  const existing = kodKursus ? courseMasterList.find(c => c.KodKursus === kodKursus) : null;
  const qo1 = existing?.QO1Threshold || '90';
  const qo2 = existing?.QO2Threshold || '25';
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal">
      <div class="modal-title">${existing ? '✏️ Edit' : '＋ Add'} Kursus &amp; CLO</div>
      <div class="form-grid">
        <div class="form-group"><label>Course Code</label><input id="cm-kod" value="${esc(existing?.KodKursus)}" placeholder="e.g.: DBS10042" ${existing ? 'readonly style="background:#F1EFE8;"' : ''}></div>
        <div class="form-group"><label>Course Name</label><input id="cm-nama" value="${esc(existing?.NamaKursus)}"></div>
        <div class="form-group full"><label>Head of Course</label><input id="cm-hoc" value="${esc(existing?.HeadOfCourse)}" placeholder="e.g.: Dr. Rahimah binti Yusof"></div>
      </div>
      <div class="section-block mt-2" style="background:var(--primary-light);">
        <b class="text-sm">Quality Objectives — Threshold (%)</b>
        <div class="form-grid mt-1">
          <div class="form-group mb-0">
            <label>QO1: % students achieved grade D and above (default: 90)</label>
            <input type="number" id="cm-qo1" value="${esc(qo1)}" min="0" max="100" step="1" placeholder="90">
          </div>
          <div class="form-group mb-0">
            <label>QO2: % students achieved grade B and above (default: 25)</label>
            <input type="number" id="cm-qo2" value="${esc(qo2)}" min="0" max="100" step="1" placeholder="25">
          </div>
        </div>
      </div>
      <div class="mt-2">
        <div class="flex items-center justify-between"><b class="text-sm">Course Learning Outcome (CLO)</b><button class="btn btn-outline btn-sm" type="button" onclick="addCmCloRow()">+ Add CLO</button></div>
        <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;" class="mt-1"><span>CLO</span><span>Description</span><span></span></div>
        <div id="cm-clo-rows"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-cm" onclick="saveCourseMasterItem(${existing ? 'true' : 'false'})">Save</button>
      </div>
    </div>
  </div>`;

  const clos = existing ? safeParseArr(existing.CLOList) : [];
  if (clos.length) clos.forEach(c => addCmCloRow(c)); else { addCmCloRow(); addCmCloRow(); }
}

function addCmCloRow(data) {
  const wrap = document.getElementById('cm-clo-rows');
  const count = wrap.children.length + 1;
  const d = data || { id: 'CLO' + count, desc: '' };
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '80px 1fr 40px';
  row.innerHTML = `
    <input type="text" class="cm-clo-id" value="${esc(d.id)}" placeholder="CLO1">
    <input type="text" class="cm-clo-desc" value="${esc(d.desc)}" placeholder="Description CLO">
    <button class="btn btn-red btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

async function saveCourseMasterItem(isEdit) {
  const kod = document.getElementById('cm-kod').value.trim();
  const nama = document.getElementById('cm-nama').value.trim();
  if (!kod || !nama) { toast('Sila isi Kod dan Nama Kursus.', 'error'); return; }
  if (!isEdit && courseMasterList.find(c => c.KodKursus === kod)) {
    toast('Kod Kursus ini sudah wujud. Guna "Edit CLO" untuk kemaskini.', 'error'); return;
  }

  const clos = Array.from(document.querySelectorAll('#cm-clo-rows .repeat-row')).map(row => ({
    id: row.querySelector('.cm-clo-id').value,
    desc: row.querySelector('.cm-clo-desc').value,
  })).filter(c => c.id || c.desc);

  const qo1 = document.getElementById('cm-qo1').value || '90';
  const qo2 = document.getElementById('cm-qo2').value || '25';

  const btn = document.getElementById('btn-save-cm');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('saveCourseMaster', { data: {
      KodKursus: kod, NamaKursus: nama,
      CLOList: JSON.stringify(clos),
      QO1Threshold: qo1, QO2Threshold: qo2,
      HeadOfCourse: document.getElementById('cm-hoc').value.trim()
    }});
    if (result.success) {
      toast('Kursus berjaya disimpan.', 'success');
      closeDetailModal();
      await loadAllData();
      showPage('kursus');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Save'; }
}

async function deleteCourseMasterItem(kod) {
  const linked = programKursusList.filter(p => p.KodKursus === kod);
  const warnMsg = linked.length
    ? `Kursus ini dikaitkan dengan ${linked.length} program. Memadam akan turut memadam semua pautan program berkenaan. Teruskan?`
    : 'Delete kursus ini daripada senarai induk?';
  if (!confirm(warnMsg)) return;
  try {
    // delete linked ProgramKursus first
    for (const p of linked) {
      await apiPost('deleteProgramKursus', { id: p.ID });
    }
    const result = await apiPost('deleteCourseMaster', { kodKursus: kod });
    if (result.success) { toast('Kursus dipadam.', 'success'); await loadAllData(); showPage('kursus'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}

/* ===== ProgramKursus: kaitkan kursus dengan Jabatan/Program + PLO ===== */

function openProgramLinkPanel(kodKursus) {
  const course = courseMasterList.find(c => c.KodKursus === kodKursus);
  if (!course) return;
  const links = programKursusList.filter(p => p.KodKursus === kodKursus);

  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal">
      <div class="modal-title">Pautan Program — ${esc(course.KodKursus)} (${esc(course.NamaKursus)})</div>
      <p class="text-sm text-muted mt-1" style="margin-bottom:1rem;">Kaitkan kursus ini dengan Jabatan &amp; Program. Setiap pautan ada PLO sendiri — biasanya sama untuk semua program, tapi boleh diubah untuk kes pengecualian.</p>

      <div id="program-links-list">${renderProgramLinksList(links)}</div>

      <button class="btn btn-outline mt-2" onclick="addProgramLinkRow('${esc(kodKursus)}')">＋ Kaitkan dengan Program Baharu</button>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Close</button>
      </div>
    </div>
  </div>`;
}

function renderProgramLinksList(links) {
  if (!links.length) return '<p class="text-sm text-muted">Belum ada programmes linked dengan kursus ini.</p>';
  return links.map(l => {
    const plos = safeParseArr(l.PLOList);
    const safeId = esc(l.ID);
    const safeKod = esc(l.KodKursus);
    return `
    <div class="section-block">
      <div class="flex justify-between items-center">
        <div><span class="tag tag-blue">${esc(l.Jabatan)}</span> <b>${esc(l.Program)}</b></div>
        <div>
          <button class="btn btn-outline btn-sm" onclick="editProgramLinkPLO('${safeId}')">Edit PLO</button>
          <button class="btn btn-red btn-sm" onclick="removeProgramLink('${safeId}','${safeKod}')">Buang</button>
        </div>
      </div>
      <div class="text-sm text-muted mt-1">${plos.length} PLO ${plos.length ? '— ' + plos.map(p => esc(p.id)).join(', ') : ''}</div>
      ${!l.ID ? '<div class="alert alert-amber mt-1" style="margin-bottom:0;">⚠️ Pautan ini tiada ID — kemungkinan data lama/rosak. Buang dan tambah semula.</div>' : ''}
    </div>`;
  }).join('');
}

function addProgramLinkRow(kodKursus) {
  const root = document.getElementById('modal-root');
  const existingModal = document.querySelector('.modal-bg.open .modal');
  const panel = document.createElement('div');
  panel.className = 'modal-bg open';
  panel.id = 'modal-add-link';
  panel.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-title">Kaitkan Program Baharu</div>
      <div class="form-group">
        <label>Department</label>
        <select id="pl-jabatan">${JABATAN_LIST.map(j => `<option>${j}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Nama Program (singkatan)</label><input id="pl-program" placeholder="cth: DEM, DGU"></div>
      <div class="form-group">
        <label>Sumber PLO</label>
        <select id="pl-plo-source" onchange="togglePloSource()">
          <option value="copy">Salin PLO daripada pautan lain (jika kursus dah ada pautan)</option>
          <option value="new">Masukkan PLO baharu</option>
        </select>
      </div>
      <div id="pl-plo-rows-wrap" class="hidden">
        <div class="flex items-center justify-between mt-1"><b class="text-sm">PLO</b><button class="btn btn-outline btn-sm" type="button" onclick="addPlRow()">+ Add PLO</button></div>
        <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;"><span>PLO</span><span>Description</span><span></span></div>
        <div id="pl-plo-rows"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-add-link').remove()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-link" onclick="saveProgramLink('${esc(kodKursus)}')">Save</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const hasOtherLinks = programKursusList.some(p => p.KodKursus === kodKursus);
  if (!hasOtherLinks) {
    document.getElementById('pl-plo-source').value = 'new';
    togglePloSource();
    addPlRow(); addPlRow();
  }
}

function togglePloSource() {
  const source = document.getElementById('pl-plo-source').value;
  const wrap = document.getElementById('pl-plo-rows-wrap');
  if (source === 'new') {
    wrap.classList.remove('hidden');
    if (!document.getElementById('pl-plo-rows').children.length) { addPlRow(); addPlRow(); }
  } else {
    wrap.classList.add('hidden');
  }
}

function addPlRow(data) {
  const wrap = document.getElementById('pl-plo-rows');
  const count = wrap.children.length + 1;
  const d = data || { id: 'PLO' + count, desc: '' };
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '80px 1fr 40px';
  row.innerHTML = `
    <input type="text" class="pl-plo-id" value="${esc(d.id)}" placeholder="PLO1">
    <input type="text" class="pl-plo-desc" value="${esc(d.desc)}" placeholder="Description PLO">
    <button class="btn btn-red btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

async function saveProgramLink(kodKursus) {
  const jabatan = document.getElementById('pl-jabatan').value;
  const program = document.getElementById('pl-program').value.trim();
  if (!program) { toast('Sila isi nama program.', 'error'); return; }

  const source = document.getElementById('pl-plo-source').value;
  let plos = [];
  if (source === 'copy') {
    const otherLink = programKursusList.find(p => p.KodKursus === kodKursus);
    plos = otherLink ? safeParseArr(otherLink.PLOList) : [];
  } else {
    plos = Array.from(document.querySelectorAll('#pl-plo-rows .repeat-row')).map(row => ({
      id: row.querySelector('.pl-plo-id').value,
      desc: row.querySelector('.pl-plo-desc').value,
    })).filter(p => p.id || p.desc);
  }

  const btn = document.getElementById('btn-save-link');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('saveProgramKursus', { data: { Jabatan: jabatan, Program: program, KodKursus: kodKursus, PLOList: JSON.stringify(plos) } });
    if (result.success) {
      toast('Program berjaya dikaitkan.', 'success');
      document.getElementById('modal-add-link').remove();
      await loadAllData();
      openProgramLinkPanel(kodKursus);
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Save'; }
}

function editProgramLinkPLO(linkId) {
  const link = programKursusList.find(p => p.ID === linkId);
  if (!link) return;
  const panel = document.createElement('div');
  panel.className = 'modal-bg open';
  panel.id = 'modal-edit-plo';
  panel.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-title">Edit PLO — ${esc(link.Jabatan)} / ${esc(link.Program)}</div>
      <div class="flex items-center justify-between"><b class="text-sm">PLO</b><button class="btn btn-outline btn-sm" type="button" onclick="addEditPlRow()">+ Add PLO</button></div>
      <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;"><span>PLO</span><span>Description</span><span></span></div>
      <div id="edit-plo-rows"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-edit-plo').remove()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-edit-plo" onclick="saveEditedPLO('${linkId}','${esc(link.KodKursus)}')">Save</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const plos = safeParseArr(link.PLOList);
  if (plos.length) plos.forEach(p => addEditPlRow(p)); else addEditPlRow();
}

function addEditPlRow(data) {
  const wrap = document.getElementById('edit-plo-rows');
  const count = wrap.children.length + 1;
  const d = data || { id: 'PLO' + count, desc: '' };
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '80px 1fr 40px';
  row.innerHTML = `
    <input type="text" class="edit-plo-id" value="${esc(d.id)}" placeholder="PLO1">
    <input type="text" class="edit-plo-desc" value="${esc(d.desc)}" placeholder="Description PLO">
    <button class="btn btn-red btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

async function saveEditedPLO(linkId, kodKursus) {
  const plos = Array.from(document.querySelectorAll('#edit-plo-rows .repeat-row')).map(row => ({
    id: row.querySelector('.edit-plo-id').value,
    desc: row.querySelector('.edit-plo-desc').value,
  })).filter(p => p.id || p.desc);

  const btn = document.getElementById('btn-save-edit-plo');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('saveProgramKursus', { data: { ID: linkId, PLOList: JSON.stringify(plos) } });
    if (result.success) {
      toast('PLO berjaya dikemaskini.', 'success');
      document.getElementById('modal-edit-plo').remove();
      await loadAllData();
      openProgramLinkPanel(kodKursus);
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Save'; }
}

async function removeProgramLink(linkId, kodKursus) {
  if (!confirm('Buang pautan program ini?')) return;
  try {
    const result = await apiPost('deleteProgramKursus', { id: linkId });
    if (result.success) {
      toast('Pautan dibuang.', 'success');
      await loadAllData();
      openProgramLinkPanel(kodKursus);
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}

/* ===================================================================
   PENGURUSAN PENSYARAH & KELAS (Admin)
   =================================================================== */

function renderPensyarahPage() {
  if (currentUser.Peranan !== 'admin') {
    return `<div class="page-title">Access Restricted</div><p class="text-muted">Only administrators can manage this list.</p>`;
  }

  const pGrouped = {}, kGrouped = {};
  pensyarahList.forEach(p => { if (!pGrouped[p.KodKursus]) pGrouped[p.KodKursus] = []; pGrouped[p.KodKursus].push(p); });
  kelasList.forEach(k => { if (!kGrouped[k.KodKursus]) kGrouped[k.KodKursus] = []; kGrouped[k.KodKursus].push(k); });

  const allKod = [...new Set([...Object.keys(pGrouped), ...Object.keys(kGrouped)])];

  const cards = allKod.map(kod => {
    const course = courseMasterList.find(c => c.KodKursus === kod);
    const pRows = (pGrouped[kod] || []).map(p => `
      <tr>
        <td>${esc(p.NamaPensyarah)}</td>
        <td><span class="tag tag-blue">Lecturer</span></td>
        <td><button class="btn btn-red btn-sm" onclick="deletePItem('${esc(p.ID)}')">Delete</button></td>
      </tr>`).join('');
    const kRows = (kGrouped[kod] || []).map(k => `
      <tr>
        <td>${esc(k.NamaKelas)}</td>
        <td><span class="tag tag-green">Class</span></td>
        <td><button class="btn btn-red btn-sm" onclick="deleteKItem('${esc(k.ID)}')">Delete</button></td>
      </tr>`).join('');
    return `
    <div class="card">
      <div class="card-title"><span class="tag tag-blue">${esc(kod)}</span> ${course ? esc(course.NamaKursus) : ''}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
          <tbody>${pRows}${kRows}${!pRows && !kRows ? '<tr><td colspan="3" class="text-muted">No records.</td></tr>' : ''}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-title">Lecturers &amp; Classes</div>
    <div class="page-sub">Manage lecturer and class lists by course code.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openPKFormNew('pensyarah')">＋ Add Lecturer</button>
      <button class="btn btn-outline" onclick="openPKFormNew('kelas')">＋ Add Class</button>
      <button class="btn btn-outline" onclick="refreshPensyarahPage()" title="Refresh list from Google Sheets">🔄 Refresh</button>
    </div>
    ${allKod.length === 0 ? `<div class="card">${emptyState('👨‍🏫', 'No records yet. Click "+ Add Lecturer" or "+ Add Class" to start.')}</div>` : cards}`;
}

async function refreshPensyarahPage() {
  toast('Refreshing data from Google Sheets...', 'success');
  try {
    const [pRes, kRes] = await Promise.all([apiGet('getPensyarah'), apiGet('getKelas')]);
    if (pRes.success) pensyarahList = pRes.data;
    if (kRes.success) kelasList = kRes.data;
    showPage('pensyarah');
    toast('Data refreshed successfully.', 'success');
  } catch (err) { toast('Refresh failed: ' + err.message, 'error'); }
}

function openPKFormNew(jenis) {
  const courses = courseMasterList.map(c => `<option value="${esc(c.KodKursus)}">${esc(c.KodKursus)} — ${esc(c.NamaKursus)}</option>`).join('');
  const label = jenis === 'pensyarah' ? 'Lecturer Name' : 'Class Name';
  const placeholder = jenis === 'pensyarah' ? 'cth: Dr. Ahmad bin Ali' : 'cth: DTP1A';
  const fieldId = jenis === 'pensyarah' ? 'pk-nama-pensyarah' : 'pk-nama-kelas';
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">${jenis === 'pensyarah' ? '👨‍🏫 Add Pensyarah' : '🏫 Add Kelas'}</div>
      <div class="form-group">
        <label>Kod Kursus</label>
        <select id="pk-kod"><option value="">— Select Course —</option>${courses}</select>
      </div>
      <div class="form-group"><label>${label}</label><input id="${fieldId}" placeholder="${placeholder}"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-pk2" onclick="savePKNew('${jenis}')">Save</button>
      </div>
    </div>
  </div>`;
}

async function savePKNew(jenis) {
  const kod = document.getElementById('pk-kod').value;
  const fieldId = jenis === 'pensyarah' ? 'pk-nama-pensyarah' : 'pk-nama-kelas';
  const nama = document.getElementById(fieldId).value.trim();
  if (!kod || !nama) { toast('Please fill in all required fields.', 'error'); return; }
  const btn = document.getElementById('btn-save-pk2');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const action = jenis === 'pensyarah' ? 'savePensyarah' : 'saveKelas';
    const dataKey = jenis === 'pensyarah' ? 'NamaPensyarah' : 'NamaKelas';
    const result = await apiPost(action, { data: { KodKursus: kod, [dataKey]: nama } });
    if (result.success) {
      toast(`${jenis === 'pensyarah' ? 'Pensyarah' : 'Kelas'} berjaya ditambah.`, 'success');
      closeDetailModal();
      await loadAllData();
      showPage('pensyarah');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Save'; }
}

async function deletePItem(id) {
  if (!confirm('Delete this lecturer?')) return;
  try {
    const result = await apiPost('deletePensyarah', { id });
    if (result.success) {
      pensyarahList = pensyarahList.filter(p => String(p.ID) !== String(id));
      toast('Lecturer deleted.', 'success');
      showPage('pensyarah');
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function deleteKItem(id) {
  if (!confirm('Delete this class?')) return;
  try {
    const result = await apiPost('deleteKelas', { id });
    if (result.success) {
      kelasList = kelasList.filter(k => String(k.ID) !== String(id));
      toast('Class deleted.', 'success');
      showPage('pensyarah');
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

/* ===================================================================
   PDF ARCHIVE — Senarai semua PDF yang telah dijanakan
   =================================================================== */

function renderPDFArchivePage() {
  const assignedKod = currentUser.KodKursus;
  let logs = pdfLogList.slice().reverse();
  if (currentUser.Peranan !== 'admin' && assignedKod) {
    logs = logs.filter(l => l.KodKursus === assignedKod);
  }

  // Get unique sessions for filter
  const sessions = [...new Set(logs.map(l => l.Sesi).filter(Boolean))].sort().reverse();
  const filterHTML = `
    <div class="flex items-center gap-8" style="margin-bottom:1.5rem;">
      <label class="text-sm" style="white-space:nowrap;font-weight:500;">Filter by Session:</label>
      <select id="session-filter-pdf" onchange="filterPDFsBySession()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">
        <option value="">— All Sessions —</option>
        ${sessions.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
      </select>
      ${sessions.length === 0 ? '<span class="text-sm text-muted">(No PDFs yet)</span>' : ''}
    </div>`;

  // Group by KodKursus → Sesi
  const grouped = {};
  logs.forEach(l => {
    const key = `${l.KodKursus}|${l.Sesi}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(l);
  });

  const cards = Object.keys(grouped).map(key => {
    const [kod, sesi] = key.split('|');
    const items = grouped[key];
    const rows = items.map(l => `
      <tr>
        <td>${esc(l.NamaFail || `CQI_${l.KodKursus}_${l.Sesi}`)}</td>
        <td>${fmtDate(l.TarikhJana)}</td>
        <td>${esc(l.JanaOleh)}</td>
        <td>
          ${l.DriveURL
            ? `<a href="${esc(l.DriveURL)}" target="_blank" class="btn btn-blue btn-sm">📄 Open PDF ↗</a>`
            : '<span class="text-muted text-sm">No link</span>'}
        </td>
      </tr>`).join('');

    return `
    <div class="card pdf-archive-card" data-sesi="${esc(sesi)}">
      <div class="card-title">
        <span class="tag tag-blue">${esc(kod)}</span>
        <span style="margin-left:8px;">Session: ${esc(sesi)}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>File Name</th><th>Generated On</th><th>Generated By</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-title">PDF Archive</div>
    <div class="page-sub">All generated CQI Report PDFs. Click "Open PDF" to view directly from Google Drive.</div>
    ${filterHTML}
    ${logs.length === 0
      ? `<div class="card">${emptyState('🗂️', 'No PDF reports generated yet. Generate a PDF from a fully verified CQI Report.')}</div>`
      : cards}`;
}

/* ===================================================================
   SESSION FILTER & DUPLICATE FUNCTIONS
   =================================================================== */

function filterReportsBySession() {
  const sel = document.getElementById('session-filter-reports');
  const val = sel?.value || '';
  document.querySelectorAll('#reports-tbody .report-row').forEach(row => {
    const sesi = row.getAttribute('data-sesi') || '';
    row.style.display = (!val || sesi === val) ? '' : 'none';
  });
}

function filterPDFsBySession() {
  const sel = document.getElementById('session-filter-pdf');
  const val = sel?.value || '';
  document.querySelectorAll('.pdf-archive-card').forEach(card => {
    const sesi = card.getAttribute('data-sesi') || '';
    card.style.display = (!val || sesi === val) ? '' : 'none';
  });
}

async function duplicateReport(id) {
  const r = cqiReports.find(x => x.ID === id);
  if (!r) return;

  if (!confirm(`Duplicate report "${r.KodKursus} — ${r.Sesi}"?\n\nSection 5 (Student Performance, CLO%, PLO%) will be cleared.\nSections 1-4, 6 & 7 (including attachments) will be copied.\nA new Draft will be created.`)) return;

  // Build duplicated data — keep sections 1,2,3,4,6 — clear section 5 and signatures
  const duplicated = {
    // Section 1 — Course Info
    Jabatan: r.Jabatan,
    Program: r.Program,
    KodKursus: r.KodKursus,
    NamaKursus: r.NamaKursus,
    Pensyarah: r.Pensyarah,
    SesiLepas: r.Sesi, // previous session becomes current's "sesi lepas"
    BilPelajar: r.BilPelajar,
    // Section 2 — Minutes (keep venue & attendance, clear date/time for new session)
    MinitKehadiran: r.MinitKehadiran,
    MinitTarikh: '',
    MinitMasa: '',
    MinitTempat: r.MinitTempat,
    // Section 3 — Issues
    IsuCLO: r.IsuCLO,
    IsuPLO: r.IsuPLO,
    // Section 4 — Activity
    AktivitiNama: r.AktivitiNama,
    AktivitiTarikh: '',
    AktivitiBilPelajar: '',
    AktivitiObjektif: r.AktivitiObjektif,
    AktivitiRingkasan: r.AktivitiRingkasan,
    // Section 5 — CLEARED
    GredData: '{}',
    QualityObj1Capai: '',
    QualityObj1Tindakan: '',
    QualityObj2Capai: '',
    QualityObj2Tindakan: '',
    CLOData: JSON.stringify(safeParseArr(r.CLOData).map(c => ({ ...c, pct: '', pctLepas: c.pct || '' }))),
    PLOData: JSON.stringify(safeParseArr(r.PLOData).map(p => ({ ...p, pct: '', pctLepas: p.pct || '' }))),
    // Section 6 — Comments
    Ulasan: r.Ulasan,
    Cadangan: r.Cadangan,
    // Section 7 — Keep attachments (usually same for same course)
    LampiranMinitURL: r.LampiranMinitURL || '',
    LampiranAktivitiURL: r.LampiranAktivitiURL || '',
    // Signatures — cleared, new draft
    StatusPenyelaras: 'Draf',
    StatusKetua: 'Menunggu',
    SignedByPenyelaras: '',
    SigPenyelarasData: '',
    TarikhPenyelaras: '',
    SignedByKetua: '',
    SigKetuaData: '',
    TarikhKetua: '',
    KomenKetua: '',
    CreatedBy: currentUser.Nama,
    Sesi: '', // penyelaras will fill new session
  };

  try {
    const result = await apiPost('saveCQIReport', { data: duplicated });
    if (result.success) {
      toast('Report duplicated successfully. Opening edit form...', 'success');
      await loadAllData();
      // Open edit form for the new duplicated report
      setTimeout(() => openReportForm(result.id), 800);
    } else {
      toast(result.message || 'Failed to duplicate.', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

/* ===================================================================
   QUICK ADD LECTURER / CLASS MODALS (dari borang laporan CQI)
   =================================================================== */

function openAddLecturerModal() {
  const kod = document.getElementById('f-kod')?.value || '';
  if (!kod) { toast('Please select a course first.', 'error'); return; }
  const panel = document.createElement('div');
  panel.className = 'modal-bg open';
  panel.id = 'modal-quick-add-lecturer';
  panel.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-title">👨‍🏫 Add New Lecturer</div>
      <div class="form-group">
        <label>Lecturer Name</label>
        <input type="text" id="quick-lecturer-name" placeholder="e.g.: Dr. Ahmad bin Ali" autofocus>
      </div>
      <div class="form-hint">Will be added to the lecturer list for course <b>${esc(kod)}</b>.</div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-quick-add-lecturer').remove()">Cancel</button>
        <button class="btn btn-blue" id="btn-quick-add-lec" onclick="quickAddLecturer('${esc(kod)}')">Add</button>
      </div>
    </div>`;
  document.body.appendChild(panel);
  setTimeout(() => document.getElementById('quick-lecturer-name')?.focus(), 100);
}

async function quickAddLecturer(kod) {
  const nama = document.getElementById('quick-lecturer-name').value.trim();
  if (!nama) { toast('Please enter lecturer name.', 'error'); return; }
  const btn = document.getElementById('btn-quick-add-lec');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span>';
  try {
    const result = await apiPost('savePensyarah', { data: { KodKursus: kod, NamaPensyarah: nama } });
    if (result.success) {
      pensyarahList.push({ ID: result.id || Date.now(), KodKursus: kod, NamaPensyarah: nama });
      refreshLecturerDatalist(kod);
      refreshKehadiranCheckboxes(kod);
      toast(`Lecturer "${nama}" added successfully.`, 'success');
      document.getElementById('modal-quick-add-lecturer').remove();
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Add'; }
}

function openAddClassModal() {
  const kod = document.getElementById('f-kod')?.value || '';
  const program = document.getElementById('f-program')?.value || '';
  if (!kod) { toast('Please select a course first.', 'error'); return; }
  const panel = document.createElement('div');
  panel.className = 'modal-bg open';
  panel.id = 'modal-quick-add-class';
  panel.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-title">🏫 Add New Class</div>
      <div class="form-group">
        <label>Class Name</label>
        <input type="text" id="quick-class-name" placeholder="e.g.: ${esc(program)}1A" autofocus>
      </div>
      <div class="form-hint">Will be added to the class list for course <b>${esc(kod)}</b>.</div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-quick-add-class').remove()">Cancel</button>
        <button class="btn btn-blue" id="btn-quick-add-cls" onclick="quickAddClass('${esc(kod)}')">Add</button>
      </div>
    </div>`;
  document.body.appendChild(panel);
  setTimeout(() => document.getElementById('quick-class-name')?.focus(), 100);
}

async function quickAddClass(kod) {
  const nama = document.getElementById('quick-class-name').value.trim();
  if (!nama) { toast('Please enter class name.', 'error'); return; }
  const btn = document.getElementById('btn-quick-add-cls');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span>';
  try {
    const result = await apiPost('saveKelas', { data: { KodKursus: kod, NamaKelas: nama } });
    if (result.success) {
      if (result.message !== 'Kelas sudah wujud.') {
        kelasList.push({ ID: result.id || Date.now(), KodKursus: kod, NamaKelas: nama });
      }
      refreshLecturerDatalist(kod);
      toast(`Class "${nama}" added successfully.`, 'success');
      document.getElementById('modal-quick-add-class').remove();
    } else toast(result.message, 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Add'; }
}
