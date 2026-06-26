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
let currentPage = 'dashboard';
let editingReportId = null;

// ===== API HELPER =====
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
  showPage('dashboard');
  await loadAllData();
}

// ===== DATA LOADING =====
async function loadAllData() {
  try {
    const [reportsRes, laporanRes, courseRes, programRes, pkRes] = await Promise.all([
      apiGet('getCQIReports'),
      apiGet('getLaporan'),
      apiGet('getCourseMaster'),
      apiGet('getProgramKursus'),
      apiGet('getPensyarahKelas'),
    ]);
    if (reportsRes.success) cqiReports = reportsRes.data;
    if (laporanRes.success) laporanList = laporanRes.data;
    if (courseRes.success) courseMasterList = courseRes.data;
    if (programRes.success) programKursusList = programRes.data;
    if (pkRes.success) pensyarahKelasList = pkRes.data;
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
  { sep: 'Menu Utama' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'reports', icon: '📝', label: 'Laporan CQI' },
  { id: 'perbandingan', icon: '🔄', label: 'Perbandingan Sesi' },
  { sep: 'Lain-lain' },
  { id: 'laporan', icon: '📄', label: 'Laporan & Minit' },
  { sep: 'Pentadbiran' },
  { id: 'kursus', icon: '🎓', label: 'Pengurusan Kursus', adminOnly: true },
  { id: 'pensyarah', icon: '👨‍🏫', label: 'Pensyarah & Kelas', adminOnly: true },
  { id: 'pengguna', icon: '👥', label: 'Pengguna', adminOnly: true },
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
  else if (id === 'kursus') main.innerHTML = renderKursusPage();
  else if (id === 'pensyarah') main.innerHTML = renderPensyarahPage();
  else if (id === 'pengguna') { main.innerHTML = renderPenggunaPage(); loadUsers().then(() => { if (currentPage === 'pengguna') main.innerHTML = renderPenggunaPage(); }); }
}

window.onload = () => { initAllSigCanvases(); };
/* ===================================================================
   PAPAN PEMUKA (DASHBOARD)
   =================================================================== */

function renderDashboard() {
  const totalReports = cqiReports.length;
  const fullySigned = cqiReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan').length;
  const pendingKetua = cqiReports.filter(r => r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan').length;
  const avgClo = computeAvgCloAll();

  const rows = cqiReports.slice().reverse().slice(0, 8).map(r => `
    <tr>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.NamaKursus)}</td>
      <td>${esc(r.Sesi)}</td>
      <td>${statusBadge(r)}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openReportDetail('${r.ID}')">Lihat</button></td>
    </tr>`).join('');

  return `
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Selamat datang, ${esc(currentUser.Nama)}. Ringkasan laporan CQI semasa.</div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Jumlah Laporan CQI</div><div class="stat-value">${totalReports}</div></div>
      <div class="stat-card"><div class="stat-label">Purata CLO Dicapai</div><div class="stat-value">${avgClo !== null ? avgClo + '%' : '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Laporan Lengkap Disahkan</div><div class="stat-value">${fullySigned}</div></div>
      <div class="stat-card"><div class="stat-label">Menunggu Ketua Kursus</div><div class="stat-value">${pendingKetua}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Laporan CQI Terkini</div>
      ${totalReports === 0 ? emptyState('📋', 'Belum ada laporan CQI. Mula tambah laporan baharu.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kod</th><th>Nama Kursus</th><th>Sesi</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

function computeAvgCloAll() {
  const allClo = [];
  cqiReports.forEach(r => {
    const clos = safeParseArr(r.CLOData);
    clos.forEach(c => { if (c.pct !== '' && c.pct !== undefined) allClo.push(parseFloat(c.pct) || 0); });
  });
  if (!allClo.length) return null;
  return Math.round(allClo.reduce((a, b) => a + b, 0) / allClo.length);
}

function statusBadge(r) {
  if (r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan') {
    return '<span class="tag tag-green">✓ Lengkap Disahkan</span>';
  }
  if (r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan') {
    return '<span class="tag tag-amber">⏳ Menunggu Ketua</span>';
  }
  return '<span class="tag tag-gray">📝 Draf</span>';
}

function emptyState(icon, msg) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div>${msg}</div></div>`;
}

/* ===================================================================
   SENARAI LAPORAN CQI
   =================================================================== */

function renderReportsPage() {
  const rows = cqiReports.map(r => `
    <tr>
      <td><span class="tag tag-blue">${esc(r.KodKursus)}</span></td>
      <td>${esc(r.NamaKursus)}</td>
      <td>${esc(r.Sesi)}</td>
      <td>${esc(r.BilPelajar)}</td>
      <td>${statusBadge(r)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openReportDetail('${r.ID}')">Lihat</button>
        <button class="btn btn-outline btn-sm" onclick="openReportForm('${r.ID}')">Edit</button>
        ${currentUser.Peranan === 'admin' ? `<button class="btn btn-red btn-sm" onclick="deleteReport('${r.ID}')">Padam</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="page-title">Laporan CQI</div>
    <div class="page-sub">Urus laporan Continuous Quality Improvement bagi setiap kursus.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openReportForm()">＋ Tambah Laporan CQI</button>
    </div>
    <div class="card">
      ${cqiReports.length === 0 ? emptyState('📝', 'Belum ada laporan CQI. Klik "Tambah Laporan CQI" untuk mula.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kod</th><th>Nama Kursus</th><th>Sesi</th><th>Pelajar</th><th>Status</th><th>Tindakan</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

/* ===================================================================
   PERBANDINGAN SESI
   =================================================================== */

function renderComparisonPage() {
  const options = cqiReports.map(r => `<option value="${r.ID}">${esc(r.KodKursus)} — ${esc(r.NamaKursus)} (${esc(r.Sesi)})</option>`).join('');
  return `
    <div class="page-title">Perbandingan Sesi</div>
    <div class="page-sub">Bandingkan pencapaian CLO &amp; PLO antara sesi semasa dan sesi lepas.</div>
    <div class="card">
      <div class="form-group">
        <label>Pilih Laporan</label>
        <select id="compare-select" onchange="renderComparisonResult()">
          <option value="">— Pilih Kursus —</option>
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
      <div class="stat-card"><div class="stat-label">Sesi Semasa</div><div class="stat-value" style="font-size:18px;">${esc(r.Sesi)}</div></div>
      <div class="stat-card"><div class="stat-label">Sesi Lepas</div><div class="stat-value" style="font-size:18px;">${esc(r.SesiLepas) || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">Bil. Pelajar</div><div class="stat-value">${esc(r.BilPelajar)}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Perbandingan CLO</div>
      ${clos.length ? cloBars : '<p class="text-muted text-sm">Tiada data CLO.</p>'}
      ${legendHTML()}
    </div>
    <div class="card">
      <div class="card-title">Perbandingan PLO</div>
      ${plos.length ? ploBars : '<p class="text-muted text-sm">Tiada data PLO.</p>'}
      ${legendHTML()}
    </div>
    <div class="card">
      <div class="card-title">Ulasan &amp; Cadangan</div>
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
      <div style="font-size:11px;color:var(--text-muted);margin:4px 0 2px;">Sesi lepas: ${p}%</div>
      <div style="height:20px;background:var(--bg2);border-radius:4px;"><div style="height:100%;width:${Math.min(p,100)}%;background:#B5D4F4;border-radius:4px;"></div></div>
    </div>`;
}

function legendHTML() {
  return `<div style="display:flex;gap:16px;margin-top:8px;font-size:12px;">
    <span><span style="display:inline-block;width:12px;height:12px;background:#378ADD;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Sesi semasa</span>
    <span><span style="display:inline-block;width:12px;height:12px;background:#B5D4F4;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Sesi lepas</span>
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
      <div class="modal-title">${existing ? '✏️ Kemaskini' : '📝 Tambah'} Laporan CQI</div>

      <!-- 1.0 MAKLUMAT KURSUS -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">1</span>Maklumat Kursus</div>
        <div class="form-grid mt-2">
          <div class="form-group">
            <label>Jabatan</label>
            <select id="f-jabatan" onchange="onJabatanChange()">
              <option value="">— Pilih Jabatan —</option>
              ${[...new Set(programKursusList.map(p => p.Jabatan))].map(j => `<option value="${esc(j)}" ${existing?.Jabatan === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Program</label>
            <select id="f-program" onchange="onProgramChange()">
              <option value="">— Pilih Jabatan dahulu —</option>
            </select>
          </div>
          <div class="form-group full">
            <label>Kod &amp; Nama Kursus</label>
            <select id="f-kod" onchange="onKursusChange()" style="margin-bottom:6px;">
              <option value="">— Pilih Program dahulu —</option>
            </select>
            <input type="hidden" id="f-nama" value="${esc(existing?.NamaKursus)}">
            <div class="form-hint" id="kursus-hint"></div>
          </div>
          <div class="form-group"><label>Sesi Semasa</label><input id="f-sesi" value="${esc(existing?.Sesi)}" placeholder="cth: 2:2025/2026"></div>
          <div class="form-group"><label>Sesi Lepas</label><input id="f-sesi-lepas" value="${esc(existing?.SesiLepas)}" placeholder="cth: 1:2025/2026"></div>
          <div class="form-group"><label>1.4 Bilangan Pelajar</label><input type="number" id="f-pelajar" value="${esc(existing?.BilPelajar)}"></div>
        </div>
        <div class="mt-2">
          <div class="flex items-center justify-between"><b class="text-sm">1.2/1.3 Kelas &amp; Pensyarah</b><button class="btn btn-outline btn-sm" type="button" onclick="addLecturerRow()">+ Tambah</button></div>
          <div class="repeat-header" style="grid-template-columns:1fr 1fr 40px;" class="mt-1"><span>Nama Kelas</span><span>Nama Pensyarah</span><span></span></div>
          <div id="lecturer-rows"></div>
          <p class="form-hint mt-1">Pilih dari senarai atau taip sendiri jika nama/kelas tidak ada dalam senarai.</p>
        </div>
      </div>

      <div class="alert alert-info" id="no-course-warning" style="display:none;">⚠️ Belum ada kursus disetup oleh Admin. Sila hubungi Pentadbir untuk menambah kursus &amp; CLO/PLO terlebih dahulu di "Pengurusan Kursus".</div>

      <!-- 2.0 MINIT PERBINCANGAN -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">2</span>Minit Perbincangan</div>
        <div class="form-grid mt-2">
          <div class="form-group"><label>2.1 Kehadiran</label><input id="f-minit-kehadiran" value="${esc(existing?.MinitKehadiran)}" placeholder="cth: 5/6 ahli"></div>
          <div class="form-group"><label>2.2 Tarikh</label><input type="date" id="f-minit-tarikh" value="${esc(existing?.MinitTarikh)}"></div>
          <div class="form-group"><label>2.3 Masa</label><input type="time" id="f-minit-masa" value="${esc(existing?.MinitMasa)}"></div>
          <div class="form-group"><label>2.4 Tempat</label><input id="f-minit-tempat" value="${esc(existing?.MinitTempat)}"></div>
        </div>
      </div>

      <!-- 3.0 ISU CLO & PLO -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">3</span>Isu / Masalah CLO &amp; PLO</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>3.1 Isu CLO</label><textarea id="f-isu-clo" style="min-height:50px;">${esc(existing?.IsuCLO)}</textarea></div>
          <div class="form-group full"><label>3.2 Isu PLO</label><textarea id="f-isu-plo" style="min-height:50px;">${esc(existing?.IsuPLO)}</textarea></div>
        </div>
      </div>

      <!-- 4.0 PROGRAM/AKTIVITI CQI -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">4</span>Program / Aktiviti / Tugasan CQI</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>4.1 Nama Aktiviti / Program</label><input id="f-akt-nama" value="${esc(existing?.AktivitiNama)}"></div>
          <div class="form-group"><label>4.2 Tarikh Pelaksanaan</label><input type="date" id="f-akt-tarikh" value="${esc(existing?.AktivitiTarikh)}"></div>
          <div class="form-group"><label>4.3 Bilangan Pelajar</label><input type="number" id="f-akt-pelajar" value="${esc(existing?.AktivitiBilPelajar)}"></div>
          <div class="form-group full"><label>4.4 Objektif</label><textarea id="f-akt-objektif" style="min-height:50px;">${esc(existing?.AktivitiObjektif)}</textarea></div>
          <div class="form-group full"><label>4.5 Ringkasan Aktiviti</label><textarea id="f-akt-ringkasan" style="min-height:60px;">${esc(existing?.AktivitiRingkasan)}</textarea></div>
        </div>
      </div>

      <!-- 5.0 PENCAPAIAN PELAJAR -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">5</span>Pencapaian Pelajar</div>

        <div class="mt-2"><b class="text-sm">5.1 Gred Pelajar (% pelajar)</b>
          <div class="table-wrap mt-1">
            <table style="font-size:11px;">
              <thead><tr>${['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'].map(g=>`<th>${g}</th>`).join('')}</tr></thead>
              <tbody><tr id="grade-row-inputs">${['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'].map(g => {
                const gd = safeParseObj(existing?.GredData);
                return `<td><input type="number" step="0.1" data-grade="${g}" value="${esc(gd[g] || '')}" style="width:48px;padding:4px;font-size:11px;"></td>`;
              }).join('')}</tr></tbody>
            </table>
          </div>
        </div>

        <div class="mt-2"><b class="text-sm">5.2 Quality Objectives</b>
          <div class="form-grid mt-1">
            <div class="form-group">
              <label>≥90% pelajar capai gred D ke atas?</label>
              <select id="f-qo1-capai"><option value="Ya" ${existing?.QualityObj1Capai==='Ya'?'selected':''}>Ya</option><option value="Tidak" ${existing?.QualityObj1Capai==='Tidak'?'selected':''}>Tidak</option></select>
            </div>
            <div class="form-group">
              <label>Tindakan Pencegahan/Pembetulan</label>
              <input id="f-qo1-tindakan" value="${esc(existing?.QualityObj1Tindakan)}">
            </div>
            <div class="form-group">
              <label>≥25% pelajar capai gred B ke atas?</label>
              <select id="f-qo2-capai"><option value="Ya" ${existing?.QualityObj2Capai==='Ya'?'selected':''}>Ya</option><option value="Tidak" ${existing?.QualityObj2Capai==='Tidak'?'selected':''}>Tidak</option></select>
            </div>
            <div class="form-group">
              <label>Tindakan Pencegahan/Pembetulan</label>
              <input id="f-qo2-tindakan" value="${esc(existing?.QualityObj2Tindakan)}">
            </div>
          </div>
        </div>

        <div class="mt-2">
          <b class="text-sm">5.3 Course Learning Outcome (CLO)</b>
          <div class="repeat-header" style="grid-template-columns:70px 1.8fr 1fr 1fr 1fr;" id="clo-header-row"><span>CLO</span><span>Deskripsi</span><span>% Semasa</span><span>% Lepas</span><span>% Beza</span></div>
          <div id="clo-rows"></div>
          <div class="text-sm text-muted mt-1" id="clo-empty-msg">Pilih kursus dahulu untuk papar CLO.</div>
        </div>

        <div class="mt-2">
          <b class="text-sm">5.4 Programme Learning Outcome (PLO)</b>
          <div class="repeat-header" style="grid-template-columns:70px 1.8fr 1fr 1fr 1fr;" id="plo-header-row"><span>PLO</span><span>Deskripsi</span><span>% Semasa</span><span>% Lepas</span><span>% Beza</span></div>
          <div id="plo-rows"></div>
          <div class="text-sm text-muted mt-1" id="plo-empty-msg">Pilih Jabatan, Program &amp; kursus dahulu untuk papar PLO.</div>
        </div>
      </div>

      <!-- 6.0 ULASAN -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">6</span>Ulasan &amp; Cadangan</div>
        <div class="form-grid mt-2">
          <div class="form-group full"><label>6.1 Ulasan</label><textarea id="f-ulasan" style="min-height:60px;">${esc(existing?.Ulasan)}</textarea></div>
          <div class="form-group full"><label>6.2 Cadangan</label><textarea id="f-cadangan" style="min-height:60px;">${esc(existing?.Cadangan)}</textarea></div>
        </div>
      </div>


      <!-- 7.0 LAMPIRAN -->
      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">7</span>Lampiran</div>
        <div class="form-grid mt-2">
          <div class="form-group">
            <label>7.1 Minit Perbincangan</label>
            <div class="file-drop ${existing?.LampiranMinitURL ? 'has-file' : ''}" id="drop-minit" onclick="document.getElementById('file-minit').click()">
              <input type="file" id="file-minit" class="hidden" accept=".pdf,.png,.jpg,.jpeg" onchange="handleFileSelect(this,'minit')">
              <div id="drop-minit-label">${existing?.LampiranMinitURL ? '📎 Fail sedia ada — klik untuk tukar' : '📎 Klik untuk pilih fail (PDF/Gambar)'}</div>
            </div>
            ${existing?.LampiranMinitURL ? `<div class="file-item"><a href="${esc(existing.LampiranMinitURL)}" target="_blank" class="file-link">Lihat fail sedia ada ↗</a></div>` : ''}
          </div>
          <div class="form-group">
            <label>7.2 Laporan Aktiviti / Program CQI</label>
            <div class="file-drop ${existing?.LampiranAktivitiURL ? 'has-file' : ''}" id="drop-aktiviti" onclick="document.getElementById('file-aktiviti').click()">
              <input type="file" id="file-aktiviti" class="hidden" accept=".pdf,.png,.jpg,.jpeg" onchange="handleFileSelect(this,'aktiviti')">
              <div id="drop-aktiviti-label">${existing?.LampiranAktivitiURL ? '📎 Fail sedia ada — klik untuk tukar' : '📎 Klik untuk pilih fail (PDF/Gambar)'}</div>
            </div>
            ${existing?.LampiranAktivitiURL ? `<div class="file-item"><a href="${esc(existing.LampiranAktivitiURL)}" target="_blank" class="file-link">Lihat fail sedia ada ↗</a></div>` : ''}
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeReportModal()">Batal</button>
        <button class="btn btn-blue" id="btn-save-report" onclick="saveReportForm()">Simpan Laporan</button>
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
}

function closeReportModal() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ===== CASCADING DROPDOWN: Jabatan -> Program -> Kursus -> CLO/PLO ===== */

function populateProgramDropdown(selectedJabatan, selectedProgram) {
  const sel = document.getElementById('f-program');
  const jabatan = selectedJabatan || document.getElementById('f-jabatan').value;
  if (!jabatan) { sel.innerHTML = '<option value="">— Pilih Jabatan dahulu —</option>'; return; }
  const programs = [...new Set(programKursusList.filter(p => p.Jabatan === jabatan).map(p => p.Program))];
  sel.innerHTML = '<option value="">— Pilih Program —</option>' + programs.map(p => `<option value="${esc(p)}" ${p === selectedProgram ? 'selected' : ''}>${esc(p)}</option>`).join('');
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
  if (!jabatan || !program) { sel.innerHTML = '<option value="">— Pilih Program dahulu —</option>'; return; }
  const links = programKursusList.filter(p => p.Jabatan === jabatan && p.Program === program);
  if (!links.length) { sel.innerHTML = '<option value="">— Tiada kursus dikaitkan dengan program ini —</option>'; return; }
  sel.innerHTML = '<option value="">— Pilih Kursus —</option>' + links.map(l => {
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

  if (!kod) { clearOutcomeRows(); hintEl.textContent = ''; return; }

  const course = courseMasterList.find(c => c.KodKursus === kod);
  const link = programKursusList.find(p => p.Jabatan === jabatan && p.Program === program && p.KodKursus === kod);

  document.getElementById('f-nama').value = course ? course.NamaKursus : '';
  hintEl.textContent = course ? `Nama Kursus: ${course.NamaKursus}` : '';

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
}

function refreshLecturerDatalist(kod) {
  const kelasList = [...new Set(pensyarahKelasList.filter(p => p.KodKursus === kod).map(p => p.NamaKelas))];
  const pensyarahList = [...new Set(pensyarahKelasList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah))];

  // Kemaskini semua datalist dalam baris lecturer yang sedia ada
  document.querySelectorAll('#lecturer-rows .repeat-row').forEach(row => {
    const kelasInput = row.querySelector('.lec-kelas');
    const pensyarahInput = row.querySelector('.lec-pensyarah');
    if (kelasInput) {
      const kelasListId = kelasInput.getAttribute('list');
      const dl = document.getElementById(kelasListId);
      if (dl) dl.innerHTML = kelasList.map(k => `<option value="${esc(k)}">`).join('');
    }
    if (pensyarahInput) {
      const pensyarahListId = pensyarahInput.getAttribute('list');
      const dl = document.getElementById(pensyarahListId);
      if (dl) dl.innerHTML = pensyarahList.map(p => `<option value="${esc(p)}">`).join('');
    }
  });
}

function clearOutcomeRows() {
  document.getElementById('clo-rows').innerHTML = '';
  document.getElementById('plo-rows').innerHTML = '';
  document.getElementById('clo-empty-msg').style.display = 'block';
  document.getElementById('plo-empty-msg').style.display = 'block';
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
    row.style.gridTemplateColumns = '70px 1.8fr 1fr 1fr 1fr';
    row.innerHTML = `
      <input type="text" class="oc-id" value="${esc(d.id)}" readonly style="background:#F1EFE8;">
      <input type="text" class="oc-desc" value="${esc(d.desc)}" readonly style="background:#F1EFE8;">
      <input type="number" class="oc-pct" value="${esc(d.pct)}" step="0.1" placeholder="%" oninput="updateOcDiff(this)">
      <input type="number" class="oc-pct-lepas" value="${esc(d.pctLepas)}" step="0.1" placeholder="%" oninput="updateOcDiff(this)">
      <span class="oc-diff text-sm" style="text-align:center;color:var(--text-muted);">—</span>`;
    wrap.appendChild(row);
    updateOcDiff(row.querySelector('.oc-pct'));
  });
}

function addLecturerRow(val) {
  const wrap = document.getElementById('lecturer-rows');
  const kod = document.getElementById('f-kod')?.value || '';
  // Get unique kelas and pensyarah for this kursus
  const kelasList = [...new Set(pensyarahKelasList.filter(p => p.KodKursus === kod).map(p => p.NamaKelas))];
  const pensyarahList = [...new Set(pensyarahKelasList.filter(p => p.KodKursus === kod).map(p => p.NamaPensyarah))];
  const uid = Date.now() + Math.floor(Math.random() * 1000);
  // val can be object {kelas, pensyarah} or string (legacy)
  const kelas = (val && typeof val === 'object') ? (val.kelas || '') : '';
  const pensyarah = (val && typeof val === 'object') ? (val.pensyarah || '') : (typeof val === 'string' ? val : '');

  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.style.gridTemplateColumns = '1fr 1fr 40px';
  row.innerHTML = `
    <div>
      <input type="text" class="lec-kelas" value="${esc(kelas)}" placeholder="Taip atau pilih kelas" list="kelas-list-${uid}" autocomplete="off">
      <datalist id="kelas-list-${uid}">${kelasList.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
    </div>
    <div>
      <input type="text" class="lec-pensyarah" value="${esc(pensyarah)}" placeholder="Taip atau pilih nama pensyarah" list="pensyarah-list-${uid}" autocomplete="off">
      <datalist id="pensyarah-list-${uid}">${pensyarahList.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    </div>
    <button class="btn btn-red btn-sm" type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
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
  document.querySelectorAll('#grade-row-inputs input[data-grade]').forEach(inp => {
    data[inp.dataset.grade] = inp.value || '';
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
            jenisLampiran: kind === 'minit' ? 'Minit Perbincangan' : 'Laporan Aktiviti',
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
      MinitKehadiran: document.getElementById('f-minit-kehadiran').value,
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
    btn.innerHTML = 'Simpan Laporan';
  }
}

async function deleteReport(id) {
  if (!confirm('Padam laporan CQI ini? Tindakan ini tidak boleh dibatalkan.')) return;
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
  const grades = safeParseObj(r.GredData);

  const canPenyelarasSign = (currentUser.Peranan === 'penyelaras' || currentUser.Peranan === 'admin') && r.StatusPenyelaras !== 'Disahkan';
  const canKetuaSign = (currentUser.Peranan === 'ketua' || currentUser.Peranan === 'admin') && r.StatusPenyelaras === 'Disahkan' && r.StatusKetua !== 'Disahkan';

  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open" id="modal-detail">
    <div class="modal" style="max-width:820px;">
      <div class="modal-title">${esc(r.KodKursus)} — ${esc(r.NamaKursus)}</div>
      <div class="text-sm text-muted mt-1" style="margin-bottom:1rem;">Sesi: ${esc(r.Sesi)} ${statusBadge(r)}</div>

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">1</span>Maklumat Kursus</div>
        <table style="font-size:13px;margin-top:8px;">
          <tr><td class="text-muted" style="width:160px;">Program</td><td>${esc(r.Program)}</td></tr>
          <tr><td class="text-muted">Bil. Pelajar</td><td>${esc(r.BilPelajar)}</td></tr>
          <tr><td class="text-muted">Kelas &amp; Pensyarah</td><td>${lecturers.map(l => typeof l === 'object' ? `${esc(l.kelas)} — ${esc(l.pensyarah)}` : esc(l)).join('<br>') || '—'}</td></tr>
        </table>
      </div>

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">5</span>Pencapaian CLO</div>
        ${clos.length ? clos.map(c => `<div class="text-sm" style="margin-bottom:6px;"><b>${esc(c.id)}</b> — ${esc(c.desc)}: ${esc(c.pct)}% (lepas: ${esc(c.pctLepas)}%)</div>`).join('') : '<p class="text-sm text-muted">Tiada data.</p>'}
      </div>

      <div class="section-block">
        <div class="card-title mb-0"><span class="card-num">7</span>Lampiran</div>
        <div class="text-sm">
          ${r.LampiranMinitURL ? `<div class="file-item">Minit Perbincangan: <a href="${esc(r.LampiranMinitURL)}" target="_blank" class="file-link">Lihat fail ↗</a></div>` : '<div class="text-muted">Minit Perbincangan: tiada</div>'}
          ${r.LampiranAktivitiURL ? `<div class="file-item">Laporan Aktiviti: <a href="${esc(r.LampiranAktivitiURL)}" target="_blank" class="file-link">Lihat fail ↗</a></div>` : '<div class="text-muted">Laporan Aktiviti: tiada</div>'}
        </div>
      </div>

      <div class="section-block">
        <div class="card-title mb-0">Pengesahan</div>
        <div class="form-grid mt-2">
          <div>
            <b class="text-sm">Disediakan oleh (Penyelaras Kursus)</b>
            <div class="text-sm text-muted mt-1">${r.StatusPenyelaras === 'Disahkan' ? `✓ ${esc(r.SignedByPenyelaras)} — ${fmtDate(r.TarikhPenyelaras)}` : 'Belum disahkan'}</div>
            ${r.SigPenyelarasData ? `<img src="${r.SigPenyelarasData}" style="max-width:180px;border:1px solid var(--border);border-radius:6px;margin-top:6px;">` : ''}
          </div>
          <div>
            <b class="text-sm">Disahkan oleh (Ketua Kursus)</b>
            <div class="text-sm text-muted mt-1">${r.StatusKetua === 'Disahkan' ? `✓ ${esc(r.SignedByKetua)} — ${fmtDate(r.TarikhKetua)}` : 'Belum disahkan'}</div>
            ${r.SigKetuaData ? `<img src="${r.SigKetuaData}" style="max-width:180px;border:1px solid var(--border);border-radius:6px;margin-top:6px;">` : ''}
            ${r.KomenKetua ? `<div class="text-sm mt-1"><b>Komen:</b> ${esc(r.KomenKetua)}</div>` : ''}
          </div>
        </div>

        ${canPenyelarasSign ? signaturePadHTML('penyelaras', r.ID) : ''}
        ${canKetuaSign ? signaturePadHTML('ketua', r.ID) : ''}
        ${!canPenyelarasSign && !canKetuaSign && r.StatusKetua !== 'Disahkan' && r.StatusPenyelaras !== 'Disahkan' ? '<p class="text-sm text-muted mt-2">Penyelaras kursus perlu mengesahkan laporan ini dahulu.</p>' : ''}
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Tutup</button>
        ${r.StatusPenyelaras === 'Disahkan' && r.StatusKetua === 'Disahkan' ? `<button class="btn btn-blue" onclick="generateReportPDF('${r.ID}')">🖨️ Jana PDF</button>` : `<button class="btn btn-outline" disabled title="Perlu kedua-dua tandatangan">🖨️ Jana PDF (perlu pengesahan)</button>`}
      </div>
    </div>
  </div>`;

  if (canPenyelarasSign) initSigCanvas('sig-canvas-penyelaras');
  if (canKetuaSign) initSigCanvas('sig-canvas-ketua');
}

function signaturePadHTML(role, reportId) {
  const label = role === 'penyelaras' ? 'Tandatangan Penyelaras Kursus' : 'Tandatangan Ketua Kursus';
  return `
    <div class="mt-2" style="border-top:1px solid var(--border);padding-top:12px;">
      <b class="text-sm">${label}</b>
      <div class="sig-wrap mt-1">
        <canvas class="sig-canvas" id="sig-canvas-${role}" width="460" height="140"></canvas>
        <div class="sig-hint" id="sig-hint-${role}">Lukis tandatangan di sini</div>
      </div>
      <div class="sig-actions">
        <button class="btn btn-outline btn-sm" type="button" onclick="clearSigCanvas('${role}')">Padam</button>
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
  if (!state || !state.hasSig) { toast('Sila lukis tandatangan dahulu.', 'error'); return; }
  const canvas = document.getElementById(canvasId);
  const sigData = canvas.toDataURL('image/png');
  const komen = role === 'ketua' ? (document.getElementById('komen-ketua')?.value || '') : '';

  try {
    const result = await apiPost('signReport', { id: reportId, role, signerName: currentUser.Nama, sigData, komen });
    if (result.success) {
      toast('Tandatangan berjaya disimpan.', 'success');
      await loadAllData();
      openReportDetail(reportId);
    } else {
      toast(result.message || 'Gagal menyimpan tandatangan.', 'error');
    }
  } catch (err) {
    toast('Ralat: ' + err.message, 'error');
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

  // 1.0 Maklumat Kursus
  sectionTitle('1', 'Maklumat Kursus');
  fieldRow('Program:', r.Program);
  fieldRow('Kod & Nama Kursus:', r.KodKursus + ' — ' + r.NamaKursus);
  const lecturers = safeParseArr(r.Pensyarah);
  fieldRow('Kelas & Pensyarah:', lecturers.map(l => typeof l === 'object' ? `${l.kelas} — ${l.pensyarah}` : l).join('; ') || '—');
  fieldRow('Bilangan Pelajar:', r.BilPelajar);
  y += 2;

  // 2.0 Minit Perbincangan
  sectionTitle('2', 'Minit Perbincangan');
  fieldRow('Kehadiran:', r.MinitKehadiran);
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
  sectionTitle('4', 'Program / Aktiviti / Tugasan CQI');
  fieldRow('Nama Aktiviti:', r.AktivitiNama);
  fieldRow('Tarikh Pelaksanaan:', r.AktivitiTarikh);
  fieldRow('Bilangan Pelajar:', r.AktivitiBilPelajar);
  fieldRow('Objektif:', r.AktivitiObjektif, W - 2 * margin - 30);
  fieldRow('Ringkasan:', r.AktivitiRingkasan, W - 2 * margin - 30);
  y += 2;

  // 5.0 Pencapaian Pelajar
  sectionTitle('5', 'Pencapaian Pelajar');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.1 Gred Pelajar (%)', margin, y); y += 5;
  const grades = safeParseObj(r.GredData);
  const gradeKeys = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','E','E-','F'];
  checkPageBreak(14);
  doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, 8, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  const colW = (W - 2 * margin) / gradeKeys.length;
  gradeKeys.forEach((g, i) => doc.text(g, margin + i * colW + 1, y));
  y += 5;
  doc.setFont('helvetica', 'normal');
  gradeKeys.forEach((g, i) => doc.text(String(grades[g] || '0'), margin + i * colW + 1, y));
  y += 9;

  checkPageBreak(14);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.2 Quality Objectives', margin, y); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('• ≥90% pelajar capai gred D ke atas: ' + (r.QualityObj1Capai || '—') + (r.QualityObj1Tindakan ? ' (' + r.QualityObj1Tindakan + ')' : ''), margin, y); y += 5;
  doc.text('• ≥25% pelajar capai gred B ke atas: ' + (r.QualityObj2Capai || '—') + (r.QualityObj2Tindakan ? ' (' + r.QualityObj2Tindakan + ')' : ''), margin, y); y += 7;

  const clos = safeParseArr(r.CLOData);
  if (clos.length) {
    checkPageBreak(10 + clos.length * 6);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.3 Course Learning Outcome (CLO)', margin, y); y += 5;
    doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('CLO', margin + 1, y); doc.text('Deskripsi', margin + 18, y);
    doc.text('% Semasa', margin + 110, y); doc.text('% Lepas', margin + 135, y); doc.text('Capai', margin + 160, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    clos.forEach(c => {
      checkPageBreak(6);
      doc.text(String(c.id || ''), margin + 1, y);
      doc.text(String(c.desc || '').substring(0, 55), margin + 18, y);
      doc.text(String(c.pct || '0') + '%', margin + 110, y);
      doc.text(String(c.pctLepas || '0') + '%', margin + 135, y);
      doc.text(String(c.capai || ''), margin + 160, y);
      y += 6;
    });
    y += 2;
  }

  const plos = safeParseArr(r.PLOData);
  if (plos.length) {
    checkPageBreak(10 + plos.length * 6);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('5.4 Programme Learning Outcome (PLO)', margin, y); y += 5;
    doc.setFillColor(248, 249, 250); doc.rect(margin, y - 4, W - 2 * margin, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('PLO', margin + 1, y); doc.text('Deskripsi', margin + 18, y);
    doc.text('% Semasa', margin + 110, y); doc.text('% Lepas', margin + 135, y); doc.text('Capai', margin + 160, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    plos.forEach(p => {
      checkPageBreak(6);
      doc.text(String(p.id || ''), margin + 1, y);
      doc.text(String(p.desc || '').substring(0, 55), margin + 18, y);
      doc.text(String(p.pct || '0') + '%', margin + 110, y);
      doc.text(String(p.pctLepas || '0') + '%', margin + 135, y);
      doc.text(String(p.capai || ''), margin + 160, y);
      y += 6;
    });
    y += 2;
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
    doc.textWithLink('📎 Minit Perbincangan (klik untuk buka)', margin, y, { url: r.LampiranMinitURL });
    y += 6;
  } else { doc.setTextColor(120,120,120); doc.text('Minit Perbincangan: tiada lampiran', margin, y); y += 6; doc.setTextColor(24,95,165); }
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

  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('Disediakan oleh (Penyelaras Kursus)', leftX, sigY);
  doc.text('Disahkan oleh (Ketua Kursus)', rightX, sigY);
  y = sigY + 5;

  if (r.SigPenyelarasData) { try { doc.addImage(r.SigPenyelarasData, 'PNG', leftX, y, 55, 22); } catch (e) {} }
  if (r.SigKetuaData) { try { doc.addImage(r.SigKetuaData, 'PNG', rightX, y, 55, 22); } catch (e) {} }
  y += 25;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Nama: ' + (r.SignedByPenyelaras || '___________________'), leftX, y);
  doc.text('Nama: ' + (r.SignedByKetua || '___________________'), rightX, y);
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
  doc.text('i-rCQI — Dijana pada: ' + new Date().toLocaleString('ms-MY') + ' | Sulit', margin, 292);

  doc.save(`CQI_${r.KodKursus}_${(r.Sesi||'').replace(/[\/\s]/g,'-')}.pdf`);

  apiPost('logPDF', { data: { KodKursus: r.KodKursus, Sesi: r.Sesi, JanaOleh: currentUser.Nama } }).catch(() => {});
  toast('PDF berjaya dijana.', 'success');
}
/* ===================================================================
   LAPORAN & MINIT MESYUARAT (modul berasingan, bukan laporan CQI rasmi)
   =================================================================== */

function renderLaporanPage() {
  const rows = laporanList.slice().reverse().map(l => `
    <tr>
      <td>${fmtDate(l.Tarikh)}</td>
      <td>${esc(l.Tajuk)}</td>
      <td><span class="tag tag-blue">${esc(l.Jenis)}</span></td>
      <td>${esc(l.Oleh)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="viewLaporanItem('${l.ID}')">Lihat</button>
        ${currentUser.Peranan === 'admin' ? `<button class="btn btn-red btn-sm" onclick="deleteLaporanItem('${l.ID}')">Padam</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="page-title">Laporan &amp; Minit Mesyuarat</div>
    <div class="page-sub">Rekod laporan tambahan dan minit mesyuarat di luar laporan CQI rasmi.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openLaporanForm()">＋ Tambah Laporan / Minit</button>
    </div>
    <div class="card">
      ${laporanList.length === 0 ? emptyState('📄', 'Belum ada laporan atau minit mesyuarat.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tarikh</th><th>Tajuk</th><th>Jenis</th><th>Oleh</th><th>Tindakan</th></tr></thead>
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
      <div class="modal-title">📄 Tambah Laporan / Minit</div>
      <div class="form-group"><label>Tajuk</label><input id="l-tajuk" placeholder="cth: Minit Mesyuarat CQI Sem 2"></div>
      <div class="form-group">
        <label>Jenis</label>
        <select id="l-jenis">
          <option>Minit Mesyuarat</option>
          <option>Laporan Tambahan</option>
          <option>Lain-lain</option>
        </select>
      </div>
      <div class="form-group"><label>Kandungan</label><textarea id="l-kandungan" style="min-height:140px;"></textarea></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Batal</button>
        <button class="btn btn-blue" id="btn-save-laporan" onclick="saveLaporanItem()">Simpan</button>
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
      data: { Tajuk: tajuk, Jenis: document.getElementById('l-jenis').value, Kandungan: document.getElementById('l-kandungan').value, Oleh: currentUser.Nama }
    });
    if (result.success) {
      toast('Laporan disimpan.', 'success');
      closeDetailModal();
      await loadAllData();
      showPage('laporan');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Simpan'; }
}

function viewLaporanItem(id) {
  const l = laporanList.find(x => x.ID === id);
  if (!l) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">${esc(l.Tajuk)}</div>
      <div class="text-sm text-muted mt-1" style="margin-bottom:1rem;">${esc(l.Jenis)} • ${fmtDate(l.Tarikh)} • ${esc(l.Oleh)}</div>
      <div class="text-sm" style="white-space:pre-wrap;background:var(--bg2);padding:1rem;border-radius:8px;line-height:1.7;">${esc(l.Kandungan) || '(Tiada kandungan)'}</div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="closeDetailModal()">Tutup</button></div>
    </div>
  </div>`;
}

async function deleteLaporanItem(id) {
  if (!confirm('Padam item ini?')) return;
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
      <td><button class="btn btn-red btn-sm" onclick="deleteUserItem('${u.IC}')">Padam</button></td>
    </tr>`).join('');

  return `
    <div class="page-title">Pengurusan Pengguna</div>
    <div class="page-sub">Tambah atau urus pengguna sistem i-rCQI.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openUserForm()">＋ Tambah Pengguna</button>
    </div>
    <div class="card">
      ${usersList.length === 0 ? emptyState('👥', 'Belum ada pengguna.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>No. Staf</th><th>Nama</th><th>Peranan</th><th>Tindakan</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

function roleLabel(role) {
  return role === 'admin' ? 'Pentadbir' : role === 'ketua' ? 'Ketua Kursus' : 'Penyelaras Kursus';
}

function openUserForm() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">👤 Tambah Pengguna</div>
      <div class="form-group"><label>No. Staf</label><input id="u-ic" maxlength="20" placeholder="cth: STF12345" style="text-transform:uppercase;"></div>
      <div class="form-group"><label>Nama Penuh</label><input id="u-nama"></div>
      <div class="form-group">
        <label>Peranan</label>
        <select id="u-role">
          <option value="penyelaras">Penyelaras Kursus</option>
          <option value="ketua">Ketua Kursus</option>
          <option value="admin">Pentadbir</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Batal</button>
        <button class="btn btn-blue" id="btn-save-user" onclick="saveUserItem()">Tambah</button>
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
  finally { btn.disabled = false; btn.innerHTML = 'Tambah'; }
}

async function deleteUserItem(ic) {
  if (!confirm('Padam pengguna ini?')) return;
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
      <td>${linkedPrograms.length} program dikaitkan</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openCourseMasterForm('${esc(c.KodKursus)}')">Edit CLO</button>
        <button class="btn btn-outline btn-sm" onclick="openProgramLinkPanel('${esc(c.KodKursus)}')">Urus Program/PLO</button>
        <button class="btn btn-red btn-sm" onclick="deleteCourseMasterItem('${esc(c.KodKursus)}')">Padam</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="page-title">Pengurusan Kursus</div>
    <div class="page-sub">Setup kod kursus, CLO (tetap untuk semua program), dan kaitkan dengan Jabatan/Program berserta PLO masing-masing.</div>
    <div class="alert alert-info">💡 Setup ini hanya perlu dibuat <b>sekali</b> untuk setiap kursus. Penyelaras kursus tidak perlu menaip semula CLO/PLO — ia akan terpapar automatik bila mereka pilih kursus dalam borang Laporan CQI.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openCourseMasterForm()">＋ Tambah Kursus Baharu</button>
    </div>
    <div class="card">
      ${courseMasterList.length === 0 ? emptyState('🎓', 'Belum ada kursus disetup. Klik "Tambah Kursus Baharu" untuk mula.') : `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Kod Kursus</th><th>Nama Kursus</th><th>CLO</th><th>Pautan Program</th><th>Tindakan</th></tr></thead>
          <tbody>${courseRows}</tbody>
        </table>
      </div>`}
    </div>`;
}

/* ===== CourseMaster: Kod Kursus + Nama + CLO ===== */

function openCourseMasterForm(kodKursus) {
  const existing = kodKursus ? courseMasterList.find(c => c.KodKursus === kodKursus) : null;
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal">
      <div class="modal-title">${existing ? '✏️ Edit' : '＋ Tambah'} Kursus &amp; CLO</div>
      <div class="form-grid">
        <div class="form-group"><label>Kod Kursus</label><input id="cm-kod" value="${esc(existing?.KodKursus)}" placeholder="cth: DBS10042" ${existing ? 'readonly style="background:#F1EFE8;"' : ''}></div>
        <div class="form-group"><label>Nama Kursus</label><input id="cm-nama" value="${esc(existing?.NamaKursus)}"></div>
      </div>
      <div class="mt-2">
        <div class="flex items-center justify-between"><b class="text-sm">Course Learning Outcome (CLO)</b><button class="btn btn-outline btn-sm" type="button" onclick="addCmCloRow()">+ Tambah CLO</button></div>
        <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;" class="mt-1"><span>CLO</span><span>Deskripsi</span><span></span></div>
        <div id="cm-clo-rows"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Batal</button>
        <button class="btn btn-blue" id="btn-save-cm" onclick="saveCourseMasterItem(${existing ? 'true' : 'false'})">Simpan</button>
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
    <input type="text" class="cm-clo-desc" value="${esc(d.desc)}" placeholder="Deskripsi CLO">
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

  const btn = document.getElementById('btn-save-cm');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('saveCourseMaster', { data: { KodKursus: kod, NamaKursus: nama, CLOList: JSON.stringify(clos) } });
    if (result.success) {
      toast('Kursus berjaya disimpan.', 'success');
      closeDetailModal();
      await loadAllData();
      showPage('kursus');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Simpan'; }
}

async function deleteCourseMasterItem(kod) {
  const linked = programKursusList.filter(p => p.KodKursus === kod);
  const warnMsg = linked.length
    ? `Kursus ini dikaitkan dengan ${linked.length} program. Memadam akan turut memadam semua pautan program berkenaan. Teruskan?`
    : 'Padam kursus ini daripada senarai induk?';
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
        <button class="btn btn-outline" onclick="closeDetailModal()">Tutup</button>
      </div>
    </div>
  </div>`;
}

function renderProgramLinksList(links) {
  if (!links.length) return '<p class="text-sm text-muted">Belum ada program dikaitkan dengan kursus ini.</p>';
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
        <label>Jabatan</label>
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
        <div class="flex items-center justify-between mt-1"><b class="text-sm">PLO</b><button class="btn btn-outline btn-sm" type="button" onclick="addPlRow()">+ Tambah PLO</button></div>
        <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;"><span>PLO</span><span>Deskripsi</span><span></span></div>
        <div id="pl-plo-rows"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-add-link').remove()">Batal</button>
        <button class="btn btn-blue" id="btn-save-link" onclick="saveProgramLink('${esc(kodKursus)}')">Simpan</button>
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
    <input type="text" class="pl-plo-desc" value="${esc(d.desc)}" placeholder="Deskripsi PLO">
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
  finally { btn.disabled = false; btn.innerHTML = 'Simpan'; }
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
      <div class="flex items-center justify-between"><b class="text-sm">PLO</b><button class="btn btn-outline btn-sm" type="button" onclick="addEditPlRow()">+ Tambah PLO</button></div>
      <div class="repeat-header" style="grid-template-columns:80px 1fr 40px;"><span>PLO</span><span>Deskripsi</span><span></span></div>
      <div id="edit-plo-rows"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('modal-edit-plo').remove()">Batal</button>
        <button class="btn btn-blue" id="btn-save-edit-plo" onclick="saveEditedPLO('${linkId}','${esc(link.KodKursus)}')">Simpan</button>
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
    <input type="text" class="edit-plo-desc" value="${esc(d.desc)}" placeholder="Deskripsi PLO">
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
  finally { btn.disabled = false; btn.innerHTML = 'Simpan'; }
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

  const grouped = {};
  pensyarahKelasList.forEach(p => {
    if (!grouped[p.KodKursus]) grouped[p.KodKursus] = [];
    grouped[p.KodKursus].push(p);
  });

  const cards = Object.keys(grouped).map(kod => {
    const rows = grouped[kod].map(p => `
      <tr>
        <td>${esc(p.NamaKelas)}</td>
        <td>${esc(p.NamaPensyarah)}</td>
        <td><button class="btn btn-red btn-sm" onclick="deletePKItem('${esc(p.ID)}')">Padam</button></td>
      </tr>`).join('');
    return `
    <div class="card">
      <div class="card-title"><span class="tag tag-blue">${esc(kod)}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama Kelas</th><th>Nama Pensyarah</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-title">Pensyarah &amp; Kelas</div>
    <div class="page-sub">Urus senarai nama pensyarah dan kelas mengikut kod kursus. Penyelaras akan dapat pilih dari senarai ini dalam borang laporan CQI.</div>
    <div class="btn-row">
      <button class="btn btn-blue" onclick="openPKForm()">＋ Tambah Pensyarah / Kelas</button>
    </div>
    ${Object.keys(grouped).length === 0 ? `<div class="card">${emptyState('👨‍🏫', 'Belum ada rekod. Klik "+ Tambah Pensyarah / Kelas" untuk mula.')}</div>` : cards}`;
}

function openPKForm() {
  const courses = courseMasterList.map(c => `<option value="${esc(c.KodKursus)}">${esc(c.KodKursus)} — ${esc(c.NamaKursus)}</option>`).join('');
  const root = document.getElementById('modal-root');
  root.innerHTML = `
  <div class="modal-bg open">
    <div class="modal modal-sm">
      <div class="modal-title">👨‍🏫 Tambah Pensyarah / Kelas</div>
      <div class="form-group">
        <label>Kod Kursus</label>
        <select id="pk-kod"><option value="">— Pilih Kursus —</option>${courses}</select>
      </div>
      <div class="form-group"><label>Nama Kelas</label><input id="pk-kelas" placeholder="cth: Kelas A"></div>
      <div class="form-group"><label>Nama Pensyarah</label><input id="pk-pensyarah" placeholder="cth: Dr. Ahmad bin Ali"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="closeDetailModal()">Batal</button>
        <button class="btn btn-blue" id="btn-save-pk" onclick="savePKItem()">Simpan</button>
      </div>
    </div>
  </div>`;
}

async function savePKItem() {
  const kod = document.getElementById('pk-kod').value;
  const kelas = document.getElementById('pk-kelas').value.trim();
  const pensyarah = document.getElementById('pk-pensyarah').value.trim();
  if (!kod || !kelas || !pensyarah) { toast('Sila isi semua maklumat.', 'error'); return; }
  const btn = document.getElementById('btn-save-pk');
  btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Menyimpan...';
  try {
    const result = await apiPost('savePensyarahKelas', { data: { KodKursus: kod, NamaPensyarah: pensyarah, NamaKelas: kelas } });
    if (result.success) {
      toast('Rekod berjaya ditambah.', 'success');
      closeDetailModal();
      await loadAllData();
      showPage('pensyarah');
    } else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Simpan'; }
}

async function deletePKItem(id) {
  if (!confirm('Padam rekod ini?')) return;
  try {
    const result = await apiPost('deletePensyarahKelas', { id });
    if (result.success) { toast('Dipadam.', 'success'); await loadAllData(); showPage('pensyarah'); }
    else toast(result.message, 'error');
  } catch (err) { toast('Ralat: ' + err.message, 'error'); }
}
