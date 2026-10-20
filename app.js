/**
 * نظام إدارة وبحث كشف الرواتب - قراءة حية وميزات متقدمة للهاتف المحمول
 * https://docs.google.com/spreadsheets/d/1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w/edit
 */

// ========================
// Configuration & Keys
// ========================
const SPREADSHEET_ID = '1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w';
const SETTINGS_SPREADSHEET_ID = '1puRhhC5J0f0xjTgnumjUvkujj8tUeczYAoMVaahrrOw';
const MASTER_SECURITY_PIN = '1234'; // الرمز السري الرئيسي الإجباري لحماية الكشف على كافة الأجهزة
const STORAGE_KEY = 'payroll_sheet_data_v1';
const THEME_KEY = 'payroll_theme_mode';
const MODIFIED_KEY = 'payroll_has_local_edits';
const FAVORITES_KEY = 'payroll_favorites_v1';
const PRIVACY_KEY = 'payroll_privacy_mask';
const PIN_KEY = 'payroll_app_pin';
const PIN_SESSION_KEY = 'payroll_session_unlocked';
const PIN_REMOTE_ACTIVE_KEY = 'payroll_remote_pin_active';
const HISTORY_KEY = 'payroll_history_log_v1';
const WEBHOOK_KEY = 'payroll_apps_script_url';

// ========================
// Application State
// ========================
let employees = [];
let favorites = [];
let currentFilter = 'الكل';
let searchQuery = '';
let currentSort = 'id-asc';
let autoCalculate = true;
let editingId = null;
let isFetchingLive = false;
let isPrivacyMasked = false;
let enteredPin = '';
let currentPersonQrShown = false;
let remotePin = null;
let isSettingsLoaded = false;

// ========================
// Arabic Text Normalization
// ========================
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632)
    .trim()
    .toLowerCase();
}

/**
 * استخراج الاسم الصافي بعد استبعاد الألقاب والدرجات العلمية لترتيب أبجدي دقيق
 */
function getSortableName(name) {
  if (!name) return '';
  return String(name)
    .replace(/^(أ\.?\s*د\.?\s*[\/\.]?|أ\.?\s*م\.?\s*د\.?\s*[\/\.]?|م\.?\s*د\.?\s*[\/\.]?|د\.?\s*[\/\.]?|م\.?\s*[\/\.]?|أ\.?\s*[\/\.]?|دكتور\s*[\/\.]?|الاستاذ\s*الدكتور\s*[\/\.]?|الأستاذ\s*الدكتور\s*[\/\.]?)\s*/i, '')
    .trim();
}

function parseNumber(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim()
    .replace(/[،٫]/g, '.')
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632);
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function formatNumber(num, decimals = 2) {
  const n = parseNumber(num);
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

// ========================
// Initialization
// ========================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPrivacyMode();
  initFavorites();
  initPinLock();
  fetchSettingsFromGoogleSheet();
  setupEventListeners();
  initVoiceSearch();
  
  // 1. Load cached data for instant load
  loadCachedData();
  renderApp();

  // 2. Fetch LIVE data directly from Google Sheets
  fetchLiveFromGoogleSheet(false);
});

// ========================
// Theme Handling
// ========================
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  if (theme === 'dark') {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  } else {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
}

// ========================
// Privacy Mode (Masking)
// ========================
function initPrivacyMode() {
  isPrivacyMasked = localStorage.getItem(PRIVACY_KEY) === 'true';
  updatePrivacyIcon();
}

function togglePrivacyMode() {
  isPrivacyMasked = !isPrivacyMasked;
  localStorage.setItem(PRIVACY_KEY, isPrivacyMasked);
  updatePrivacyIcon();
  renderCards();
  showToast(isPrivacyMasked ? 'تم تفعيل وضع الخصوصية (إخفاء المبالغ)' : 'تم إظهار المبالغ');
}

function updatePrivacyIcon() {
  const icon = document.getElementById('privacyIcon');
  if (!icon) return;
  if (isPrivacyMasked) {
    icon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  } else {
    icon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  }
}

// ========================
// Favorites / Pinning
// ========================
function initFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    favorites = raw ? JSON.parse(raw) : [];
  } catch (e) {
    favorites = [];
  }
}

