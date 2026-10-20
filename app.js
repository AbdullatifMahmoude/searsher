/**
 * نظام إدارة وبحث كشف الرواتب - قراءة حية (Live) مباشرة من شيت جوجل
 * https://docs.google.com/spreadsheets/d/1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w/edit
 */

// ========================
// Configuration & State
// ========================
const SPREADSHEET_ID = '1U9OzDrClCT5YPasb8JyioYcG-JRLAH5-vCxRJtoGA2w';
const STORAGE_KEY = 'payroll_sheet_data_v1';
const THEME_KEY = 'payroll_theme_mode';
const MODIFIED_KEY = 'payroll_has_local_edits';

let employees = [];
let currentFilter = 'الكل';
let searchQuery = '';
let currentSort = 'id-asc';
let autoCalculate = true;
let editingId = null;
let isFetchingLive = false;

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
 * يستبعد: أ.د/، د/، أ.م.د/، م.د/، د./، أ/، م/، دكتور/، الأستاذ الدكتور/ إلخ
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
// Initialization & Live Fetch
// ========================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  
  // 1. First load cached data for instant display (no blank screen)
  loadCachedData();
  renderApp();

  // 2. Then immediately fetch LIVE data directly from Google Sheets
  fetchLiveFromGoogleSheet(false);
});

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
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  } else {
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
}

/**
 * جلب البيانات لايف وبشكل مباشر من شيت جوجل عبر Google Visualization API JSONP
 * ميزة JSONP أنها تعمل 100% دون قيود CORS وتعمل مباشرة في أي متصفح هاتف أو كمبيوتر
 */
function fetchLiveFromGoogleSheet(isManual = false) {
  if (isFetchingLive) return;
  isFetchingLive = true;

  const syncIcon = document.getElementById('syncIcon');
  const liveDot = document.getElementById('liveDot');
  const liveStatusText = document.getElementById('liveStatusText');

  if (syncIcon) syncIcon.classList.add('spinning');
  if (liveDot) {
    liveDot.className = 'live-dot';
  }
  if (liveStatusText) {
    liveStatusText.innerText = 'جاري القراءة لايف من شيت جوجل...';
  }

  const callbackName = 'gvizCallback_' + Date.now();
  const script = document.createElement('script');
  let isDone = false;

  const timer = setTimeout(() => {
    if (isDone) return;
    cleanup();
    handleFetchError('تعذر الاتصال بشيت جوجل (انتهت المهلة)');
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
        
        if (liveDot) liveDot.className = 'live-dot online';
        if (liveStatusText) liveStatusText.innerText = 'متصل لايف بالشيت (مُحدّث الآن)';
        
        renderApp();
        if (isManual) {
          showToast(`تم تحديث البيانات لايف (${liveList.length} شخص) 🟢`);
        }
      } else {
        throw new Error('لم يتم العثور على صفوف بيانات');
      }
    } catch (err) {
      console.error('Error parsing live sheet data:', err);
      handleFetchError('خطأ أثناء قراءة بيانات الشيت');
    }
  };

  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&_=${Date.now()}`;
  script.onerror = function() {
    cleanup();
    handleFetchError('تعذر تحميل الشيت (تحقق من الإنترنت)');
  };

  document.head.appendChild(script);
}

function handleFetchError(msg) {
  const liveDot = document.getElementById('liveDot');
  const liveStatusText = document.getElementById('liveStatusText');

  if (liveDot) liveDot.className = 'live-dot offline';
  if (liveStatusText) {
    liveStatusText.innerText = 'يعمل بالذاكرة المؤقتة (دون إنترنت)';
  }
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
    console.error('Error loading cache:', e);
  }
}

function saveDataLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
    localStorage.setItem(MODIFIED_KEY, 'true');
    const liveStatusText = document.getElementById('liveStatusText');
    if (liveStatusText) {
      liveStatusText.innerText = 'محفوظ محلياً (يحتوي على تعديلاتك)';
    }
  } catch (e) {
    console.error('Error saving local data:', e);
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
  let maxSalary = 0;

  filtered.forEach(item => {
    const s = parseNumber(item.salaryAfter);
    totalSalary += s;
    if (s > maxSalary) maxSalary = s;
  });

  const totalCountEl = document.getElementById('statTotalCount');
  if (totalCountEl) totalCountEl.innerText = formatNumber(totalCount, 0);

  const resultsCountEl = document.getElementById('resultsCount');
  if (resultsCountEl) {
    if (searchQuery || currentFilter !== 'الكل') {
      resultsCountEl.innerHTML = `تم العثور على <span>${totalCount}</span> من أصل ${employees.length}`;
    } else {
      resultsCountEl.innerHTML = `عرض <span>${totalCount}</span> عضو • إجمالي الرواتب <span>${formatNumber(totalSalary, 0)} ج.م</span>`;
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
          <div class="card-salary-block">
            <span class="card-salary-num">${formatNumber(item.salaryAfter, 2)}</span>
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
  document.getElementById('modalTitle').innerText = 'إضافة شخص جديد للكشف';
  document.getElementById('deleteBtnModal').style.display = 'none';

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
  document.getElementById('modalTitle').innerText = `تعديل بيانات: ${item.name}`;
  document.getElementById('deleteBtnModal').style.display = 'inline-flex';

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
      employees[idx] = newRecord;
      showToast('تم حفظ التعديل محلياً ✅');
    }
  } else {
    employees.push(newRecord);
    showToast('تمت إضافة الشخص محلياً ✅');
  }

  saveDataLocally();
  closeModal();
  renderApp();
}

function confirmDeletePerson(id) {
  const item = employees.find(e => e.id === id);
  if (!item) return;

  if (confirm(`هل أنت متأكد من حذف (${item.name}) من الكشف؟`)) {
    employees = employees.filter(e => e.id !== id);
    saveDataLocally();
    if (editingId === id) closeModal();
    renderApp();
    showToast('تم حذف السجل بنجاح');
  }
}

function copyPersonData(id) {
  const item = employees.find(e => e.id === id);
  if (!item) return;

  const text = `
