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
let pensyarahKelasList = [];
let pensyarahList = [];
let kelasList = [];
let pdfLogList = [];
let currentPage = 'dashboard';
let editingReportId = null;

// ===== ACCESS CONTROL =====
// Returns filtered reports based on current user's role and assigned course
function getVisibleReports() {
  if (!currentUser) return [];
  // Admin sees all
  if (currentUser.Peranan === 'admin') return cqiReports;
  // Penyelaras and Ketua — only see assigned KodKursus
  const assignedKod = currentUser.KodKursus;
  if (!assignedKod) return cqiReports; // fallback: show all if not assigned
  return cqiReports.filter(r => r.KodKursus === assignedKod);
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
    errEl.textContent = 'Sila masukkan No. Staf.';
    errEl.style.display = 'block';
    return;
  }

  btnEl.disabled = true;
  loadingEl.style.display = 'block';

  try {
    const result = await apiGet('login', { ic, role });
    if (!result.success) {
      errEl.textContent = result.message || 'No. Staf tidak ditemui.';
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
    const [reportsRes, laporanRes, courseRes, programRes, pkRes, pensyarahRes, kelasRes, pdfLogRes] = await Promise.all([
      apiGet('getCQIReports'),
      apiGet('getLaporan'),
      apiGet('getCourseMaster'),
      apiGet('getProgramKursus'),
      apiGet('getPensyarahKelas'),
      apiGet('getPensyarah'),
      apiGet('getKelas'),
      apiGet('getPDFLog'),
    ]);
    if (reportsRes.success) cqiReports = reportsRes.data;
    if (laporanRes.success) laporanList = laporanRes.data;
    if (courseRes.success) courseMasterList = courseRes.data;
    if (programRes.success) programKursusList = programRes.data;
    if (pkRes.success) pensyarahKelasList = pkRes.data;
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
  { id: 'reports', icon: '📝', label: 'CQI Reports' },
  { id: 'perbandingan', icon: '🔄', label: 'Session Comparison' },
  { sep: 'Others' },
  { id: 'laporan', icon: '📄', label: 'Reports & Minutes' },
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
  else if (id === 'reports') main.innerHTML = renderReportsPage();
  else if (id === 'perbandingan') main.innerHTML = renderComparisonPage();
  else if (id === 'laporan') main.innerHTML = renderLaporanPage();
  else if (id === 'pdfarchive') main.innerHTML = renderPDFArchivePage();
  else if (id === 'kursus') main.innerHTML = renderKursusPage();
  else if (id === 'pensyarah') main.innerHTML = renderPensyarahPage();
  else if (id === 'pengguna') { main.innerHTML = renderPenggunaPage(); loadUsers().then(() => { if (currentPage === 'pengguna') main.innerHTML = renderPenggunaPage(); }); }
}

window.onload = () => { initAllSigCanvases(); };
/* ===================================================================
   PAPAN PEMUKA (DASHBOARD)
   =================================================================== */

function renderDashboard() {
  const visibleReports = getVisibleReports();
  const totalReports = visibleReports.length;
  const fullySigned = visibleReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan').length;
  const pendingKetua = visibleReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan').length;
  const avgClo = computeAvgCloAll(visibleReports);

  const rows = visibleReports.slice().reverse().slice(0, 8).map(r => `
    <tr>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.NamaKursus)}</td>
      <td>${esc(r.Sesi)}</td>
      <td>${statusBadge(r)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openReportDetail('${r.ID}')">View</button></td>
    </tr>`).join('');

  return `
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Selamat datang, ${esc(currentUser.Nama)}. Ringkasan laporan CQI semasa.</div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Jumlah CQI Reports</div><div class="stat-value">${totalReports}</div></div>
      <div class="stat-card"><div class="stat-label">Purata CLO Dicapai</div><div class="stat-value">${avgClo !== null ? avgClo + '%' : '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Fully Verified Reports</div><div class="stat-value">${fullySigned}</div></div>
      <div class="stat-card"><div class="stat-label">Pending Course Head</div><div class="stat-value">${pendingKetua}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Latest CQI Reports</div>
      ${totalReports === 0 ? emptyState('📋', 'Belum ada laporan CQI. Mula tambah laporan baharu.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kod</th><th>Course Name</th><th>Session</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
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
  const rows = visibleReports.map(r => `
    <tr>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.NamaKursus)}</td>
      <td>${esc(r.Sesi)}</td>
      <td>${esc(r.BilPelajar)}</td>
      <td>${statusBadge(r)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openReportDetail('${r.ID}')">View</button>
        <button class="btn btn-outline btn-sm" onclick="openReportForm('${r.ID}')">Edit</button>
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
      ${visibleReports.length === 0 ? emptyState('📝', 'No CQI reports yet. Click "Add CQI Report" to start.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kod</th><th>Course Name</th><th>Session</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
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
    <div class="modal">
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
          <div class="flex items-center justify-between"><b class="text-sm">1.2/1.3 Class &amp; Lecturer</b><button class="btn btn-outline btn-sm" type="button" onclick="addLecturerRow()">+ Add</button></div>
          <div class="repeat-header" style="grid-template-columns:1fr 1fr 40px;" class="mt-1"><span>Class Name</span><span>Lecturer Name</span><span></span></div>
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
            <div id="kehadiran-wrap" style="border:1px solid var(--border);border-radius:7px;padding:10px;background:#fff;min-height:44px;">
              <div id="kehadiran-checkboxes" style="display:flex;flex-wrap:wrap;gap:10px;"></div>
              <div id="kehadiran-empty" class="text-sm text-muted">Select course first to display lecturer list.</div>
            </div>
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
                <tr style="background:#F0F7FF;">
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
          <div class="repeat-header" style="grid-template-columns:70px 2.5fr 80px 80px 70px;" id="clo-header-row"><span>CLO</span><span>Description</span><span>% Current</span><span>% Previous</span><span>% Diff</span></div>
          <div id="clo-rows"></div>
          <div class="text-sm text-muted mt-1" id="clo-empty-msg">Select course first to display CLO.</div>
        </div>

        <div class="mt-2">
          <b class="text-sm">5.4 Programme Learning Outcome (PLO)</b>
          <div class="repeat-header" style="grid-template-columns:70px 2.5fr 80px 80px 70px;" id="plo-header-row"><span>PLO</span><span>Description</span><span>% Current</span><span>% Previous</span><span>% Diff</span></div>
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
    return { id: c.id, desc: c.desc, pct: saved?.pct || '', pctLepas: saved?.pctLepas || '' };
  });
  const ploRows = plos.map(p => {
    const saved = savedPlos.find(s => s.id === p.id);
    return { id: p.id, desc: p.desc, pct: saved?.pct || '', pctLepas: saved?.pctLepas || '' };
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
    <label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:13px;background:#fff;">
      <input type="checkbox" class="kehadiran-cb" value="${esc(p)}" ${savedKehadiran.includes(p) ? 'checked' : ''} style="cursor:pointer;">
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
    if (prevInput && prevClo) { prevInput.value = prevClo.pct || ''; updateOcDiff(row.querySelector('.oc-pct')); }
  });

  // Update % Previous untuk PLO
  document.querySelectorAll('#plo-rows .repeat-row').forEach(row => {
    const id = row.querySelector('.oc-id')?.value;
    const prevPlo = prevPlos.find(p => p.id === id);
    const prevInput = row.querySelector('.oc-pct-lepas');
    if (prevInput && prevPlo) { prevInput.value = prevPlo.pct || ''; updateOcDiff(row.querySelector('.oc-pct')); }
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
  const kList = kelasList.filter(k => k.KodKursus === kod).map(k => k.NamaKelas);
  const pList = pensyarahList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah);

  // Kemaskini semua datalist kelas dalam baris sedia ada
  document.querySelectorAll('#lecturer-rows .repeat-row').forEach(row => {
    const kelasInput = row.querySelector('.lec-kelas');
    if (kelasInput) {
      const dl = document.getElementById(kelasInput.getAttribute('list'));
      if (dl) dl.innerHTML = kList.map(k => `<option value="${esc(k)}">`).join('');
    }
    // Kemaskini dropdown pensyarah
    const pensyarahSel = row.querySelector('.lec-pensyarah');
    if (pensyarahSel) {
      const currentVal = pensyarahSel.value;
      pensyarahSel.innerHTML = `<option value="">— Select Lecturer —</option>` +
        pList.map(p => `<option value="${esc(p)}" ${p === currentVal ? 'selected' : ''}>${esc(p)}</option>`).join('') +
        (currentVal && !pList.includes(currentVal) ? `<option value="${esc(currentVal)}" selected>${esc(currentVal)}</option>` : '');
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
    r1.textContent = allZero ? '—' : (qo1Pass ? '✅ Ya' : '❌ Tidak');
    r1.style.color = allZero ? 'var(--text-muted)' : (qo1Pass ? 'var(--success)' : 'var(--danger)');
    if (c1) c1.textContent = !allZero ? `Total D and above: ${sumQO1.toFixed(1)}% (Threshold: ≥${threshold1}%)` : '';
  }
  if (r2) {
    r2.textContent = allZero ? '—' : (qo2Pass ? '✅ Ya' : '❌ Tidak');
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
    row.style.gridTemplateColumns = '70px 2.5fr 80px 80px 70px';
    row.innerHTML = `
      <input type="text" class="oc-id" value="${esc(d.id)}" readonly style="background:#F1EFE8;font-size:12px;">
      <input type="text" class="oc-desc" value="${esc(d.desc)}" readonly style="background:#F1EFE8;font-size:12px;" title="${esc(d.desc)}">
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

  // Senarai pensyarah dari tab Pensyarah (ikut kursus)
  const pList = pensyarahList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah);
  // Senarai kelas dari tab Kelas (ikut kursus)
  const kList = kelasList.filter(k => k.KodKursus === kod).map(k => k.NamaKelas);

  const uid = Date.now() + Math.floor(Math.random() * 1000);
  const kelas = (val && typeof val === 'object') ? (val.kelas || '') : '';
  const pensyarah = (val && typeof val === 'object') ? (val.pensyarah || '') : (typeof val === 'string' ? val : '');

  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '1fr 1fr 40px';
  row.innerHTML = `
    <div>
      <select class="lec-pensyarah" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">
        <option value="">— Select Lecturer —</option>
        ${pList.map(p => `<option value="${esc(p)}" ${p === pensyarah ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        ${pensyarah && !pList.includes(pensyarah) ? `<option value="${esc(pensyarah)}" selected>${esc(pensyarah)}</option>` : ''}
      </select>
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
  const pct = parseFloat(row.querySelector('.oc-pct').value) || 0;
  const pctLepas = parseFloat(row.querySelector('.oc-pct-lepas').value) || 0;
  const diff = (pct - pctLepas).toFixed(1);
  const diffEl = row.querySelector('.oc-diff');
  diffEl.textContent = (diff > 0 ? '+' : '') + diff + '%';
  diffEl.style.color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)';
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
  if (!confirm('Delete laporan CQI ini? Tindakan ini tidak boleh dibatalkan.')) return;
  try {
    const result = await apiPost('deleteCQIReport', { id });
    if (result.success) { toast('Laporan dipadam.', 'success'); await loadAllData(); showPage('reports'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
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
            <div class="sig-actions mt-1"><button class="btn btn-outline btn-sm" onclick="clearSigCanvas('penyelaras')">Clear</button></div>
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
            <div class="sig-actions mt-1"><button class="btn btn-outline btn-sm" onclick="clearSigCanvas('ketua')">Clear</button></div>
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

async function confirmSign(role, reportId) {
  const canvasId = 'sig-canvas-' + role;
  const state = sigCanvasState[canvasId];
  if (!state || !state.hasSig) { toast('Please draw your signature first.', 'error'); return; }
  const canvas = document.getElementById(canvasId);
  const sigData = canvas.toDataURL('image/png');
  const komen = role === 'ketua' ? (document.getElementById('komen-ketua')?.value || '') : '';

  // Get manual date — fallback to current datetime if not set
  const dateInput = document.getElementById('tarikh-' + role);
  const manualDate = dateInput?.value
    ? new Date(dateInput.value).toISOString()
    : new Date().toISOString();

  try {
    const result = await apiPost('signReport', {
      id: reportId, role,
      signerName: currentUser.Nama,
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
    checkPageBreak(12);
    doc.setFillColor(230, 241, 251);
    doc.rect(margin, y, W - 2 * margin, 7, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
    doc.text(num + '.0  ' + title, margin + 2, y + 5);
    doc.setTextColor(30, 30, 30);
    y += 11;
  }
  function fieldRow(label, value, width) {
    checkPageBreak(7);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value || '—'), (width || (W - 2 * margin - 55)));
    doc.text(lines, margin + 55, y);
    y += Math.max(6, lines.length * 5);
  }

  // Header
  doc.setFillColor(24, 95, 165);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN CONTINUOUS QUALITY IMPROVEMENT (CQI)', margin, 11);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Sesi: ' + (r.Sesi || '—'), margin, 18);
  doc.text('i-rCQI — Sistem Pelaporan iCQI', margin, 23);
  doc.setTextColor(30, 30, 30);
  y = 34;

  // 1.0 Course Information
  sectionTitle('1', 'Course Information');
  fieldRow('Program:', r.Program);
  fieldRow('Kod & Course Name:', r.KodKursus + ' — ' + r.NamaKursus);
  const lecturers = safeParseArr(r.Pensyarah);
  fieldRow('Kelas & Pensyarah:', lecturers.map(l => typeof l === 'object' ? `${l.kelas} — ${l.pensyarah}` : l).join('; ') || '—');
  fieldRow('Bilangan Pelajar:', r.BilPelajar);
  y += 2;

  // 2.0 Discussion Minutes
  sectionTitle('2', 'Discussion Minutes');
  const kehadiranArr = safeParseArr(r.MinitKehadiran);
  fieldRow('Kehadiran:', kehadiranArr.length ? kehadiranArr.join(', ') : (r.MinitKehadiran || '—'));
  fieldRow('Tarikh:', r.MinitTarikh);
  fieldRow('Masa:', r.MinitMasa);
  fieldRow('Tempat:', r.MinitTempat);
  y += 2;

  // 3.0 Isu CLO & PLO
  sectionTitle('3', 'Isu / Masalah CLO & PLO');
  fieldRow('Isu CLO:', r.IsuCLO, W - 2 * margin - 30);
  fieldRow('Isu PLO:', r.IsuPLO, W - 2 * margin - 30);
  y += 2;

  // 4.0 Aktiviti CQI
  sectionTitle('4', 'CQI Programme / Activity / Task');
  fieldRow('Nama Aktiviti:', r.AktivitiNama);
  fieldRow('Tarikh Pelaksanaan:', r.AktivitiTarikh);
  fieldRow('Bilangan Pelajar:', r.AktivitiBilPelajar);
  fieldRow('Objektif:', r.AktivitiObjektif, W - 2 * margin - 30);
  fieldRow('Ringkasan:', r.AktivitiRingkasan, W - 2 * margin - 30);
  y += 2;

  // 5.0 Student Performance
  sectionTitle('5', 'Student Performance');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.1 Student Grades (% of students)', margin, y); y += 5;
  const grades = safeParseObj(r.GredData);
  const gradesPrev = safeParseObj(r.GredDataLepas);
  const gradeKeys = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'];
  const tableW = W - 2 * margin;
  const labelW = 22;
  const colW = (tableW - labelW) / gradeKeys.length;

  checkPageBreak(24);
  // Header row
  doc.setFillColor(230, 241, 251); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
  doc.text('Session', margin + 1, y);
  gradeKeys.forEach((g, i) => doc.text(g, margin + labelW + i * colW + 1, y));
  doc.text('Total', margin + tableW - 8, y);
  y += 6;

  // Current session row
  doc.setFillColor(240, 247, 255); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(24, 95, 165);
  doc.text(r.Sesi || 'Current', margin + 1, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  let totalCurr = 0;
  gradeKeys.forEach((g, i) => { const v = parseFloat(grades[g] || 0); totalCurr += v; doc.text(v > 0 ? v.toFixed(1) : '0', margin + labelW + i * colW + 1, y); });
  doc.setFont('helvetica', 'bold'); doc.setTextColor(24, 95, 165);
  doc.text(totalCurr.toFixed(1) + '%', margin + tableW - 8, y);
  doc.setTextColor(30, 30, 30); y += 6;

  // Previous session row
  doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, tableW, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setTextColor(95, 94, 90);
  doc.text(r.SesiLepas || 'Previous', margin + 1, y);
  doc.setFont('helvetica', 'normal');
  let totalPrev = 0;
  gradeKeys.forEach((g, i) => { const v = parseFloat(gradesPrev[g] || 0); totalPrev += v; doc.text(v > 0 ? v.toFixed(1) : '—', margin + labelW + i * colW + 1, y); });
  doc.setFont('helvetica', 'bold');
  doc.text(totalPrev > 0 ? totalPrev.toFixed(1) + '%' : '—', margin + tableW - 8, y);
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
      doc.setFillColor(55, 138, 221);
      doc.rect(x + barGroupW * 0.05, chartY + chartH - bH, barW, bH, 'F');
    }
    // Previous bar (light blue)
    if (prevVal > 0) {
      const bH = (prevVal / maxVal) * chartH;
      doc.setFillColor(181, 212, 244);
      doc.rect(x + barGroupW * 0.05 + barW + 1, chartY + chartH - bH, barW, bH, 'F');
    }

    // Grade label
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(g, x + barGroupW * 0.15, chartY + chartH + 4);
  });

  // Legend
  y = chartY + chartH + 8;
  doc.setFillColor(55, 138, 221); doc.rect(margin + labelW, y, 8, 3, 'F');
  doc.setFontSize(6.5); doc.text(r.Sesi || 'Current Session', margin + labelW + 10, y + 2.5);
  doc.setFillColor(181, 212, 244); doc.rect(margin + labelW + 60, y, 8, 3, 'F');
  doc.text(r.SesiLepas || 'Previous Session', margin + labelW + 70, y + 2.5);
  y += 10;

  checkPageBreak(14);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.2 Quality Objectives', margin, y); y += 5;
  const qo1Th = parseFloat(courseMasterList.find(c => c.KodKursus === r.KodKursus)?.QO1Threshold) || 90;
  const qo2Th = parseFloat(courseMasterList.find(c => c.KodKursus === r.KodKursus)?.QO2Threshold) || 25;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`• ≥${qo1Th}% students achieved grade D and above: ` + (r.QualityObj1Capai || '—') + (r.QualityObj1Tindakan ? ' (' + r.QualityObj1Tindakan + ')' : ''), margin, y); y += 5;
  doc.text(`• ≥${qo2Th}% students achieved grade B and above: ` + (r.QualityObj2Capai || '—') + (r.QualityObj2Tindakan ? ' (' + r.QualityObj2Tindakan + ')' : ''), margin, y); y += 7;

  const clos = safeParseArr(r.CLOData);
  if (clos.length) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    checkPageBreak(12); doc.text('5.3 Course Learning Outcome (CLO)', margin, y); y += 5;
    // Header
    doc.setFillColor(230, 241, 251); doc.rect(margin, y - 4, W - 2 * margin, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('CLO', margin + 1, y);
    doc.text('Description', margin + 18, y);
    doc.text('% Current', margin + 118, y);
    doc.text('% Previous', margin + 143, y);
    doc.text('% Diff', margin + 168, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    clos.forEach((c, ci) => {
      const descLines = doc.splitTextToSize(String(c.desc || ''), 95);
      const rowH = Math.max(6, descLines.length * 5);
      checkPageBreak(rowH + 2);
      if (ci % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, rowH + 1, 'F'); }
      doc.text(String(c.id || ''), margin + 1, y);
      doc.text(descLines, margin + 18, y);
      doc.text(String(c.pct || '0') + '%', margin + 118, y);
      doc.text(String(c.pctLepas || '—'), margin + 143, y);
      const diff = ((parseFloat(c.pct) || 0) - (parseFloat(c.pctLepas) || 0)).toFixed(1);
      doc.setTextColor(diff > 0 ? 60 : diff < 0 ? 163 : 95, diff > 0 ? 109 : diff < 0 ? 45 : 94, diff > 0 ? 17 : diff < 0 ? 45 : 90);
      doc.text((diff > 0 ? '+' : '') + diff + '%', margin + 168, y);
      doc.setTextColor(30, 30, 30);
      y += rowH + 1;
    });
    y += 3;
  }

  const plos = safeParseArr(r.PLOData);
  if (plos.length) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    checkPageBreak(12); doc.text('5.4 Programme Learning Outcome (PLO)', margin, y); y += 5;
    // Header
    doc.setFillColor(230, 241, 251); doc.rect(margin, y - 4, W - 2 * margin, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('PLO', margin + 1, y);
    doc.text('Description', margin + 18, y);
    doc.text('% Current', margin + 118, y);
    doc.text('% Previous', margin + 143, y);
    doc.text('% Diff', margin + 168, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    plos.forEach((p, pi) => {
      const descLines = doc.splitTextToSize(String(p.desc || ''), 95);
      const rowH = Math.max(6, descLines.length * 5);
      checkPageBreak(rowH + 2);
      if (pi % 2 === 0) { doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, rowH + 1, 'F'); }
      doc.text(String(p.id || ''), margin + 1, y);
      doc.text(descLines, margin + 18, y);
      doc.text(String(p.pct || '0') + '%', margin + 118, y);
      doc.text(String(p.pctLepas || '—'), margin + 143, y);
      const diff = ((parseFloat(p.pct) || 0) - (parseFloat(p.pctLepas) || 0)).toFixed(1);
      doc.setTextColor(diff > 0 ? 60 : diff < 0 ? 163 : 95, diff > 0 ? 109 : diff < 0 ? 45 : 94, diff > 0 ? 17 : diff < 0 ? 45 : 90);
      doc.text((diff > 0 ? '+' : '') + diff + '%', margin + 168, y);
      doc.setTextColor(30, 30, 30);
      y += rowH + 1;
    });
    y += 3;
  }

  // 6.0 Ulasan
  sectionTitle('6', 'Ulasan & Cadangan');
  fieldRow('Ulasan:', r.Ulasan, W - 2 * margin - 30);
  fieldRow('Cadangan:', r.Cadangan, W - 2 * margin - 30);
  y += 2;

  // 7.0 Lampiran (clickable links)
  sectionTitle('7', 'Lampiran');
  checkPageBreak(14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(24, 95, 165);
  if (r.LampiranMinitURL) {
    doc.textWithLink('📎 Discussion Minutes (klik untuk buka)', margin, y, { url: r.LampiranMinitURL });
    y += 6;
  } else { doc.setTextColor(120,120,120); doc.text('Discussion Minutes: tiada lampiran', margin, y); y += 6; doc.setTextColor(24,95,165); }
  if (r.LampiranAktivitiURL) {
    doc.textWithLink('📎 Laporan Aktiviti / Program CQI (klik untuk buka)', margin, y, { url: r.LampiranAktivitiURL });
    y += 6;
  } else { doc.setTextColor(120,120,120); doc.text('Laporan Aktiviti: tiada lampiran', margin, y); y += 6; }
  doc.setTextColor(30, 30, 30);
  y += 4;

  // Pengesahan / Signatures
  checkPageBreak(70);
  doc.setFillColor(230, 241, 251);
  doc.rect(margin, y, W - 2 * margin, 7, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(12, 68, 124);
  doc.text('PENGESAHAN', margin + 2, y + 5);
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
  doc.text('Nama: ' + (r.SignedByPenyelaras || '___________________'), leftX, y);
  doc.text('Nama: ' + (r.SignedByKetua || headOfCourse), rightX, y);
  y += 5;
  doc.text('Tarikh: ' + (r.TarikhPenyelaras ? fmtDate(r.TarikhPenyelaras) : '________________'), leftX, y);
  doc.text('Tarikh: ' + (r.TarikhKetua ? fmtDate(r.TarikhKetua) : '________________'), rightX, y);
  y += 5;
  if (r.KomenKetua) {
    const komenLines = doc.splitTextToSize('Komen: ' + r.KomenKetua, colWidth);
    doc.text(komenLines, rightX, y);
  }

  // Footer
  doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
  doc.text('i-rCQI — Generated: ' + new Date().toLocaleString('en-MY') + ' | Confidential', margin, 292);

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
      <td><span class="tag ${u.Peranan === 'admin' ? 'tag-red' : u.Peranan === 'ketua' ? 'tag-blue' : 'tag-green'}">${roleLabel(u.Peranan)}</span></td>
      <td><button class="btn btn-red btn-sm" onclick="deleteUserItem('${u.IC}')">Delete</button></td>
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
          <thead><tr><th>Staff No.</th><th>Name</th><th>Role</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

function roleLabel(role) {
  return role === 'admin' ? 'Administrator' : role === 'ketua' ? 'Course Head' : 'Course Coordinator';
}

function openUserForm() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">👤 Add Pengguna</div>
      <div class="form-group"><label>No. Staf</label><input id="u-ic" maxlength="20" placeholder="cth: STF12345" style="text-transform:uppercase;"></div>
      <div class="form-group"><label>Nama Penuh</label><input id="u-nama"></div>
      <div class="form-group">
        <label>Peranan</label>
        <select id="u-role">
          <option value="penyelaras">Course Coordinator</option>
          <option value="ketua">Course Head</option>
          <option value="admin">Administrator</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Cancel</button>
        <button class="btn btn-blue" id="btn-save-user" onclick="saveUserItem()">Add</button>
      </div>
    </div>
  </div>`;
}

async function saveUserItem() {
  const ic = document.getElementById('u-ic').value.trim().toUpperCase();
  const nama = document.getElementById('u-nama').value.trim();
  if (!ic) { toast('Sila isi No. Staf.', 'error'); return; }
  if (!nama) { toast('Sila isi nama.', 'error'); return; }
  const btn = document.getElementById('btn-save-user');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('addUser', { data: { IC: ic, Nama: nama, Peranan: document.getElementById('u-role').value } });
    if (result.success) {
      toast('Pengguna ditambah.', 'success');
      closeDetailModal();
      await loadUsers();
      showPage('pengguna');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Add'; }
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
    return `<div class="page-title">Akses Terhad</div><p class="text-muted">Hanya pentadbir boleh mengurus senarai ini.</p>`;
  }

  // Group by KodKursus for both Pensyarah and Kelas
  const pGrouped = {}, kGrouped = {};
  pensyarahList.forEach(p => { if (!pGrouped[p.KodKursus]) pGrouped[p.KodKursus] = []; pGrouped[p.KodKursus].push(p); });
  kelasList.forEach(k => { if (!kGrouped[k.KodKursus]) kGrouped[k.KodKursus] = []; kGrouped[k.KodKursus].push(k); });

  const allKod = [...new Set([...Object.keys(pGrouped), ...Object.keys(kGrouped)])];

  const cards = allKod.map(kod => {
    const course = courseMasterList.find(c => c.KodKursus === kod);
    const pRows = (pGrouped[kod] || []).map(p => `
      <tr>
        <td>${esc(p.NamaPensyarah)}</td>
        <td><span class="tag tag-blue">Pensyarah</span></td>
        <td><button class="btn btn-red btn-sm" onclick="deletePItem('${esc(p.ID)}')">Delete</button></td>
      </tr>`).join('');
    const kRows = (kGrouped[kod] || []).map(k => `
      <tr>
        <td>${esc(k.NamaKelas)}</td>
        <td><span class="tag tag-green">Kelas</span></td>
        <td><button class="btn btn-red btn-sm" onclick="deleteKItem('${esc(k.ID)}')">Delete</button></td>
      </tr>`).join('');
    return `
    <div class="card">
      <div class="card-title"><span class="tag tag-blue">${esc(kod)}</span> ${course ? esc(course.NamaKursus) : ''}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
          <tbody>${pRows}${kRows}${!pRows && !kRows ? '<tr><td colspan="3" class="text-muted">Tiada rekod.</td></tr>' : ''}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  const courses = courseMasterList.map(c => `<option value="${esc(c.KodKursus)}">${esc(c.KodKursus)} — ${esc(c.NamaKursus)}</option>`).join('');

  return `
    <div class="page-title">Lecturers &amp; Classes</div>
    <div class="page-sub">Urus senarai pensyarah (Admin setup) dan kelas (Admin setup, Penyelaras boleh tambah) mengikut kod kursus.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openPKFormNew('pensyarah')">＋ Add Pensyarah</button>
      <button class="btn btn-outline" onclick="openPKFormNew('kelas')">＋ Add Kelas</button>
    </div>
    ${allKod.length === 0 ? `<div class="card">${emptyState('👨‍🏫', 'No records yet. Klik "+ Add Pensyarah" atau "+ Add Kelas" untuk mula.')}</div>` : cards}`;
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
  if (!kod || !nama) { toast('Sila isi semua maklumat.', 'error'); return; }
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
  if (!confirm('Delete pensyarah ini?')) return;
  try {
    const result = await apiPost('deletePensyarah', { id });
    if (result.success) { toast('Dipadam.', 'success'); await loadAllData(); showPage('pensyarah'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}

async function deleteKItem(id) {
  if (!confirm('Delete kelas ini?')) return;
  try {
    const result = await apiPost('deleteKelas', { id });
    if (result.success) { toast('Dipadam.', 'success'); await loadAllData(); showPage('pensyarah'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}

/* ===================================================================
   PDF ARCHIVE — Senarai semua PDF yang telah dijanakan
   =================================================================== */

function renderPDFArchivePage() {
  // Filter ikut akses pengguna
  const assignedKod = currentUser.KodKursus;
  let logs = pdfLogList.slice().reverse();
  if (currentUser.Peranan !== 'admin' && assignedKod) {
    logs = logs.filter(l => l.KodKursus === assignedKod);
  }

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
    // Only show latest per program (most recent generate)
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
    <div class="card">
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
    ${logs.length === 0
      ? `<div class="card">${emptyState('🗂️', 'No PDF reports generated yet. Generate a PDF from a fully verified CQI Report.')}</div>`
      : cards}`;
}