function toggleFavorite(id, event) {
  if (event) event.stopPropagation();
  const idx = favorites.indexOf(id);
  if (idx !== -1) {
    favorites.splice(idx, 1);
    showToast('تمت الإزالة من المفضلة');
  } else {
    favorites.push(id);
    showToast('تم التثبيت في المفضلة');
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  renderCards();
  updateFavoritePill(id);
}

function updateFavoritePill(id) {
  const btn = document.getElementById('favPillBtn');
  const icon = document.getElementById('favPillIcon');
  const text = document.getElementById('favPillText');
  if (!btn || !id) return;
  const isFav = favorites.includes(id);
  if (isFav) {
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    text.innerText = 'مثبت بالمفضلة';
    btn.classList.add('active');
    btn.style.borderColor = '#f59e0b';
    btn.style.color = '#f59e0b';
  } else {
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    text.innerText = 'إضافة للمفضلة';
    btn.classList.remove('active');
    btn.style.borderColor = '';
    btn.style.color = '';
  }
}

function toggleCurrentFavorite() {
  if (editingId) toggleFavorite(editingId);
}

// ========================
// Voice Search (Speech API)
// ========================
function initVoiceSearch() {
  const btn = document.getElementById('voiceSearchBtn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (btn) btn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-EG';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  btn.addEventListener('click', () => {
    try {
      btn.classList.add('listening');
      showToast('تحدث الآن... انطق اسم العضو');
      recognition.start();
    } catch (e) {
      recognition.stop();
      btn.classList.remove('listening');
    }
  });

  recognition.onresult = (event) => {
    btn.classList.remove('listening');
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      document.getElementById('searchInput').value = transcript;
      searchQuery = transcript;
      document.getElementById('searchClearBtn').classList.add('active');
      renderApp();
      showToast(`بحث صوتي: "${transcript}"`);
    }
  };

  recognition.onerror = () => {
    btn.classList.remove('listening');
    showToast('تعذر التعرف على الصوت، جرب ثانية');
  };

  recognition.onend = () => {
    btn.classList.remove('listening');
  };
}

// ========================
// Live Fetch from Google Sheet
// ========================
function fetchLiveFromGoogleSheet(isManual = false) {
  if (isFetchingLive) return;
  isFetchingLive = true;

  const syncIcon = document.getElementById('syncIcon');
  const liveDot = document.getElementById('liveDot');
  const liveStatusText = document.getElementById('liveStatusText');

  if (syncIcon) syncIcon.classList.add('spinning');
  if (liveDot) liveDot.className = 'live-pulse-dot';
  if (liveStatusText) liveStatusText.innerText = 'جاري القراءة لايف...';

  const callbackName = 'gvizCallback_' + Date.now();
  const script = document.createElement('script');
  let isDone = false;

  const timer = setTimeout(() => {
    if (isDone) return;
    cleanup();
    handleFetchError('تعذر الاتصال بشيت جوجل (مهلة)');
  }, 10000);

  function cleanup() {
    isDone = true;
    clearTimeout(timer);
    isFetchingLive = false;
    if (syncIcon) syncIcon.classList.remove('spinning');
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
  }

  window[callbackName] = function(json) {
    cleanup();
    try {
      if (!json || !json.table || !json.table.rows) {
        throw new Error('هيكل شيت جوجل غير صالح');
      }

      const rows = json.table.rows;
      const liveList = [];

      rows.forEach((r, idx) => {
        if (!r.c) return;
        const nameVal = r.c[1] ? (r.c[1].v || '') : '';
        if (!nameVal || String(nameVal).trim() === '') return;

        liveList.push({
          id: r.c[0] ? (parseNumber(r.c[0].v) || (idx + 1)) : (idx + 1),
          name: String(nameVal).trim(),
          job: r.c[2] ? (String(r.c[2].v || 'أستاذ').trim()) : 'أستاذ',
          salaryBefore: r.c[3] ? parseNumber(r.c[3].v) : 0,
          allowance: r.c[4] ? parseNumber(r.c[4].v) : 0,
          bonus10: r.c[5] ? parseNumber(r.c[5].v) : 0,
          salaryAfter: r.c[6] ? parseNumber(r.c[6].v) : 0
        });
      });

      if (liveList.length > 0) {
        employees = liveList;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
        localStorage.removeItem(MODIFIED_KEY);
        
        if (liveDot) liveDot.className = 'live-pulse-dot';
        if (liveStatusText) liveStatusText.innerText = 'مباشر من الشيت (محدث)';
        
        renderApp();
        if (isManual) {
          showToast(`تم تحديث البيانات لايف (${liveList.length} شخص)`);
        }
      }
    } catch (err) {
      console.error(err);
      handleFetchError('خطأ أثناء قراءة بيانات الشيت');
    }
  };

  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&_=${Date.now()}`;
  script.onerror = function() {
    cleanup();
    handleFetchError('تعذر تحميل الشيت (تحقق من الاتصال)');
  };

  document.head.appendChild(script);
}

function handleFetchError(msg) {
  const liveStatusText = document.getElementById('liveStatusText');
  if (liveStatusText) liveStatusText.innerText = 'أوفلاين (بيانات محفوظة)';
  showToast(msg);
}

function loadCachedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      employees = JSON.parse(raw);
    }
  } catch (e) {
    console.error(e);
  }
}

function saveDataLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
    localStorage.setItem(MODIFIED_KEY, 'true');
    const liveStatusText = document.getElementById('liveStatusText');
    if (liveStatusText) liveStatusText.innerText = 'محفوظ محلياً (معدل)';
  } catch (e) {
    console.error(e);
  }
}

// ========================
// Filtering & Sorting
// ========================
function getFilteredAndSortedData() {
  let list = employees.filter(item => {
    if (currentFilter !== 'الكل' && item.job !== currentFilter) {
      return false;
    }
    if (searchQuery) {
      const q = normalizeArabic(searchQuery);
      const nameMatch = normalizeArabic(item.name).includes(q);
      const jobMatch = normalizeArabic(item.job).includes(q);
      const idMatch = String(item.id).includes(q);
      const salaryMatch = String(item.salaryAfter).includes(q);
      return nameMatch || jobMatch || idMatch || salaryMatch;
    }
    return true;
  });

  list.sort((a, b) => {
    // If user selected favorites first
    if (currentSort === 'favorites-first') {
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.id - b.id;
    }

    switch (currentSort) {
      case 'id-asc':
        return a.id - b.id;
      case 'id-desc':
        return b.id - a.id;
      case 'name-asc':
        return getSortableName(a.name).localeCompare(getSortableName(b.name), 'ar');
      case 'name-desc':
        return getSortableName(b.name).localeCompare(getSortableName(a.name), 'ar');
      case 'salary-desc':
        return parseNumber(b.salaryAfter) - parseNumber(a.salaryAfter);
      case 'salary-asc':
        return parseNumber(a.salaryAfter) - parseNumber(b.salaryAfter);
      default:
        return a.id - b.id;
    }
  });

  return list;
}

// ========================
// Render Methods
// ========================
function renderApp() {
  renderStats();
  renderFilterChips();
  renderCards();
}

function renderStats() {
  const filtered = getFilteredAndSortedData();
  const totalCount = filtered.length;
  
  let totalSalary = 0;
  filtered.forEach(item => {
    totalSalary += parseNumber(item.salaryAfter);
  });

  const totalCountEl = document.getElementById('statTotalCount');
  if (totalCountEl) totalCountEl.innerText = formatNumber(totalCount, 0);

  const resultsCountEl = document.getElementById('resultsCount');
  if (resultsCountEl) {
    if (searchQuery || currentFilter !== 'الكل') {
      resultsCountEl.innerHTML = `تم العثور على <span>${totalCount}</span> من أصل ${employees.length}`;
    } else {
      const salaryText = isPrivacyMasked ? '•••• ج.م' : `${formatNumber(totalSalary, 0)} ج.م`;
      resultsCountEl.innerHTML = `عرض <span>${totalCount}</span> عضو • إجمالي الرواتب <span>${salaryText}</span>`;
    }
  }
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  if (!container) return;

  const jobsMap = { 'الكل': employees.length };
  employees.forEach(item => {
    const j = item.job || 'غير محدد';
    jobsMap[j] = (jobsMap[j] || 0) + 1;
  });

  let html = '';
  for (const [job, count] of Object.entries(jobsMap)) {
    const activeClass = job === currentFilter ? 'active' : '';
    html += `
      <button class="filter-chip ${activeClass}" data-job="${escapeHtml(job)}">
        <span>${escapeHtml(job)}</span>
        <span class="chip-count">${count}</span>
      </button>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.getAttribute('data-job');
      renderApp();
    });
  });
}

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  const normalizedText = normalizeArabic(text);
  const normalizedQuery = normalizeArabic(query);
  const index = normalizedText.indexOf(normalizedQuery);
  if (index === -1) return escapeHtml(text);

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);
  return `${escapeHtml(before)}<mark class="highlight-match">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

function renderCards() {
  const container = document.getElementById('cardsContainer');
  const emptyState = document.getElementById('emptyState');
  const filtered = getFilteredAndSortedData();

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  let html = '';
  filtered.forEach(item => {
    const highlightedName = highlightText(item.name, searchQuery);
    const isFav = favorites.includes(item.id);
    const starClass = isFav ? 'fav-star-btn active' : 'fav-star-btn';
    const starSvg = isFav
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

    // Mask salary if privacy mode is on
    const salaryDisplay = isPrivacyMasked 
      ? `<span class="masked-amount">••••</span>` 
      : formatNumber(item.salaryAfter, 2);

    html += `
      <article class="person-card" onclick="openEditModal(${item.id})">
        <div class="card-leading">
          <div class="card-avatar">#${item.id}</div>
          <div class="card-info">
            <h3 class="card-name">${highlightedName}</h3>
            <span class="job-pill">${escapeHtml(item.job)}</span>
          </div>
        </div>

        <div class="card-trailing">
          <button class="${starClass}" title="${isFav ? 'إزالة من المفضلة' : 'تثبيت في المفضلة'}" onclick="toggleFavorite(${item.id}, event)" aria-label="Toggle Favorite">
            ${starSvg}
          </button>
          <div class="card-salary-block">
            <span class="card-salary-num">${salaryDisplay}</span>
            <span class="card-salary-curr">ج.م</span>
          </div>
          <span class="card-chevron">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
          </span>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;
}

// ========================
// Modal & CRUD Operations
// ========================
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').innerText = 'إضافة عضو جديد';
  document.getElementById('deleteBtnModal').style.display = 'none';
  document.getElementById('sheetQuickActions').style.display = 'none';
  document.getElementById('qrCodeContainer').style.display = 'none';

  const maxId = employees.reduce((max, cur) => cur.id > max ? cur.id : max, 0);
  document.getElementById('fieldId').value = maxId + 1;
  document.getElementById('fieldName').value = '';
  document.getElementById('fieldJob').value = 'أستاذ';
  document.getElementById('fieldSalaryBefore').value = '';
  document.getElementById('fieldAllowance').value = '10';
  document.getElementById('fieldBonus10').value = '';
  document.getElementById('fieldSalaryAfter').value = '';
  document.getElementById('autoCalcToggle').checked = true;
  autoCalculate = true;

  showModal();
}

function openEditModal(id) {
  const item = employees.find(e => e.id === id);
  if (!item) return;

  editingId = id;
  document.getElementById('modalTitle').innerText = `بيانات: ${item.name}`;
  document.getElementById('deleteBtnModal').style.display = 'inline-flex';
  document.getElementById('sheetQuickActions').style.display = 'flex';
  document.getElementById('qrCodeContainer').style.display = 'none';
  currentPersonQrShown = false;
  updateFavoritePill(id);

  document.getElementById('fieldId').value = item.id;
  document.getElementById('fieldName').value = item.name;
  document.getElementById('fieldJob').value = item.job;
  document.getElementById('fieldSalaryBefore').value = item.salaryBefore;
  document.getElementById('fieldAllowance').value = item.allowance;
  document.getElementById('fieldBonus10').value = item.bonus10;
  document.getElementById('fieldSalaryAfter').value = item.salaryAfter;
  document.getElementById('autoCalcToggle').checked = true;
  autoCalculate = true;

  showModal();
}