الاسم: ${item.name}
الوظيفة: ${item.job}
المرتب قبل 2015/7/1: ${item.salaryBefore} ج.م
العلاوة الدورية: ${item.allowance} ج.م
الـ 10% في 2015/6/30: ${item.bonus10} ج.م
المرتب في 2015/7/1: ${item.salaryAfter} ج.م
  `.trim();

  navigator.clipboard.writeText(text).then(() => {
    showToast('تم نسخ بيانات الشخص للحافظة 📋');
  }).catch(() => {
    showToast('تعذر نسخ البيانات');
  });
}

// ========================
// Export & Import Tools
// ========================
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('جاري التصدير بصيغة CSV...');
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
  let csvContent = '\uFEFF';
  csvContent += 'م,الاسم,الوظيفة,المرتب قبل 2015/7/1,العلاوة الدورية,الـ 10% في 2015/6/30,المرتب في 2015/7/1\n';

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
          saveDataLocally();
          renderApp();
          showToast(`تم استيراد ${imported.length} سجل بنجاح! 🎉`);
        } else {
          showToast('لم يتم العثور على بيانات صالحة');
        }
      } catch (err) {
        console.error(err);
        showToast('خطأ أثناء قراءة ملف Excel');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = function(evt) {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length <= 1) {
          showToast('الملف فارغ أو غير صالح');
          return;
        }

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
          saveDataLocally();
          renderApp();
          showToast(`تم استيراد ${imported.length} سجل بنجاح! 🎉`);
        }
      } catch (err) {
        console.error(err);
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

function printReport() {
  closeMenuDropdown();
  window.print();
}

// ========================
// UI Events Setup
// ========================
function setupEventListeners() {
  // Sync Live Button
  document.getElementById('syncLiveBtn').addEventListener('click', () => {
    fetchLiveFromGoogleSheet(true);
  });

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
  const sortSelect = document.getElementById('sortSelect');
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderApp();
  });

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

  // Dropdown menu
  const menuBtn = document.getElementById('menuBtn');
  const dropdownMenu = document.getElementById('dropdownMenu');

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    closeMenuDropdown();
  });

  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // File import input
  document.getElementById('fileInput').addEventListener('change', handleFileImport);
}

function closeMenuDropdown() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.remove('active');
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
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}
