/**
 * نظام إدارة وبحث كشف الرواتب - قراءة حية وميزات متقدمة للهاتف المحمول
 * https://docs.google.com/spreadsheets/d/1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w/edit
 */

// ========================
// Configuration & Keys
// ========================
const SPREADSHEET_ID = '1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w';
const STORAGE_KEY = 'payroll_sheet_data_v1';
const THEME_KEY = 'payroll_theme_mode';
const MODIFIED_KEY = 'payroll_has_local_edits';
const FAVORITES_KEY = 'payroll_favorites_v1';
const PRIVACY_KEY = 'payroll_privacy_mask';
const PIN_KEY = 'payroll_app_pin';
const HISTORY_KEY = 'payroll_history_log_v1';

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
  showToast(isPrivacyMasked ? 'تم تفعيل وضع الخصوصية (إخفاء المبالغ 👁️)' : 'تم إظهار المبالغ');
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
    showToast('تم التثبيت في المفضلة ⭐');
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
    icon.innerText = '⭐';
    text.innerText = 'مثبت بالمفضلة';
    btn.style.color = '#eab308';
  } else {
    icon.innerText = '☆';
    text.innerText = 'إضافة للمفضلة';
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
      showToast('تحدث الآن... انطق اسم الدكتور 🎙️');
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
          showToast(`تم تحديث البيانات لايف (${liveList.length} شخص) 🟢`);
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
    } else if (typeof INITIAL_DATA !== 'undefined') {
      employees = [...INITIAL_DATA];
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
    const starIcon = isFav ? '⭐' : '☆';
    const starClass = isFav ? 'fav-star-btn active' : 'fav-star-btn';

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
          <button class="${starClass}" title="تثبيت في المفضلة" onclick="toggleFavorite(${item.id}, event)">
            ${starIcon}
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
      logHistory('تعديل', name, `المرتب: ${old.salaryAfter} ج.م ➔ ${salaryAfter} ج.م`);
      employees[idx] = newRecord;
      showToast('تم حفظ التعديل بنجاح ✅');
    }
  } else {
    employees.push(newRecord);
    logHistory('إضافة جديد', name, `المرتب الصافي: ${salaryAfter} ج.م`);
    showToast('تمت إضافة الشخص بنجاح ✅');
  }

  saveDataLocally();
  closeModal();
  renderApp();
}