function showModal() {
  const modal = document.getElementById('editModal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('editModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function calculateSalaryFromInputs() {
  if (!autoCalculate) return;
  const before = parseNumber(document.getElementById('fieldSalaryBefore').value);
  const allowance = parseNumber(document.getElementById('fieldAllowance').value);
  const bonus = parseNumber(document.getElementById('fieldBonus10').value);
  
  const total = before + allowance + bonus;
  const rounded = Math.round(total * 1000) / 1000;
  document.getElementById('fieldSalaryAfter').value = rounded > 0 ? rounded : '';
}

function handleSavePerson(event) {
  event.preventDefault();

  const id = parseInt(document.getElementById('fieldId').value, 10);
  const name = document.getElementById('fieldName').value.trim();
  const job = document.getElementById('fieldJob').value.trim();
  const salaryBefore = parseNumber(document.getElementById('fieldSalaryBefore').value);
  const allowance = parseNumber(document.getElementById('fieldAllowance').value);
  const bonus10 = parseNumber(document.getElementById('fieldBonus10').value);
  let salaryAfter = parseNumber(document.getElementById('fieldSalaryAfter').value);

  if (!name) {
    showToast('يرجى كتابة الاسم أولاً');
    return;
  }

  if (salaryAfter <= 0 && (salaryBefore > 0 || allowance > 0 || bonus10 > 0)) {
    salaryAfter = Math.round((salaryBefore + allowance + bonus10) * 1000) / 1000;
  }

  const newRecord = {
    id: id || (employees.length + 1),
    name,
    job: job || 'عضو هيئة تدريس',
    salaryBefore,
    allowance,
    bonus10,
    salaryAfter
  };

  if (editingId !== null) {
    const idx = employees.findIndex(e => e.id === editingId);
    if (idx !== -1) {
      const old = employees[idx];
      logHistory('تعديل', name, `المرتب: ${old.salaryAfter} ج.م إلى ${salaryAfter} ج.م`);
      employees[idx] = newRecord;
      showToast('تم حفظ التعديل بنجاح');
    }
  } else {
    employees.push(newRecord);
    logHistory('إضافة جديد', name, `المرتب الصافي: ${salaryAfter} ج.م`);
    showToast('تمت إضافة السجل بنجاح');
  }

  saveDataLocally();
  syncRecordToGoogleSheet('save', newRecord);
  closeModal();
  renderApp();
}

async function confirmDeletePerson(id) {
  const item = employees.find(e => e.id === id);
  if (!item) return;

  const confirmed = await showCustomConfirm({
    title: 'تأكيد حذف السجل',
    message: `هل أنت متأكد من حذف (${item.name}) من كشف الرواتب نهائياً؟`,
    confirmText: 'حذف السجل',
    cancelText: 'إلغاء',
    isDanger: true
  });

  if (confirmed) {
    logHistory('حذف', item.name, `مسلسل #${item.id}`);
    employees = employees.filter(e => e.id !== id);
    saveDataLocally();
    syncRecordToGoogleSheet('delete', { id });
    if (editingId === id) closeModal();
    renderApp();
    showToast('تم حذف السجل');
  }
}

// ========================
// WhatsApp Share & QR Code
// ========================
function formatPersonText(item) {
  return `
*كشف رواتب كلية الطب - جامعة الزقازيق*
*الاسم:* ${item.name}
*الوظيفة:* ${item.job}
*المرتب قبل 2015/7/1:* ${item.salaryBefore} ج.م
*العلاوة الدورية:* ${item.allowance} ج.م
*الـ 10% في 2015/6/30:* ${item.bonus10} ج.م
*المرتب الصافي في 2015/7/1:* ${item.salaryAfter} ج.م
  `.trim();
}

function shareCurrentPersonWhatsApp() {
  if (!editingId) return;
  const item = employees.find(e => e.id === editingId);
  if (!item) return;

  const text = formatPersonText(item);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function copyCurrentPersonData() {
  if (!editingId) return;
  const item = employees.find(e => e.id === editingId);
  if (!item) return;

  const text = formatPersonText(item);
  navigator.clipboard.writeText(text).then(() => {
    showToast('تم نسخ مفردات الراتب للحافظة');
  }).catch(() => {
    showToast('تعذر النسخ');
  });
}

function toggleCurrentQrCode() {
  if (!editingId) return;
  const item = employees.find(e => e.id === editingId);
  if (!item) return;

  const qrBox = document.getElementById('qrCodeContainer');
  const qrImg = document.getElementById('qrCodeImg');

  currentPersonQrShown = !currentPersonQrShown;
  if (currentPersonQrShown) {
    const text = formatPersonText(item);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(text)}`;
    qrBox.style.display = 'flex';
  } else {
    qrBox.style.display = 'none';
  }
}

// ========================
// Salary Simulator
// ========================
function openSimulatorModal() {
  closeMenuDropdown();
  runSimulation();
  document.getElementById('simulatorModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSimulatorModal() {
  document.getElementById('simulatorModal').classList.remove('active');
  document.body.style.overflow = '';
}

function runSimulation() {
  const type = document.getElementById('simType').value;
  const val = parseNumber(document.getElementById('simValue').value);
  const targetJob = document.getElementById('simTargetJob').value;

  const valLabel = document.getElementById('simValLabel');
  if (valLabel) {
    valLabel.innerText = type === 'percent' ? 'نسبة الزيادة (%)' : 'قيمة الزيادة (ج.م)';
  }

  let affectedCount = 0;
  let totalCost = 0;
  let currentTotalBudget = 0;

  employees.forEach(item => {
    const s = parseNumber(item.salaryAfter);
    currentTotalBudget += s;
    if (targetJob === 'الكل' || item.job === targetJob) {
      affectedCount++;
      if (type === 'percent') {
        totalCost += (s * (val / 100));
      } else {
        totalCost += val;
      }
    }
  });

  const newTotalBudget = currentTotalBudget + totalCost;
  const newAvgSalary = employees.length > 0 ? (newTotalBudget / employees.length) : 0;

  document.getElementById('simAffectedCount').innerText = `${affectedCount} عضو`;
  document.getElementById('simTotalCost').innerText = `+${formatNumber(totalCost, 1)} ج.م`;
  document.getElementById('simNewTotalBudget').innerText = `${formatNumber(newTotalBudget, 1)} ج.م`;
  document.getElementById('simNewAvgSalary').innerText = `${formatNumber(newAvgSalary, 1)} ج.م`;
}

async function applySimulationToData() {
  const type = document.getElementById('simType').value;
  const val = parseNumber(document.getElementById('simValue').value);
  const targetJob = document.getElementById('simTargetJob').value;

  if (val <= 0) {
    showToast('يرجى تحديد قيمة صالحة للزيادة');
    return;
  }

  const desc = type === 'percent' ? `${val}%` : `${val} ج.م`;
  const confirmed = await showCustomConfirm({
    title: 'تطبيق زيادة الميزانية',
    message: `هل أنت متأكد من تطبيق زيادة (${desc}) على ${targetJob === 'الكل' ? 'كافة أعضاء هيئة التدريس' : targetJob}؟`,
    confirmText: 'تطبيق الزيادة',
    cancelText: 'تراجع',
    isDanger: false
  });
  if (!confirmed) return;

  employees.forEach(item => {
    if (targetJob === 'الكل' || item.job === targetJob) {
      if (type === 'percent') {
        const inc = Math.round(parseNumber(item.salaryAfter) * (val / 100) * 1000) / 1000;
        item.salaryAfter = Math.round((item.salaryAfter + inc) * 1000) / 1000;
      } else {
        item.salaryAfter = Math.round((item.salaryAfter + val) * 1000) / 1000;
      }
    }
  });

  logHistory('محاكاة زيادة عامة', targetJob, `تطبيق زيادة ${desc}`);
  saveDataLocally();
  renderApp();
  closeSimulatorModal();
  showToast('تم تطبيق الزيادات على الكشف بنجاح');
}

// ========================
// Comparison Tool (Live Autocomplete Search)
// ========================
let compareId1 = null;
let compareId2 = null;

function openCompareModal() {
  closeMenuDropdown();
  
  if (employees.length >= 2) {
    if (!compareId1) compareId1 = employees[0].id;
    if (!compareId2) compareId2 = employees[1].id;
  } else if (employees.length === 1) {
    if (!compareId1) compareId1 = employees[0].id;
  }

  setupCompareSearchListeners();
  syncCompareInputsFromIds();
  updateComparison();

  document.getElementById('compareModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('active');
  document.body.style.overflow = '';
  hideAllCompSuggestions();
}

function syncCompareInputsFromIds() {
  const p1 = employees.find(e => e.id === compareId1);
  const p2 = employees.find(e => e.id === compareId2);

  const input1 = document.getElementById('compSearch1');
  const input2 = document.getElementById('compSearch2');
  const clear1 = document.getElementById('compClear1');
  const clear2 = document.getElementById('compClear2');
  const badge1 = document.getElementById('compSelectedBadge1');
  const badge2 = document.getElementById('compSelectedBadge2');

  if (p1 && input1) {
    input1.value = p1.name;
    if (clear1) clear1.classList.add('active');
    if (badge1) {
      badge1.innerHTML = `<span>✓ تم اختيار: ${escapeHtml(p1.name)} (${escapeHtml(p1.job)})</span>`;
      badge1.classList.add('active');
    }
  }

  if (p2 && input2) {
    input2.value = p2.name;
    if (clear2) clear2.classList.add('active');
    if (badge2) {
      badge2.innerHTML = `<span>✓ تم اختيار: ${escapeHtml(p2.name)} (${escapeHtml(p2.job)})</span>`;
      badge2.classList.add('active');
    }
  }
}

function setupCompareSearchListeners() {
  const input1 = document.getElementById('compSearch1');
  const input2 = document.getElementById('compSearch2');

  if (input1 && !input1._hasListener) {
    input1.addEventListener('input', () => handleCompInput(1));
    input1.addEventListener('focus', () => handleCompInput(1));
    input1._hasListener = true;
  }

  if (input2 && !input2._hasListener) {
    input2.addEventListener('input', () => handleCompInput(2));
    input2.addEventListener('focus', () => handleCompInput(2));
    input2._hasListener = true;
  }

  // Close suggestions if clicked outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.comp-col')) {
      hideAllCompSuggestions();
    }
  });
}

function handleCompInput(memberIndex) {
  const input = document.getElementById(`compSearch${memberIndex}`);
  const suggContainer = document.getElementById(`compSuggestions${memberIndex}`);
  const clearBtn = document.getElementById(`compClear${memberIndex}`);
  if (!input || !suggContainer) return;

  const query = normalizeArabic(input.value.trim());

  if (query.length > 0 && clearBtn) {
    clearBtn.classList.add('active');
  } else if (clearBtn) {
    clearBtn.classList.remove('active');
  }

  const matches = employees.filter(e => {
    if (!query) return true;
    return normalizeArabic(e.name).includes(query) ||
           normalizeArabic(e.job).includes(query) ||
           String(e.id).includes(query);
  }).slice(0, 10);

  if (matches.length === 0) {
    suggContainer.innerHTML = `<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">لا توجد أسماء مطابقة للبحث</div>`;
    suggContainer.style.display = 'block';
    return;
  }

  let html = '';
  matches.forEach(m => {
    html += `
      <div class="comp-suggestion-item" onclick="selectCompMember(${memberIndex}, ${m.id})">
        <span class="comp-sugg-name">${escapeHtml(m.name)}</span>
        <div class="comp-sugg-meta">
          <span class="comp-sugg-job">${escapeHtml(m.job)}</span>
          <span class="comp-sugg-salary">${formatNumber(m.salaryAfter, 0)} ج.م</span>
        </div>
      </div>
    `;
  });

  suggContainer.innerHTML = html;
  suggContainer.style.display = 'block';
}

function selectCompMember(memberIndex, id) {
  const member = employees.find(e => e.id === id);
  if (!member) return;

  if (memberIndex === 1) {
    compareId1 = member.id;
  } else {
    compareId2 = member.id;
  }

  const input = document.getElementById(`compSearch${memberIndex}`);
  const suggContainer = document.getElementById(`compSuggestions${memberIndex}`);
  const clearBtn = document.getElementById(`compClear${memberIndex}`);
  const badge = document.getElementById(`compSelectedBadge${memberIndex}`);

  if (input) input.value = member.name;
  if (clearBtn) clearBtn.classList.add('active');
  if (suggContainer) suggContainer.style.display = 'none';

  if (badge) {
    badge.innerHTML = `<span>✓ تم اختيار: ${escapeHtml(member.name)} (${escapeHtml(member.job)})</span>`;
    badge.classList.add('active');
  }

  updateComparison();
}

function clearCompSearch(memberIndex) {
  if (memberIndex === 1) compareId1 = null;
  else compareId2 = null;

  const input = document.getElementById(`compSearch${memberIndex}`);
  const clearBtn = document.getElementById(`compClear${memberIndex}`);
  const badge = document.getElementById(`compSelectedBadge${memberIndex}`);
  const suggContainer = document.getElementById(`compSuggestions${memberIndex}`);

  if (input) {
    input.value = '';
    input.focus();
  }
  if (clearBtn) clearBtn.classList.remove('active');
  if (badge) badge.classList.remove('active');
  if (suggContainer) suggContainer.style.display = 'none';

  updateComparison();
}

function hideAllCompSuggestions() {
  const s1 = document.getElementById('compSuggestions1');
  const s2 = document.getElementById('compSuggestions2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'none';
}

function updateComparison() {
  const p1 = employees.find(e => e.id === compareId1);
  const p2 = employees.find(e => e.id === compareId2);
  const container = document.getElementById('compareResultsWrap');
  if (!container) return;

  if (!p1 || !p2) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 0.88rem;">
        <span>يرجى اختيار العضو الأول والعضو الثاني من البحث أعلاه لإجراء المقارنة</span>
      </div>
    `;
    return;
  }

  const diff = Math.round((p1.salaryAfter - p2.salaryAfter) * 1000) / 1000;
  let diffText = '';
  if (diff > 0) {
    diffText = `المرتب الصافي لـ (${p1.name}) أعلى بمقدار ${formatNumber(diff, 2)} ج.م`;
  } else if (diff < 0) {
    diffText = `المرتب الصافي لـ (${p2.name}) أعلى بمقدار ${formatNumber(Math.abs(diff), 2)} ج.م`;
  } else {
    diffText = `المرتبان متطابقان تماماً`;
  }

  container.innerHTML = `
    <div class="compare-card">
      <div class="compare-name">${escapeHtml(p1.name)}</div>
      <div class="compare-row"><span>الوظيفة</span><span>${escapeHtml(p1.job)}</span></div>
      <div class="compare-row"><span>المرتب قبل</span><span>${formatNumber(p1.salaryBefore, 2)} ج.م</span></div>
      <div class="compare-row"><span>العلاوة</span><span>${formatNumber(p1.allowance, 2)} ج.م</span></div>
      <div class="compare-row"><span>الـ 10%</span><span>${formatNumber(p1.bonus10, 2)} ج.م</span></div>
      <div class="compare-row" style="border-top:1px solid var(--border-subtle); font-weight:bold; color:var(--accent-blue)">
        <span>الصافي النهائي</span><span>${formatNumber(p1.salaryAfter, 2)} ج.م</span>
      </div>
    </div>

    <div class="compare-card">
      <div class="compare-name">${escapeHtml(p2.name)}</div>
      <div class="compare-row"><span>الوظيفة</span><span>${escapeHtml(p2.job)}</span></div>
      <div class="compare-row"><span>المرتب قبل</span><span>${formatNumber(p2.salaryBefore, 2)} ج.م</span></div>
      <div class="compare-row"><span>العلاوة</span><span>${formatNumber(p2.allowance, 2)} ج.م</span></div>
      <div class="compare-row"><span>الـ 10%</span><span>${formatNumber(p2.bonus10, 2)} ج.م</span></div>
      <div class="compare-row" style="border-top:1px solid var(--border-subtle); font-weight:bold; color:var(--accent-blue)">
        <span>الصافي النهائي</span><span>${formatNumber(p2.salaryAfter, 2)} ج.م</span>
      </div>
    </div>

    <div class="compare-diff-banner">${diffText}</div>
  `;
}

// ========================
// Data Analytics Dashboard (لوحة تحليل البيانات والمؤشرات)
// ========================
function openAnalyticsModal() {
  closeMenuDropdown();
  renderAnalyticsDashboard();
  document.getElementById('analyticsModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAnalyticsModal() {
  document.getElementById('analyticsModal').classList.remove('active');
  document.body.style.overflow = '';
}

function renderAnalyticsDashboard() {
  const container = document.getElementById('analyticsBodyContent');
  if (!container) return;

  const totalMembers = employees.length;
  if (totalMembers === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 20px; color:var(--text-muted);">لا توجد بيانات متاحة للتحليل حالياً</p>';
    return;
  }

  let totalPayroll = 0;
  let totalBefore = 0;
  let totalAllowances = 0;
  let totalBonus10 = 0;
  let maxPerson = employees[0];
  let minPerson = employees[0];

  const jobStats = {};
  const brackets = {
    'أكثر من 3000 ج.م': 0,
    'من 2500 إلى 3000 ج.م': 0,
    'من 2000 إلى 2500 ج.م': 0,
    'أقل من 2000 ج.م': 0
  };

  employees.forEach(item => {
    const after = parseNumber(item.salaryAfter);
    const before = parseNumber(item.salaryBefore);
    const allowance = parseNumber(item.allowance);
    const bonus = parseNumber(item.bonus10);

    totalPayroll += after;
    totalBefore += before;
    totalAllowances += allowance;
    totalBonus10 += bonus;

    if (after > parseNumber(maxPerson.salaryAfter)) maxPerson = item;
    if (after < parseNumber(minPerson.salaryAfter)) minPerson = item;

    const j = item.job || 'غير محدد';
    if (!jobStats[j]) {
      jobStats[j] = { count: 0, totalSalary: 0 };
    }
    jobStats[j].count += 1;
    jobStats[j].totalSalary += after;

    if (after >= 3000) brackets['أكثر من 3000 ج.م']++;
    else if (after >= 2500) brackets['من 2500 إلى 3000 ج.م']++;
    else if (after >= 2000) brackets['من 2000 إلى 2500 ج.م']++;
    else brackets['أقل من 2000 ج.م']++;
  });

  const avgSalary = totalPayroll / totalMembers;
  const yearlyBudget = totalPayroll * 12;
  const netIncrease = totalPayroll - totalBefore;

  // Job Distribution
  let jobsHtml = '';
  const sortedJobs = Object.entries(jobStats).sort((a, b) => b[1].totalSalary - a[1].totalSalary);
  const colors = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316'];

  sortedJobs.forEach(([job, stat], idx) => {
    const pctOfCount = Math.round((stat.count / totalMembers) * 100);
    const pctOfBudget = Math.round((stat.totalSalary / totalPayroll) * 100);
    const avg = stat.totalSalary / stat.count;
    const color = colors[idx % colors.length];

    jobsHtml += `
      <div class="stat-bar-item">
        <div class="stat-bar-header">
          <span class="stat-bar-name">${escapeHtml(job)} (${stat.count} عضو • ${pctOfCount}%)</span>
          <span class="stat-bar-metrics">إجمالي: ${formatNumber(stat.totalSalary, 0)} ج.م (متوسط: ${formatNumber(avg, 0)})</span>
        </div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width: ${pctOfBudget}%; background: ${color};"></div>
        </div>
      </div>
    `;
  });

  // Brackets Distribution
  let bracketsHtml = '';
  Object.entries(brackets).forEach(([bracketName, count], idx) => {
    const pct = Math.round((count / totalMembers) * 100);
    const color = colors[(idx + 2) % colors.length];
    bracketsHtml += `
      <div class="stat-bar-item">
        <div class="stat-bar-header">
          <span class="stat-bar-name">${bracketName}</span>
          <span class="stat-bar-metrics">${count} عضو (${pct}%)</span>
        </div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <!-- Top KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <span class="kpi-title">إجمالي الميزانية الشهرية</span>
        <span class="kpi-val">${formatNumber(totalPayroll, 0)} ج.م</span>
        <span class="kpi-sub">+${formatNumber(netIncrease, 0)} ج.م فرق الزيادة المضافة</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">الميزانية السنوية التقديرية</span>
        <span class="kpi-val">${formatNumber(yearlyBudget, 0)} ج.م</span>
        <span class="kpi-sub">تقدير صرف 12 شهراً كاملاً</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">متوسط راتب عضو التدريس</span>
        <span class="kpi-val">${formatNumber(avgSalary, 0)} ج.م</span>
        <span class="kpi-sub">لكافة الدرجات العلمية المسجلة</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">عدد أعضاء هيئة التدريس</span>
        <span class="kpi-val">${totalMembers} عضو</span>
        <span class="kpi-sub">شؤون العاملين - كلية الطب</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">إجمالي العلاوات الدورية</span>
        <span class="kpi-val">${formatNumber(totalAllowances, 0)} ج.م</span>
        <span class="kpi-sub">شهرياً لكافة الأعضاء</span>
      </div>

      <div class="kpi-card">
        <span class="kpi-title">إجمالي بند الـ 10%</span>
        <span class="kpi-val">${formatNumber(totalBonus10, 0)} ج.م</span>
        <span class="kpi-sub">في 2015/6/30</span>
      </div>
    </div>

    <!-- Highest & Lowest Salaries Section -->
    <div class="analytics-section">
      <div class="sec-title-row">
        <span class="sec-title">أقصى وأدنى رواتب مسجلة</span>
        <span class="sec-badge">المدى المالي للكشف</span>
      </div>
      <div class="extreme-cards-grid">
        <div class="extreme-card">
          <span class="extreme-tag high">أعلى راتب في الكشف</span>
          <span class="extreme-name" title="${escapeHtml(maxPerson.name)}">${escapeHtml(maxPerson.name)}</span>
          <span class="extreme-val">${formatNumber(maxPerson.salaryAfter, 2)} ج.م</span>
          <span class="kpi-sub">${escapeHtml(maxPerson.job)}</span>
        </div>

        <div class="extreme-card">
          <span class="extreme-tag low">أقل راتب في الكشف</span>
          <span class="extreme-name" title="${escapeHtml(minPerson.name)}">${escapeHtml(minPerson.name)}</span>
          <span class="extreme-val">${formatNumber(minPerson.salaryAfter, 2)} ج.م</span>
          <span class="kpi-sub">${escapeHtml(minPerson.job)}</span>
        </div>
      </div>
    </div>

    <!-- Cadre & Job Distribution -->
    <div class="analytics-section">
      <div class="sec-title-row">
        <span class="sec-title">توزيع الكادر ومخصصات الدرجات</span>
        <span class="sec-badge">النسبة من إجمالي الميزانية</span>
      </div>
      <div class="stat-bars-list">
        ${jobsHtml}
      </div>
    </div>

    <!-- Salary Brackets Distribution -->
    <div class="analytics-section">
      <div class="sec-title-row">
        <span class="sec-title">شرائح الرواتب الشهرية</span>
        <span class="sec-badge">توزيع الفئات المالية</span>
      </div>
      <div class="stat-bars-list">
        ${bracketsHtml}
      </div>
    </div>
  `;
}

// ========================
// Cloud PIN & Settings Handling (Linked to Google Sheets)
// https://docs.google.com/spreadsheets/d/1puRhhC5J0f0xjTgnumjUvkujj8tUeczYAoMVaahrrOw/edit
// ========================
function getActivePin() {
  return remotePin || localStorage.getItem(PIN_KEY) || MASTER_SECURITY_PIN;
}

function initPinLock() {
  const isSessionUnlocked = sessionStorage.getItem(PIN_SESSION_KEY) === 'true';
  const screen = document.getElementById('pinLockScreen');

  updateSecurityStatusUI();

  // If already verified in this session, do not block screen
  if (isSessionUnlocked) {
    if (screen) screen.style.display = 'none';
    document.documentElement.classList.add('unlocked-session');
    return;
  }

  // FAIL-SECURE: Always enforce lock on all devices
  if (screen) {
    screen.style.display = 'flex';
  }
}

function updateSecurityStatusUI() {
  const menuText = document.getElementById('pinMenuText');
  const badge = document.getElementById('remotePinDisplayBadge');
  const activePin = getActivePin();

  if (menuText) {
    menuText.innerText = `شيت الأمان (القفل: مفعل)`;
  }

  if (badge) {
    if (remotePin) {
      badge.innerText = `مفعل من الشيت (${remotePin}) ✓`;
      badge.style.color = '#10b981';
    } else if (localStorage.getItem(PIN_KEY)) {
      badge.innerText = `مفعل مخصص (${localStorage.getItem(PIN_KEY)}) ✓`;
      badge.style.color = '#10b981';
    } else {
      badge.innerText = `الرمز الرئيسي الشامل (${MASTER_SECURITY_PIN}) ✓`;
      badge.style.color = '#10b981';
    }
  }
}

function fetchSettingsFromGoogleSheet(onDone) {
  const callbackName = 'googleSheetsSettingsCallback_' + Math.floor(Math.random() * 1000000);
  const script = document.createElement('script');

  const cleanup = () => {
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  window[callbackName] = function(json) {
    cleanup();
    try {
      parseRemoteSettings(json);
      if (typeof onDone === 'function') onDone(true, remotePin);
    } catch (e) {
      console.error('Error parsing remote settings:', e);
      if (typeof onDone === 'function') onDone(false, null);
    }
  };

  // headers=0 ensures Google Sheets doesn't hide the first row as column header names
  script.src = `https://docs.google.com/spreadsheets/d/${SETTINGS_SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&headers=0&_=${Date.now()}`;
  script.onerror = function() {
    cleanup();
    console.warn('Could not load remote settings sheet');
    if (typeof onDone === 'function') onDone(false, null);
  };

  document.head.appendChild(script);
}

function parseRemoteSettings(json) {
  isSettingsLoaded = true;
  if (!json || !json.table) return;

  const cols = json.table.cols || [];
  const rows = json.table.rows || [];

  let foundPin = null;
  let isLockExplicitlyDisabled = false;

  // 1. Inspect table columns labels (Google gviz puts row 1 here if no headers exist or single row)
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (!col) continue;
    const label = String(col.label || '').trim();
    if (!label) continue;

    // Check if label itself is a 4-digit PIN (e.g. user typed 1234 in cell A1)
    if (/^\d{4}$/.test(label)) {
      foundPin = label;
      break;
    }

    const lower = label.toLowerCase();
    if (lower === 'pin' || lower === 'رمز' || lower === 'الرمز' || lower === 'الرمز_السري' || lower === 'password' || lower === 'كلمة_المرور' || lower === 'باسورد') {
      if (cols[i + 1]) {
        const nextLabel = String(cols[i + 1].label || '').trim();
        if (/^\d{4}$/.test(nextLabel)) {
          foundPin = nextLabel;
          break;
        }
      }
    }
  }

  // 2. Inspect table rows and cells
  for (const r of rows) {
    if (!r || !r.c) continue;

    for (let cIdx = 0; cIdx < r.c.length; cIdx++) {
      const cell = r.c[cIdx];
      if (!cell) continue;
      const val = String(cell.v !== undefined ? cell.v : (cell.f || '')).trim();
      if (!val) continue;
      const valLower = val.toLowerCase();

      // Direct 4-digit PIN in early cell (A1, B1, etc.)
      if (!foundPin && /^\d{4}$/.test(val) && cIdx <= 1) {
        foundPin = val;
      }

      // Key-value pair in adjacent cells (col0="pin", col1="1234")
      if (valLower === 'pin' || valLower === 'رمز' || val === 'الرمز' || val === 'الرمز_السري' || valLower === 'password' || val === 'كلمة_المرور' || val === 'باسورد') {
        const nextCell = r.c[cIdx + 1];
        if (nextCell) {
          const nextVal = String(nextCell.v !== undefined ? nextCell.v : (nextCell.f || '')).trim();
          if (nextVal) foundPin = nextVal;
        }
      }

      // Check disable command
      if (valLower === 'lock' || val === 'قفل' || valLower === 'lock_active' || val === 'تفعيل_القفل') {
        const nextCell = r.c[cIdx + 1];
        if (nextCell) {
          const nextVal = String(nextCell.v !== undefined ? nextCell.v : (nextCell.f || '')).trim().toLowerCase();
          if (nextVal === 'false' || nextVal === '0' || nextVal === 'معطل' || nextVal === 'لا' || nextVal === 'إلغاء') {
            isLockExplicitlyDisabled = true;
          }
        }
      }

      // Webhook script URL saved in sheet
      if (valLower === 'webhook' || valLower === 'apps_script' || val === 'ويب_هوك') {
        const nextCell = r.c[cIdx + 1];
        if (nextCell) {
          const nextVal = String(nextCell.v !== undefined ? nextCell.v : (nextCell.f || '')).trim();
          if (nextVal.startsWith('http') && !localStorage.getItem(WEBHOOK_KEY)) {
            localStorage.setItem(WEBHOOK_KEY, nextVal);
          }
        }
      }
    }
  }

  // 3. Apply state
  if (foundPin && !isLockExplicitlyDisabled) {
    remotePin = foundPin;
    localStorage.setItem(PIN_KEY, foundPin);
    localStorage.setItem(PIN_REMOTE_ACTIVE_KEY, 'true');
  } else if ((rows.length > 0 || cols.some(c => c && c.label)) && (isLockExplicitlyDisabled || (foundPin === null && localStorage.getItem(PIN_REMOTE_ACTIVE_KEY) === 'true'))) {
    remotePin = null;
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(PIN_REMOTE_ACTIVE_KEY);
  }

  updateSecurityStatusUI();
  initPinLock();
}

function pressPin(digit) {
  if (enteredPin.length < 4) {
    enteredPin += digit;
    updatePinDots();
  }

  if (enteredPin.length === 4) {
    setTimeout(verifyPin, 100);
  }
}

function deletePin() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
}

function updatePinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dot${i}`);
    if (dot) {
      if (i <= enteredPin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

function verifyPin() {
  const activePin = getActivePin();
  if (enteredPin === activePin) {
    sessionStorage.setItem(PIN_SESSION_KEY, 'true');
    document.documentElement.classList.add('unlocked-session');
    const screen = document.getElementById('pinLockScreen');
    if (screen) screen.style.display = 'none';
    clearPin();
    showToast('تم التحقق وإلغاء القفل بنجاح');
    logHistory('تسجيل دخول', 'مستخدم النظام', 'تم إدخال الرمز السري بنجاح');
  } else {
    showToast('الرمز السري غير صحيح');
    clearPin();
  }
}

async function changeMasterPin() {
  closeSecurityModal();
  const currentPin = getActivePin();
  const newPin = await showCustomPrompt({
    title: 'تغيير الرمز السري للتطبيق',
    message: `الرمز السري الحالي هو (${currentPin}). أدخل الرمز الجديد المكون من 4 أرقام:`,
    placeholder: '••••',
    inputType: 'password',
    confirmText: 'حفظ الرمز',
    cancelText: 'إلغاء'
  });

  if (newPin && newPin.trim().length === 4 && /^\d{4}$/.test(newPin.trim())) {
    const val = newPin.trim();
    localStorage.setItem(PIN_KEY, val);
    sessionStorage.setItem(PIN_SESSION_KEY, 'true');
    syncSettingsToSheet('set_pin', { pin: val });
    updateSecurityStatusUI();
    showToast(`تم تغيير الرمز السري بنجاح إلى: ${val}`);
  } else if (newPin) {
    showToast('يجب أن يتكون الرمز من 4 أرقام');
  }
}

function openPinSetupModal() {
  openSecurityModal();
}

function openSecurityModal() {
  closeMenuDropdown();
  const input = document.getElementById('securityWebhookInput');
  if (input) input.value = localStorage.getItem(WEBHOOK_KEY) || '';
  updateSecurityStatusUI();
  const modal = document.getElementById('securityModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeSecurityModal() {
  const modal = document.getElementById('securityModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openSettingsSheetDirect() {
  window.open(`https://docs.google.com/spreadsheets/d/${SETTINGS_SPREADSHEET_ID}/edit`, '_blank');
}

function refreshRemotePinNow() {
  showToast('جاري فحص شيت الأمان...');
  const badge = document.getElementById('remotePinDisplayBadge');
  if (badge) badge.innerText = 'جاري الفحص...';

  fetchSettingsFromGoogleSheet((success, pin) => {
    if (success) {
      if (pin) {
        showToast(`تم اكتشاف رمز سري من الشيت: ${pin}`);
      } else {
        showToast('تم فحص الشيت: لا يوجد رمز حالياً (الشيت فارغ)');
      }
    } else {
      showToast('تعذر الاتصال بشيت الأمان، تحقق من الإنترنت');
    }
    updateSecurityStatusUI();
  });
}

function copySecurityScriptCode() {
  const block = document.getElementById('securityScriptCodeBlock');
  if (!block) return;
  navigator.clipboard.writeText(block.innerText).then(() => {
    showToast('تم نسخ كود Apps Script لشيت الأمان بنجاح');
  }).catch(() => {
    showToast('تعذر النسخ، يرجى تحديده يدوياً');
  });
}

function saveSecuritySettings() {
  const input = document.getElementById('securityWebhookInput');
  if (input) {
    const val = input.value.trim();
    if (val) {
      localStorage.setItem(WEBHOOK_KEY, val);
      showToast('تم حفظ رابط خدمة الويب (Apps Script) بنجاح');
    } else {
      localStorage.removeItem(WEBHOOK_KEY);
      showToast('تم إزالة رابط خدمة الويب');
    }
  }
  closeSecurityModal();
}