function confirmDeletePerson(id) {
  const item = employees.find(e => e.id === id);
  if (!item) return;

  if (confirm(`هل أنت متأكد من حذف (${item.name}) من الكشف؟`)) {
    logHistory('حذف', item.name, `مسلسل #${item.id}`);
    employees = employees.filter(e => e.id !== id);
    saveDataLocally();
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
*دليل كشف رواتب هيئة التدريس* 📋
👤 *الاسم:* ${item.name}
💼 *الوظيفة:* ${item.job}
💵 *المرتب قبل 2015/7/1:* ${item.salaryBefore} ج.م
📈 *العلاوة الدورية:* ${item.allowance} ج.م
✨ *الـ 10% في 2015/6/30:* ${item.bonus10} ج.م
💰 *المرتب الصافي في 2015/7/1:* ${item.salaryAfter} ج.م
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
    showToast('تم نسخ مفردات الراتب للحافظة 📋');
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

function applySimulationToData() {
  const type = document.getElementById('simType').value;
  const val = parseNumber(document.getElementById('simValue').value);
  const targetJob = document.getElementById('simTargetJob').value;

  if (val <= 0) {
    showToast('يرجى تحديد قيمة صالحة للزيادة');
    return;
  }

  const desc = type === 'percent' ? `${val}%` : `${val} ج.م`;
  if (!confirm(`هل أنت متأكد من تطبيق زيادة (${desc}) على ${targetJob === 'الكل' ? 'كافة الأعضاء' : targetJob}؟`)) {
    return;
  }

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
  showToast('تم تطبيق الزيادات على الكشف بنجاح 🎉');
}

// ========================
// Comparison Tool
// ========================
function openCompareModal() {
  closeMenuDropdown();
  populateCompareDropdowns();
  updateComparison();
  document.getElementById('compareModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('active');
  document.body.style.overflow = '';
}

function populateCompareDropdowns() {
  const s1 = document.getElementById('compareSelect1');
  const s2 = document.getElementById('compareSelect2');
  if (!s1 || !s2) return;

  let opts = '';
  employees.forEach((item, i) => {
    opts += `<option value="${item.id}">${item.name} (${item.job})</option>`;
  });
  s1.innerHTML = opts;
  s2.innerHTML = opts;

  if (employees.length >= 2) {
    s1.value = employees[0].id;
    s2.value = employees[1].id;
  }
}

function updateComparison() {
  const id1 = parseInt(document.getElementById('compareSelect1').value, 10);
  const id2 = parseInt(document.getElementById('compareSelect2').value, 10);
  const p1 = employees.find(e => e.id === id1);
  const p2 = employees.find(e => e.id === id2);
  const container = document.getElementById('compareResultsWrap');

  if (!p1 || !p2 || !container) return;

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
      <div class="compare-name">${p1.name}</div>
      <div class="compare-row"><span>الوظيفة</span><span>${p1.job}</span></div>
      <div class="compare-row"><span>المرتب قبل</span><span>${formatNumber(p1.salaryBefore, 2)} ج.م</span></div>
      <div class="compare-row"><span>العلاوة</span><span>${formatNumber(p1.allowance, 2)} ج.م</span></div>
      <div class="compare-row"><span>الـ 10%</span><span>${formatNumber(p1.bonus10, 2)} ج.م</span></div>
      <div class="compare-row" style="border-top:1px solid #ccc; font-weight:bold; color:var(--accent-blue)">
        <span>الصافي النهائي</span><span>${formatNumber(p1.salaryAfter, 2)} ج.م</span>
      </div>
    </div>

    <div class="compare-card">
      <div class="compare-name">${p2.name}</div>
      <div class="compare-row"><span>الوظيفة</span><span>${p2.job}</span></div>
      <div class="compare-row"><span>المرتب قبل</span><span>${formatNumber(p2.salaryBefore, 2)} ج.م</span></div>
      <div class="compare-row"><span>العلاوة</span><span>${formatNumber(p2.allowance, 2)} ج.م</span></div>
      <div class="compare-row"><span>الـ 10%</span><span>${formatNumber(p2.bonus10, 2)} ج.م</span></div>
      <div class="compare-row" style="border-top:1px solid #ccc; font-weight:bold; color:var(--accent-blue)">
        <span>الصافي النهائي</span><span>${formatNumber(p2.salaryAfter, 2)} ج.م</span>
      </div>
    </div>

    <div class="compare-diff-banner">${diffText}</div>
  `;
}

// ========================
// PIN Lock Handling
// ========================
function initPinLock() {
  const pin = localStorage.getItem(PIN_KEY);
  const screen = document.getElementById('pinLockScreen');
  const menuText = document.getElementById('pinMenuText');

  if (menuText) {
    menuText.innerText = pin ? 'إلغاء / تغيير القفل السري' : 'تفعيل قفل التطبيق (PIN)';
  }

  if (pin && screen) {
    screen.style.display = 'flex';
  } else if (screen) {
    screen.style.display = 'none';
  }
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
  const realPin = localStorage.getItem(PIN_KEY);
  if (enteredPin === realPin) {
    document.getElementById('pinLockScreen').style.display = 'none';
    clearPin();
    showToast('تم إلغاء القفل بنجاح 🔓');
  } else {
    showToast('الرمز السري غير صحيح ❌');
    clearPin();
  }
}

function openPinSetupModal() {
  closeMenuDropdown();
  const currentPin = localStorage.getItem(PIN_KEY);

  if (currentPin) {
    if (confirm('هل تريد إلغاء القفل السري للتطبيق؟')) {
      localStorage.removeItem(PIN_KEY);
      initPinLock();
      showToast('تم إلغاء القفل السري بنجاح');
    }
  } else {
    const newPin = prompt('أدخل رمز سري جديد من 4 أرقام:');
    if (newPin && newPin.trim().length === 4 && /^\d{4}$/.test(newPin.trim())) {
      localStorage.setItem(PIN_KEY, newPin.trim());
      initPinLock();
      showToast('تم تفعيل القفل السري بنجاح 🔒');
    } else if (newPin) {
      showToast('يجب أن يتكون الرمز من 4 أرقام');
    }
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

    history.unshift({
      action,
      name,
      details,
      timestamp: new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
    });

    if (history.length > 50) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
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

function clearHistoryLog() {
  if (confirm('هل تريد مسح سجل التعديلات بالكامل؟')) {
    localStorage.removeItem(HISTORY_KEY);
    openHistoryModal();
    showToast('تم مسح السجل');
  }
}

// ========================
// Printable Official Table
// ========================
function printOfficialTable() {
  closeMenuDropdown();
  const tbody = document.getElementById('printTableBody');
  const dateMeta = document.getElementById('printMetaDate');
  const filtered = getFilteredAndSortedData();

  if (dateMeta) {
    dateMeta.innerText = `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} - إجمالي الأعضاء: ${filtered.length}`;
  }

  if (tbody) {
    let html = '';
    filtered.forEach((item, index) => {
      html += `
        <tr>
          <td>${item.id}</td>
          <td>${item.name}</td>
          <td>${item.job}</td>
          <td>${formatNumber(item.salaryBefore, 2)}</td>
          <td>${formatNumber(item.allowance, 2)}</td>
          <td>${formatNumber(item.bonus10, 2)}</td>
          <td style="font-weight:bold;">${formatNumber(item.salaryAfter, 2)}</td>
          <td style="width:120px;"></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  window.print();
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
    'الاسم': item.name,
    'الوظيفة': item.job,
    'المرتب قبل 2015/7/1': item.salaryBefore,
    'العلاوة الدورية': item.allowance,
    'الـ 10% في 2015/6/30': item.bonus10,
    'المرتب في 2015/7/1': item.salaryAfter
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الرواتب');
  XLSX.writeFile(workbook, `كشف_الرواتب_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('تم تصدير ملف Excel بنجاح 📊');
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
  showToast('تم تصدير ملف CSV بنجاح 📄');
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
          showToast(`تم استيراد ${imported.length} سجل بنجاح! 🎉`);
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
          showToast(`تم استيراد ${imported.length} سجل بنجاح! 🎉`);
        }
      } catch (err) {
        showToast('خطأ أثناء قراءة ملف CSV');
      }
    };
    reader.readAsText(file);
  }

  e.target.value = '';
}

function resetToDefault() {
  closeMenuDropdown();
  if (confirm('هل تريد إعادة جلب البيانات الحديثة من شيت جوجل ومسح أي تعديلات محلية؟')) {
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