async function syncSettingsToSheet(action, payload) {
  const webhookUrl = localStorage.getItem(WEBHOOK_KEY);
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        settingsSheetId: SETTINGS_SPREADSHEET_ID,
        ...payload
      })
    });
  } catch (err) {
    console.error('Settings sync error:', err);
  }
}

// ========================
// History / Audit Log
// ========================
function logHistory(action, name, details) {
  try {
    let history = [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) history = JSON.parse(raw);

    const entry = {
      action,
      name,
      details,
      timestamp: new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
    };

    history.unshift(entry);

    if (history.length > 50) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    syncSettingsToSheet('audit_log', {
      timestamp: entry.timestamp,
      type: entry.action,
      name: entry.name,
      details: entry.details
    });
  } catch (e) {
    console.error(e);
  }
}

function openHistoryModal() {
  closeMenuDropdown();
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  let history = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) history = JSON.parse(raw);
  } catch (e) {}

  if (history.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد تعديلات مسجلة حتى الآن</p>';
  } else {
    let html = '';
    history.forEach(h => {
      html += `
        <div class="history-item">
          <div class="history-item-top">
            <span>${escapeHtml(h.action)}: ${escapeHtml(h.name)}</span>
            <span class="history-item-time">${escapeHtml(h.timestamp)}</span>
          </div>
          <div class="history-item-desc">${escapeHtml(h.details)}</div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  document.getElementById('historyModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function clearHistoryLog() {
  const confirmed = await showCustomConfirm({
    title: 'مسح سجل التعديلات',
    message: 'هل أنت متأكد من مسح سجل التعديلات والعمليات السابقة بالكامل؟',
    confirmText: 'مسح السجل',
    cancelText: 'إلغاء',
    isDanger: true
  });
  if (confirmed) {
    localStorage.removeItem(HISTORY_KEY);
    openHistoryModal();
    showToast('تم مسح السجل');
  }
}

// ========================
// Printable Official Table (A4 Exact Google Sheet Replica)
// ========================
function printOfficialTable() {
  closeMenuDropdown();
  const tbody = document.getElementById('printTableBody');
  const tfoot = document.getElementById('printTableFoot');
  const dateMeta = document.getElementById('printMetaDate');
  const countMeta = document.getElementById('printMetaCount');
  const filtered = getFilteredAndSortedData();

  if (dateMeta) {
    dateMeta.innerText = `التاريخ: ${new Date().toLocaleDateString('ar-EG')}`;
  }
  if (countMeta) {
    countMeta.innerText = `عدد الأعضاء بالكشف: ${filtered.length}`;
  }

  let totalBefore = 0;
  let totalAllowance = 0;
  let totalBonus10 = 0;
  let totalAfter = 0;

  if (tbody) {
    let html = '';
    filtered.forEach((item) => {
      const b = parseNumber(item.salaryBefore);
      const a = parseNumber(item.allowance);
      const bonus = parseNumber(item.bonus10);
      const aft = parseNumber(item.salaryAfter);

      totalBefore += b;
      totalAllowance += a;
      totalBonus10 += bonus;
      totalAfter += aft;

      html += `
        <tr>
          <td>${item.id}</td>
          <td class="name-cell">${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.job)}</td>
          <td>${formatNumber(b, 2)}</td>
          <td>${formatNumber(a, 2)}</td>
          <td>${formatNumber(bonus, 2)}</td>
          <td class="salary-cell">${formatNumber(aft, 2)}</td>
          <td></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: right; padding-right: 12px; font-weight: bold;">الإجمالي العام لجميع السادة أعضاء هيئة التدريس:</td>
        <td style="font-weight: bold;">${formatNumber(totalBefore, 2)}</td>
        <td style="font-weight: bold;">${formatNumber(totalAllowance, 2)}</td>
        <td style="font-weight: bold;">${formatNumber(totalBonus10, 2)}</td>
        <td class="salary-cell" style="font-weight: bold;">${formatNumber(totalAfter, 2)}</td>
        <td></td>
      </tr>
    `;
  }

  setTimeout(() => {
    window.print();
  }, 100);
}

// ========================
// Export & Import Tools
// ========================
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    exportToCSV();
    return;
  }

  const exportData = employees.map(item => ({
    'م': item.id,
    'الاسم الكامل': item.name,
    'الوظيفة': item.job,
    'المرتب قبل 2015/7/1': parseNumber(item.salaryBefore),
    'العلاوة الدورية': parseNumber(item.allowance),
    'الـ 10% في 2015/6/30': parseNumber(item.bonus10),
    'المرتب في 2015/7/1': parseNumber(item.salaryAfter)
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'رواتب كلية الطب');
  XLSX.writeFile(workbook, `كشف_رواتب_كلية_الطب_جامعة_الزقازيق_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('تم تصدير ملف Excel بنجاح');
  closeMenuDropdown();
}

function exportToCSV() {
  let csvContent = '\uFEFFم,الاسم,الوظيفة,المرتب قبل 2015/7/1,العلاوة الدورية,الـ 10% في 2015/6/30,المرتب في 2015/7/1\n';

  employees.forEach(item => {
    csvContent += `"${item.id}","${item.name}","${item.job}","${item.salaryBefore}","${item.allowance}","${item.bonus10}","${item.salaryAfter}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `كشف_الرواتب_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('تم تصدير ملف CSV بنجاح');
  closeMenuDropdown();
}

function importFileTrigger() {
  document.getElementById('fileInput').click();
  closeMenuDropdown();
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

  if (isExcel && typeof XLSX !== 'undefined') {
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
        
        const imported = rows.map((r, i) => ({
          id: r['م'] || (i + 1),
          name: r['الاسم'] || '',
          job: r['الوظيفة'] || 'أستاذ',
          salaryBefore: parseNumber(r['المرتب قبل 2015/7/1']),
          allowance: parseNumber(r['العلاوة الدورية']),
          bonus10: parseNumber(r['الـ 10% في 2015/6/30']),
          salaryAfter: parseNumber(r['المرتب في 2015/7/1'])
        })).filter(x => x.name);

        if (imported.length > 0) {
          employees = imported;
          logHistory('استيراد ملف', file.name, `استيراد ${imported.length} سجل`);
          saveDataLocally();
          renderApp();
          showToast(`تم استيراد ${imported.length} سجل بنجاح`);
        }
      } catch (err) {
        showToast('خطأ أثناء قراءة ملف Excel');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = function(evt) {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const imported = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
          if (cols.length >= 2 && cols[1]) {
            imported.push({
              id: parseInt(cols[0], 10) || i,
              name: cols[1],
              job: cols[2] || 'أستاذ',
              salaryBefore: parseNumber(cols[3]),
              allowance: parseNumber(cols[4]),
              bonus10: parseNumber(cols[5]),
              salaryAfter: parseNumber(cols[6])
            });
          }
        }
        if (imported.length > 0) {
          employees = imported;
          logHistory('استيراد ملف', file.name, `استيراد ${imported.length} سجل`);
          saveDataLocally();
          renderApp();
          showToast(`تم استيراد ${imported.length} سجل بنجاح`);
        }
      } catch (err) {
        showToast('خطأ أثناء قراءة ملف CSV');
      }
    };
    reader.readAsText(file);
  }

  e.target.value = '';
}

async function resetToDefault() {
  closeMenuDropdown();
  const confirmed = await showCustomConfirm({
    title: 'استعادة بيانات الشيت الأصلية',
    message: 'سيتم مسح أي تعديلات محلية تم حفظها وإعادة جلب أحدث بيانات مباشرة من شيت جوجل.',
    confirmText: 'استعادة وجلب لايف',
    cancelText: 'إلغاء',
    isDanger: true
  });
  if (confirmed) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MODIFIED_KEY);
    fetchLiveFromGoogleSheet(true);
  }
}

// ========================
// UI Events Setup
// ========================
function setupEventListeners() {
  // Sync button
  document.getElementById('syncLiveBtn').addEventListener('click', () => {
    fetchLiveFromGoogleSheet(true);
  });

  // Privacy toggle
  document.getElementById('privacyToggleBtn').addEventListener('click', togglePrivacyMode);

  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  // Search input
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClearBtn');

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery.trim().length > 0) {
      clearBtn.classList.add('active');
    } else {
      clearBtn.classList.remove('active');
    }
    renderApp();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.remove('active');
    searchInput.focus();
    renderApp();
  });

  // Sort select
  // FAB Add
  document.getElementById('fabAdd').addEventListener('click', openAddModal);

  // Modal close handlers
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') {
      closeModal();
    }
  });

  // Modal form submit
  document.getElementById('personForm').addEventListener('submit', handleSavePerson);
  document.getElementById('deleteBtnModal').addEventListener('click', () => {
    if (editingId) confirmDeletePerson(editingId);
  });

  // Auto calculate inputs
  ['fieldSalaryBefore', 'fieldAllowance', 'fieldBonus10'].forEach(id => {
    document.getElementById(id).addEventListener('input', calculateSalaryFromInputs);
  });

  document.getElementById('autoCalcToggle').addEventListener('change', (e) => {
    autoCalculate = e.target.checked;
    if (autoCalculate) calculateSalaryFromInputs();
  });

  // Dropdown Action Sheet Menu
  const menuBtn = document.getElementById('menuBtn');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenuDropdown();
  });

  // File import input
  document.getElementById('fileInput').addEventListener('change', handleFileImport);
}

// ========================
// iOS Action Sheet & Sort Sheet Handlers
// ========================
function openMenuDropdown() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) {
    menu.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeMenuDropdown() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) {
    menu.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openSortSheet() {
  document.getElementById('sortSheet').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSortSheet() {
  document.getElementById('sortSheet').classList.remove('active');
  document.body.style.overflow = '';
}

function selectSortOption(sortKey, sortLabel) {
  currentSort = sortKey;
  const labelEl = document.getElementById('currentSortLabel');
  if (labelEl) labelEl.innerText = sortLabel;

  document.querySelectorAll('.sort-option-row').forEach(row => {
    if (row.getAttribute('data-sort') === sortKey) {
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }
  });

  closeSortSheet();
  renderApp();
  showToast(`تم الترتيب حسب: ${sortLabel}`);
}

// ========================
// Helpers
// ========================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}


// ========================
// Google Sheet Live Webhook Sync
// ========================
function openGoogleSheetDirect() {
  closeMenuDropdown();
  window.open('https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit', '_blank');
}

function openWebhookSetupModal() {
  closeMenuDropdown();
  const input = document.getElementById('webhookUrlInput');
  const savedUrl = localStorage.getItem(WEBHOOK_KEY) || '';
  if (input) input.value = savedUrl;
  const modal = document.getElementById('webhookModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeWebhookSetupModal() {
  const modal = document.getElementById('webhookModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function saveWebhookUrl() {
  const input = document.getElementById('webhookUrlInput');
  if (!input) return;
  const url = input.value.trim();
  if (url) {
    localStorage.setItem(WEBHOOK_KEY, url);
    showToast('تم حفظ رابط الويب هوك بنجاح');
  } else {
    localStorage.removeItem(WEBHOOK_KEY);
    showToast('تم إلغاء تفعيل الويب هوك');
  }
  closeWebhookSetupModal();
}

function copyAppsScriptCode() {
  const codeEl = document.getElementById('appsScriptCodeText');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.innerText).then(() => {
    showToast('تم نسخ كود المزامنة بنجاح');
  }).catch(() => {
    showToast('تعذر النسخ، يرجى تحديده يدوياً');
  });
}

async function syncRecordToGoogleSheet(action, record) {
  const webhookUrl = localStorage.getItem(WEBHOOK_KEY);
  if (!webhookUrl) return;

  try {
    const payload = JSON.stringify({
      action: action,
      sheetId: SPREADSHEET_ID,
      data: record
    });

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload
    });

    showToast('تم إرسال التحديث لشيت جوجل السحابي');
  } catch (err) {
    console.error('Webhook sync error:', err);
    showToast('تعذر الاتصال بـ Google Apps Script');
  }
}


// ========================
// Custom Confirm & Prompt Dialogs
// ========================
let dialogResolve = null;

function showCustomConfirm({ title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', isDanger = false }) {
  return new Promise((resolve) => {
    dialogResolve = resolve;
    const modal = document.getElementById('customDialogModal');
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const inputWrap = document.getElementById('dialogInputWrap');
    const confirmBtn = document.getElementById('dialogConfirmBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');
    const iconBox = document.getElementById('dialogIconBox');
    const iconSvg = document.getElementById('dialogIcon');

    if (!modal) {
      resolve(confirm(message));
      return;
    }

    titleEl.innerText = title || 'تأكيد الإجراء';
    msgEl.innerText = message || '';
    inputWrap.style.display = 'none';
    confirmBtn.innerText = confirmText;
    cancelBtn.innerText = cancelText;

    if (isDanger) {
      confirmBtn.className = 'dialog-btn dialog-confirm-btn danger';
      iconBox.className = 'custom-dialog-icon-box danger';
      iconSvg.innerHTML = '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    } else {
      confirmBtn.className = 'dialog-btn dialog-confirm-btn primary';
      iconBox.className = 'custom-dialog-icon-box';
      iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    }

    confirmBtn.onclick = () => closeCustomDialog(true);
    cancelBtn.onclick = () => closeCustomDialog(false);

    modal.classList.add('active');
  });
}

function showCustomPrompt({ title, message, defaultValue = '', placeholder = '', inputType = 'text', confirmText = 'موافق', cancelText = 'إلغاء' }) {
  return new Promise((resolve) => {
    dialogResolve = resolve;
    const modal = document.getElementById('customDialogModal');
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const inputWrap = document.getElementById('dialogInputWrap');
    const input = document.getElementById('dialogInput');
    const confirmBtn = document.getElementById('dialogConfirmBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');
    const iconBox = document.getElementById('dialogIconBox');
    const iconSvg = document.getElementById('dialogIcon');

    if (!modal) {
      resolve(prompt(message, defaultValue));
      return;
    }

    titleEl.innerText = title || 'إدخال بيانات';
    msgEl.innerText = message || '';
    inputWrap.style.display = 'block';
    input.type = inputType;
    input.value = defaultValue;
    input.placeholder = placeholder;
    confirmBtn.innerText = confirmText;
    cancelBtn.innerText = cancelText;

    confirmBtn.className = 'dialog-btn dialog-confirm-btn primary';
    iconBox.className = 'custom-dialog-icon-box';
    iconSvg.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';

    confirmBtn.onclick = () => {
      const val = input.value;
      closeCustomDialog(val);
    };
    cancelBtn.onclick = () => closeCustomDialog(null);

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    };

    modal.classList.add('active');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 120);
  });
}

function closeCustomDialog(result) {
  const modal = document.getElementById('customDialogModal');
  if (modal) modal.classList.remove('active');
  if (dialogResolve) {
    dialogResolve(result);
    dialogResolve = null;
  }
}

// Global Keyboard Handler for Modals (ESC to close)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMenuDropdown();
    closeSortSheet();
    closeCustomDialog(false);
  }
});
