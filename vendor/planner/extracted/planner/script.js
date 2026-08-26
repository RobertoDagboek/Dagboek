/* ===================== Spring engine ===================== */
class Spring {
  constructor(value, { dampingRatio = 1, response = 0.3 } = {}) {
    this.value = value; this.velocity = 0; this.target = value;
    this.dampingRatio = dampingRatio; this.response = response; this.active = false;
  }
  set(target, velocity) { this.target = target; if (velocity !== undefined) this.velocity = velocity; this.active = true; }
  snap(value) { this.value = value; this.target = value; this.velocity = 0; this.active = false; }
  step(dt) {
    const omega = 2 * Math.PI / this.response;
    const k = omega * omega, c = 2 * this.dampingRatio * omega;
    const accel = -k * (this.value - this.target) - c * this.velocity;
    this.velocity += accel * dt; this.value += this.velocity * dt;
    if (Math.abs(this.value - this.target) < 0.01 && Math.abs(this.velocity) < 0.01) { this.value = this.target; this.velocity = 0; this.active = false; }
    return this.value;
  }
}
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function runSpring(spring, onUpdate, onDone) {
  if (REDUCE_MOTION) { spring.snap(spring.target); onUpdate(spring.value); if (onDone) onDone(); return; }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.032); last = now;
    spring.step(dt); onUpdate(spring.value);
    if (spring.active) requestAnimationFrame(frame); else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}
function project(v, decel = 0.998) { return (v / 1000) * decel / (1 - decel); }
function rubberband(overshoot, dimension, constant = 0.55) {
  const sign = overshoot < 0 ? -1 : 1, o = Math.abs(overshoot);
  return sign * (o * dimension * constant) / (dimension + constant * o);
}

/* ===================== Icons ===================== */
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 9 17 20 6"></polyline></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';
const ICON_BOLT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M13 2 3 14h7l-1 8 11-14h-8l1-6z"/></svg>';
const ICON_TODAY = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_WEEK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const ICON_GOALS = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h13l-3 4 3 4H5"/></svg>';
const ICON_INBOX = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l1.5 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6l1.5-7z"/></svg>';

/* ===================== State & storage ===================== */
const STORAGE_KEY = 'tasks_v3';
let tasks = [];
let currentScreen = 'today';
let activeContext = 'All';
const CONTEXTS = ['Floor', 'Admin', 'App', 'Home'];
const CONTEXT_COLORS = { Floor: 'var(--sys-orange)', Admin: 'var(--sys-gray)', App: 'var(--sys-teal)', Home: 'var(--sys-purple)' };
let monthCursor = null; // first-of-month date string for Month view
let editingId = null;
let editingKind = 'task';

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
let TODAY = todayStr();

function parseDateStr(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(s, n) { const d = parseDateStr(s); d.setDate(d.getDate()+n); return todayStr(d); }
function dayNum(s) { return parseInt(s.split('-')[2], 10); }
function monthStart(dateStr) { const d = parseDateStr(dateStr); return todayStr(new Date(d.getFullYear(), d.getMonth(), 1)); }
function addMonths(dateStr, n) { const d = parseDateStr(dateStr); return todayStr(new Date(d.getFullYear(), d.getMonth() + n, 1)); }

/* ===================== Reusable date strip (scrollable month, tap a day) ===================== */
let dateStripState = {};
function dateStripWrapHtml(fieldId) {
  return `<div id="${fieldId}StripWrap"></div>`;
}
function dateStripInnerHtml(fieldId, selected, cursorMonth) {
  const first = parseDateStr(cursorMonth);
  const year = first.getFullYear(), month = first.getMonth();
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDow = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const gridStart = addDays(cursorMonth, -firstDow);
  const lastDate = new Date(year, month + 1, 0);
  const lastStr = todayStr(lastDate);
  const lastDow = (lastDate.getDay() + 6) % 7;
  const gridEnd = addDays(lastStr, 6 - lastDow);
  const totalDays = daysBetween(gridStart, gridEnd) + 1;
  const weeks = Math.round(totalDays / 7);

  let cells = '';
  let cursor = gridStart;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const d = cursor;
      const inMonth = parseDateStr(d).getMonth() === month;
      const isSel = d === selected;
      const isT = d === TODAY;
      cells += `<button class="ds-cell ${inMonth ? '' : 'outmonth'}" data-dsday="${d}" type="button">
        <span class="ds-num ${isSel ? 'selected' : ''} ${isT && !isSel ? 'is-today' : ''}">${dayNum(d)}</span>
      </button>`;
      cursor = addDays(cursor, 1);
    }
  }

  return `
    <div class="date-strip" id="${fieldId}Strip">
      <div class="ds-header">
        <span class="ds-month">${monthLabel}</span>
        <div class="ds-nav">
          <button class="ds-nav-btn" data-dsprev type="button" aria-label="Previous month">‹</button>
          <button class="ds-nav-btn" data-dsnext type="button" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="ds-dow-row">${['M','T','W','T','F','S','S'].map(d => `<div class="ds-dow-label">${d}</div>`).join('')}</div>
      <div class="ds-grid">${cells}</div>
    </div>`;
}
function wireDateStrip(fieldId, initialSelected) {
  const wrap = document.getElementById(fieldId + 'StripWrap');
  if (!wrap) return;
  dateStripState[fieldId] = initialSelected || '';
  let cursor = monthStart(initialSelected || TODAY);

  function render() {
    wrap.innerHTML = dateStripInnerHtml(fieldId, dateStripState[fieldId], cursor);
    bind();
  }
  function bind() {
    document.querySelectorAll(`#${fieldId}Strip [data-dsday]`).forEach(b => b.addEventListener('click', (e) => {
      dateStripState[fieldId] = e.currentTarget.getAttribute('data-dsday');
      render();
    }));
    const prevBtn = document.querySelector(`#${fieldId}Strip [data-dsprev]`);
    const nextBtn = document.querySelector(`#${fieldId}Strip [data-dsnext]`);
    if (prevBtn) prevBtn.addEventListener('click', () => { cursor = addMonths(cursor, -1); render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { cursor = addMonths(cursor, 1); render(); });
  }
  render();
}
function getDateStripValue(fieldId) { return dateStripState[fieldId] || ''; }
function daysBetween(a, b) { return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000); }
function fmtDateFull(s) { return parseDateStr(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtDateShort(s) { return parseDateStr(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtMonthDay(s) { return parseDateStr(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function fmtTime(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM'; const h12 = ((h+11)%12)+1;
  return h12 + ':' + pad(m) + ap;
}
function timeToMinutes(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

/* ===================== Reusable time picker (Hour / Minute / AM-PM) ===================== */
function timePickerContainerHtml(fieldId, timeStr) {
  return `<span id="${fieldId}Container">${timeStr ? timePickerSelectsHtml(fieldId, timeStr) : timePickerButtonHtml()}</span>`;
}
function timePickerButtonHtml() {
  return `<button class="qo-pill tp-addbtn" data-tpadd type="button">🕐 Add time</button>`;
}
function timePickerSelectsHtml(fieldId, timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const steps = [0, 15, 30, 45];
  const roundedM = steps.reduce((best, s) => Math.abs(s - mm) < Math.abs(best - mm) ? s : best, 0);
  const hourOpts = Array.from({ length: 24 }, (_, i) => i)
    .map(h => `<option value="${h}" ${h === hh ? 'selected' : ''}>${pad(h)}</option>`).join('');
  const minOpts = steps.map(m => `<option value="${m}" ${m === roundedM ? 'selected' : ''}>${pad(m)}</option>`).join('');
  return `<span class="time-picker">
    <select class="tp-select" id="${fieldId}_h">${hourOpts}</select>
    <span class="tp-colon">:</span>
    <select class="tp-select" id="${fieldId}_m">${minOpts}</select>
    <button class="tp-clear" data-tpclear type="button" aria-label="Clear time">✕</button>
  </span>`;
}
function wireTimePicker(fieldId) {
  const container = document.getElementById(fieldId + 'Container');
  if (!container) return;
  function rerender(timeStr) {
    container.innerHTML = timeStr ? timePickerSelectsHtml(fieldId, timeStr) : timePickerButtonHtml();
    bind();
  }
  function bind() {
    const addBtn = container.querySelector('[data-tpadd]');
    if (addBtn) addBtn.addEventListener('click', () => rerender('09:00'));
    const clearBtn = container.querySelector('[data-tpclear]');
    if (clearBtn) clearBtn.addEventListener('click', () => rerender(''));
  }
  bind();
}
function getTimePickerValue(fieldId) {
  const hSel = document.getElementById(fieldId + '_h');
  if (!hSel) return '';
  const h = parseInt(hSel.value, 10);
  const m = parseInt(document.getElementById(fieldId + '_m').value, 10);
  return pad(h) + ':' + pad(m);
}

/* ===================== Reusable estimate picker (Min–Max Unit, no free text) ===================== */
function estimatePickerContainerHtml(fieldId, estimateStr) {
  return `<span id="${fieldId}Container">${estimateStr ? estimatePickerSelectsHtml(fieldId, estimateStr) : estimatePickerButtonHtml()}</span>`;
}
function estimatePickerButtonHtml() {
  return `<button class="qo-pill tp-addbtn" data-estadd type="button">⏱ Add estimate</button>`;
}
function estimateUnitLabel(unit, count) {
  if (unit === 'hour') return count === 1 ? 'hr' : 'hrs';
  if (unit === 'week') return count === 1 ? 'wk' : 'wks';
  return count === 1 ? 'day' : 'days';
}
function estimatePickerSelectsHtml(fieldId, estimateStr) {
  let min = 1, max = 2, unit = 'day';
  const m = /^(\d+)(?:\s*-\s*(\d+))?\s*(hour|day|week)/i.exec(estimateStr || '');
  if (m) { min = parseInt(m[1], 10); max = m[2] ? parseInt(m[2], 10) : min; unit = m[3].toLowerCase(); }
  const numOpts = (selected) => Array.from({ length: 30 }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === selected ? 'selected' : ''}>${n}</option>`).join('');
  return `<span class="time-picker">
    <select class="tp-select" id="${fieldId}_min">${numOpts(min)}</select>
    <span class="tp-colon">–</span>
    <select class="tp-select" id="${fieldId}_max">${numOpts(max)}</select>
    <select class="tp-select" id="${fieldId}_unit">
      <option value="hour" ${unit === 'hour' ? 'selected' : ''}>hrs</option>
      <option value="day" ${unit === 'day' ? 'selected' : ''}>days</option>
      <option value="week" ${unit === 'week' ? 'selected' : ''}>wks</option>
    </select>
    <button class="tp-clear" data-estclear type="button" aria-label="Clear estimate">✕</button>
  </span>`;
}
function wireEstimatePicker(fieldId) {
  const container = document.getElementById(fieldId + 'Container');
  if (!container) return;
  function rerender(estimateStr) {
    container.innerHTML = estimateStr ? estimatePickerSelectsHtml(fieldId, estimateStr) : estimatePickerButtonHtml();
    bind();
  }
  function bind() {
    const addBtn = container.querySelector('[data-estadd]');
    if (addBtn) addBtn.addEventListener('click', () => rerender('1-2 day'));
    const clearBtn = container.querySelector('[data-estclear]');
    if (clearBtn) clearBtn.addEventListener('click', () => rerender(''));
  }
  bind();
}
function getEstimatePickerValue(fieldId) {
  const minSel = document.getElementById(fieldId + '_min');
  if (!minSel) return '';
  const min = parseInt(minSel.value, 10);
  const max = parseInt(document.getElementById(fieldId + '_max').value, 10);
  const unit = document.getElementById(fieldId + '_unit').value;
  if (min === max) return `${min} ${estimateUnitLabel(unit, min)}`;
  return `${min}-${max} ${estimateUnitLabel(unit, max)}`;
}
function escapeHtml(s) { const div = document.createElement('div'); div.textContent = s; return div.innerHTML; }
function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---- task-kind helpers ---- */
function appliesOnDate(t, dateStr) {
  if (t.kind !== 'task') return false;
  if (t.recurring === 'daily') return true;
  if (t.recurring === 'weekdays') { const dow = parseDateStr(dateStr).getDay(); return dow >= 1 && dow <= 5; }
  if (t.recurring === 'weekly' && t.date) { return parseDateStr(dateStr).getDay() === parseDateStr(t.date).getDay(); }
  return t.date === dateStr;
}
function isDoneOnDate(t, dateStr) {
  if (t.recurring && t.recurring !== 'none') return t.lastCompletedDate === dateStr;
  return !!t.completed;
}
function isCarried(t) { return t.kind === 'task' && t.recurring === 'none' && t.date && t.date < TODAY && !t.completed; }
function daysOverdue(t) { return Math.max(0, daysBetween(t.date, TODAY)); }
function isInboxTask(t) { return t.kind === 'task' && t.recurring === 'none' && !t.date; }
function matchesContext(t) { return activeContext === 'All' || t.context === activeContext; }

function contextFilterHtml() {
  const chips = ['All', ...CONTEXTS];
  return `<div class="ctxfilter-row">${chips.map(c =>
    `<button class="ctxfilter-btn ${activeContext === c ? 'active' : ''}" data-ctxf="${c}" type="button">${c}</button>`
  ).join('')}</div>`;
}
function wireContextFilter(el) {
  el.querySelectorAll('[data-ctxf]').forEach(b => b.addEventListener('click', (e) => {
    activeContext = e.currentTarget.getAttribute('data-ctxf');
    renderAll();
  }));
}

async function loadAll() {
  try {
    const res = await window.storage.get(STORAGE_KEY, false);
    tasks = res ? JSON.parse(res.value) : [];
  } catch (e) { tasks = []; }
}
let saveTimer = null;
function saveTasks() {
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      try {
        const res = await window.storage.set(STORAGE_KEY, JSON.stringify(tasks), false);
        setStatus(res ? '' : 'Could not save just now — will retry on next change.');
      } catch (e) { setStatus('Could not save just now — will retry on next change.'); }
      resolve();
    }, 120);
  });
}
function setStatus(msg) {
  const el = document.getElementById('statusLine');
  if (el) el.textContent = msg;
}

/* ===================== Tab bar & header ===================== */
const TABS = [
  { id: 'today', label: 'Today', icon: ICON_TODAY },
  { id: 'week', label: 'Week', icon: ICON_WEEK },
  { id: 'goals', label: 'Goals', icon: ICON_GOALS },
  { id: 'inbox', label: 'Inbox', icon: ICON_INBOX },
];

function renderTabBar() {
  const el = document.getElementById('tabbar');
  const inboxCount = tasks.filter(isInboxTask).length;
  const goalsSoon = tasks.filter(t => t.kind === 'goal' && !t.finished && daysBetween(TODAY, t.deadline) <= 3).length;
  el.innerHTML = TABS.map(tab => {
    let badge = '';
    if (tab.id === 'inbox' && inboxCount) badge = `<span class="tab-badge">${inboxCount > 99 ? '99+' : inboxCount}</span>`;
    if (tab.id === 'goals' && goalsSoon) badge = `<span class="tab-badge">${goalsSoon}</span>`;
    return `<button class="tab-btn ${currentScreen === tab.id ? 'active' : ''}" data-tab="${tab.id}" type="button">
      ${tab.icon}${badge}<span class="tlabel">${tab.label}</span>
    </button>`;
  }).join('');
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', (e) => switchScreen(e.currentTarget.getAttribute('data-tab'))));
}

function switchScreen(name) {
  currentScreen = name;
  window.scrollTo(0, 0);
  renderAll();
}

function renderHeader() {
  const title = document.getElementById('navTitle');
  const sub = document.getElementById('navSub');
  if (currentScreen === 'today') {
    title.textContent = 'Today';
    sub.textContent = fmtDateFull(TODAY);
  } else if (currentScreen === 'week') {
    title.textContent = 'Calendar';
    const mc = monthCursor || monthStart(TODAY);
    sub.textContent = parseDateStr(mc).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } else if (currentScreen === 'goals') {
    title.textContent = 'Goals';
    sub.textContent = 'Things with a deadline';
  } else if (currentScreen === 'inbox') {
    title.textContent = 'Inbox';
    sub.textContent = 'Not scheduled yet';
  }
}

function renderAll() {
  renderHeader();
  renderTabBar();
  if (currentScreen === 'today') renderToday();
  else if (currentScreen === 'week') renderWeek();
  else if (currentScreen === 'goals') renderGoals();
  else if (currentScreen === 'inbox') renderInbox();
}

/* ===================== TODAY ===================== */
function renderToday() {
  const el = document.getElementById('screenContent');
  const ongoing = tasks.filter(t => t.kind === 'ongoing' && !t.finished && matchesContext(t));
  const goalsSoon = tasks.filter(t => t.kind === 'goal' && !t.finished && daysBetween(TODAY, t.deadline) <= 3)
    .sort((a,b) => a.deadline.localeCompare(b.deadline));

  const todaysTasks = tasks.filter(t => t.kind === 'task' && (appliesOnDate(t, TODAY) || isCarried(t)) && matchesContext(t));
  todaysTasks.sort((a, b) => {
    const ad = isDoneOnDate(a, TODAY), bd = isDoneOnDate(b, TODAY);
    if (ad !== bd) return ad ? 1 : -1;
    const af = a.flagged ? 0 : 1, bf = b.flagged ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0);
  });
  const doneCount = todaysTasks.filter(t => isDoneOnDate(t, TODAY)).length;

  let html = contextFilterHtml();

  if (goalsSoon.length) {
    html += `<div class="goal-banner">
      <div class="goal-banner-title">Goals coming up</div>
      ${goalsSoon.map(g => {
        const d = daysBetween(TODAY, g.deadline);
        const label = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d}d left`;
        return `<div class="goal-banner-item" data-goalbanner="${g.id}"><span class="gname">${escapeHtml(g.title)}</span><span class="gdays ${d < 0 ? 'over' : ''}">${label}</span></div>`;
      }).join('')}
    </div>`;
  }

  if (ongoing.length) {
    html += `<div class="section-title">Ongoing</div><div class="group">`;
    html += ongoing.map(t => ongoingRowHtml(t)).join('');
    html += `</div>`;
  }

  html += `<div class="section-title">Tasks &nbsp;·&nbsp; ${doneCount}/${todaysTasks.length}</div>`;
  html += `<div class="group">`;
  if (!todaysTasks.length) {
    html += `<div class="empty-note">Nothing on your plate today. Tap + to add something.</div>`;
  } else {
    html += todaysTasks.map(t => taskRowHtml(t, TODAY)).join('');
  }
  html += `</div>`;

  html += `<div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  wireTaskRows(el, TODAY);
  wireOngoingRows(el);
  wireContextFilter(el);
  el.querySelectorAll('[data-goalbanner]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-goalbanner'), 'goal')));
}

function ongoingRowHtml(t) {
  const lastTouch = t.lastTouchedDate || t.startedDate;
  const staleDays = daysBetween(lastTouch, TODAY);
  const stale = staleDays >= 2;
  const startedDays = daysBetween(t.startedDate, TODAY);
  return `
    <div class="ongoing-row">
      <div class="ongoing-top">
        <div class="ongoing-title" data-ongoingbody="${t.id}">${escapeHtml(t.title)}</div>
      </div>
      ${t.notes ? `<div class="row-notes">${escapeHtml(t.notes)}</div>` : ''}
      <div class="ongoing-meta ${stale ? 'stale' : ''}">
        Started ${startedDays === 0 ? 'today' : startedDays + 'd ago'} · last touched ${staleDays === 0 ? 'today' : staleDays + 'd ago'}${t.context ? ` · ${escapeHtml(t.context)}` : ''}${t.estimate ? ` · ⏱ ${escapeHtml(t.estimate)}` : ''}
      </div>
      <div class="ongoing-actions">
        <button class="ongoing-btn log" data-log="${t.id}" type="button">${ICON_BOLT} Log today</button>
        <button class="ongoing-btn finish" data-finish="${t.id}" type="button">${ICON_CHECK} Finish</button>
      </div>
    </div>`;
}
function wireOngoingRows(el) {
  el.querySelectorAll('[data-ongoingbody]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-ongoingbody'), 'ongoing')));
  el.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', (e) => {
    const t = tasks.find(x => x.id === e.currentTarget.getAttribute('data-log'));
    if (t) { t.lastTouchedDate = TODAY; saveTasks(); renderAll(); }
  }));
  el.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', (e) => {
    const t = tasks.find(x => x.id === e.currentTarget.getAttribute('data-finish'));
    if (t) { t.finished = true; t.finishedDate = TODAY; saveTasks(); renderAll(); }
  }));
}

/* ---- shared task row (swipeable) ---- */
function taskRowHtml(t, dateStr) {
  const done = isDoneOnDate(t, dateStr);
  const carried = isCarried(t);
  const meta = [];
  if (carried) meta.push(`<span class="meta-chip age">${daysOverdue(t)}d</span>`);
  if (t.time) meta.push(`<span class="meta-chip">${fmtTime(t.time)}</span>`);
  if (t.recurring === 'daily') meta.push(`<span class="meta-chip">daily</span>`);
  if (t.recurring === 'weekly') meta.push(`<span class="meta-chip">${recurringLabel(t)}</span>`);
  if (t.recurring === 'weekdays') meta.push(`<span class="meta-chip">weekdays</span>`);
  if (t.context) meta.push(`<span class="meta-chip">${escapeHtml(t.context)}</span>`);
  if (t.estimate) meta.push(`<span class="meta-chip">⏱ ${escapeHtml(t.estimate)}</span>`);
  if (t.goalId) meta.push(`<span class="meta-chip goal">goal</span>`);
  return `
    <div class="swipe-slot" data-taskslot="${t.id}">
      <div class="swipe-bg">
        <span class="swipe-side left">${ICON_CHECK} Complete</span>
        <span class="swipe-side right">Delete ${ICON_TRASH}</span>
      </div>
      <div class="row" data-taskrow="${t.id}">
        <button class="check-circle ${done ? 'done' : ''} ${t.flagged ? 'flag-color' : ''}" style="--dot-color:var(--sys-orange)" data-check="${t.id}" aria-label="Toggle done">${done ? ICON_CHECK : ''}</button>
        <div class="row-body" data-body="${t.id}">
          <div class="row-title ${done ? 'done' : ''}">${t.flagged ? '🔶 ' : ''}${escapeHtml(t.title)}</div>
          ${t.notes ? `<div class="row-notes">${escapeHtml(t.notes)}</div>` : ''}
          ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
        </div>
        <button class="row-del" data-del="${t.id}" aria-label="Delete">${ICON_TRASH}</button>
      </div>
    </div>`;
}
function wireTaskRows(el, dateStr) {
  el.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), dateStr); }));
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-body'), 'task')));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget); }));
  el.querySelectorAll('[data-taskslot]').forEach(slot => attachSwipe(slot, dateStr));
}

function toggleCompleteOn(id, dateStr) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (t.recurring && t.recurring !== 'none') {
    t.lastCompletedDate = (t.lastCompletedDate === dateStr) ? null : dateStr;
  } else {
    t.completed = !t.completed;
  }
  saveTasks();
  renderAll();
}

let pendingDelete = null;
function requestDelete(id, btn) {
  if (pendingDelete !== id) {
    pendingDelete = id;
    if (btn) { btn.innerHTML = ICON_TRASH; btn.classList.add('confirm'); btn.title = 'Tap again to delete'; }
    setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; renderAll(); } }, 3000);
    return;
  }
  deleteTask(id);
}
function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  pendingDelete = null;
  saveTasks();
  renderAll();
}

/* ---- swipe gesture (touch only) ---- */
function attachSwipe(slot, dateStr) {
  const row = slot.querySelector('.row');
  const swipeBg = slot.querySelector('.swipe-bg');
  const id = slot.getAttribute('data-taskslot');
  slot.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (e.target.closest('.check-circle') || e.target.closest('.row-del')) return;
    const startX = e.clientX, startY = e.clientY;
    let dx = 0, axis = null, lastX = startX, lastT = performance.now(), vel = 0;
    const width = row.getBoundingClientRect().width;

    function onMove(ev) {
      const dxRaw = ev.clientX - startX, dyRaw = ev.clientY - startY;
      if (!axis) {
        if (Math.abs(dxRaw) > 10 || Math.abs(dyRaw) > 10) {
          axis = Math.abs(dxRaw) > Math.abs(dyRaw) ? 'x' : 'y';
          if (axis === 'x' && swipeBg) swipeBg.style.opacity = '1';
        } else return;
      }
      if (axis !== 'x') return;
      ev.preventDefault();
      const now = performance.now();
      vel = (ev.clientX - lastX) / Math.max(1, (now - lastT) / 1000);
      lastX = ev.clientX; lastT = now;
      const max = width * 0.6;
      dx = Math.abs(dxRaw) > max ? Math.sign(dxRaw) * max + rubberband(dxRaw - Math.sign(dxRaw) * max, width) : dxRaw;
      row.style.transform = `translateX(${dx}px)`;
    }
    function onUp() {
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerup', onUp);
      slot.removeEventListener('pointercancel', onUp);
      if (axis !== 'x') return;
      const projected = dx + project(vel);
      if (projected < -width * 0.5) {
        const s = new Spring(dx, { dampingRatio: 1, response: 0.2 });
        s.velocity = vel; s.set(-width * 1.2);
        runSpring(s, (v) => { row.style.transform = `translateX(${v}px)`; row.style.opacity = Math.max(0, 1 - Math.abs(v) / (width * 1.2)); }, () => deleteTask(id));
      } else if (projected > width * 0.5) {
        toggleCompleteOn(id, dateStr);
        const s = new Spring(dx, { dampingRatio: 0.8, response: 0.24 });
        s.velocity = vel; s.set(0);
        runSpring(s, (v) => { row.style.transform = `translateX(${v}px)`; }, () => { row.style.transform = ''; if (swipeBg) swipeBg.style.opacity = '0'; });
      } else {
        const s = new Spring(dx, { dampingRatio: 0.8, response: 0.24 });
        s.velocity = vel; s.set(0);
        runSpring(s, (v) => { row.style.transform = `translateX(${v}px)`; }, () => { row.style.transform = ''; if (swipeBg) swipeBg.style.opacity = '0'; });
      }
    }
    slot.addEventListener('pointermove', onMove);
    slot.addEventListener('pointerup', onUp);
    slot.addEventListener('pointercancel', onUp);
  });
}

/* ---- press feedback (respond on pointer-down) ---- */
document.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.row, .ongoing-row, .goal-card');
  if (row) {
    const spring = new Spring(1, { dampingRatio: 1, response: 0.15 });
    spring.set(0.985);
    runSpring(spring, (v) => { row.style.transform = row.style.transform.includes('translateX') ? row.style.transform : `scale(${v})`; });
    const up = () => {
      const s2 = new Spring(0.985, { dampingRatio: 0.8, response: 0.22 });
      s2.set(1);
      runSpring(s2, (v) => { if (!row.style.transform.includes('translateX')) row.style.transform = `scale(${v})`; }, () => { if (!row.style.transform.includes('translateX')) row.style.transform = ''; });
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
});

/* ---- quick add row (inline, per-screen) ---- */
/* ===================== Global "Add Task" capture sheet =====================
   One entry point from anywhere: type it, then choose where it goes. */
let capArea = null; // 'today' | 'week' | 'ongoing' | 'goal' | 'inbox'

const CAP_AREAS = [
  { id: 'today', label: '☀️ Today' },
  { id: 'week', label: '📅 This Week' },
  { id: 'ongoing', label: '⚡ Ongoing' },
  { id: 'goal', label: '🚩 Goal' },
  { id: 'inbox', label: '📥 Inbox' },
];

function openAddSheet() {
  capArea = null;
  sheetEl.innerHTML = buildAddSheetHtml();
  wireAddSheet();
  openSheet();
  setTimeout(() => { const t = document.getElementById('capTitle'); if (t) t.focus(); }, 50);
}

function buildAddSheetHtml() {
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-title">New Task</div>
    <input type="text" id="capTitle" placeholder="What needs doing?">
    <textarea id="capNotes" class="sheet-notes" placeholder="Add a description (optional)…" maxlength="2000"></textarea>
    <div class="cap-area-label">Where does this go?</div>
    <div class="cap-area-grid">
      ${CAP_AREAS.map(a => `<button class="cap-area-btn ${capArea === a.id ? 'active' : ''}" data-area="${a.id}" type="button">${a.label}</button>`).join('')}
    </div>
    <div id="capExtra">${capExtraHtml()}</div>
    <div class="sheet-actions">
      <button class="sheet-cancel" id="capCancel" type="button">Cancel</button>
      <button class="sheet-save" id="capSave" type="button">Add</button>
    </div>`;
}

function capContextPillHtml() {
  return `<label class="qo-pill">🏷️<select id="capContext">
    <option value="">No area</option>
    ${CONTEXTS.map(c => `<option value="${c}">${c}</option>`).join('')}
  </select></label>`;
}
function capExtraHtml() {
  if (capArea === 'today') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">
        ${timePickerContainerHtml('capTime', '')}
        <label class="qo-pill">🔁<select id="capRepeat">
          <option value="none">Once</option><option value="daily">Every day</option><option value="weekly">Weekly</option><option value="weekdays">Weekdays</option>
        </select></label>
        ${capContextPillHtml()}
        <button class="qo-flag" id="capFlag" type="button" data-on="0">🔶 Flag</button>
      </div>
      <div class="quickadd-options" style="padding:0;margin-top:8px;">
        ${estimatePickerContainerHtml('capEstimate', '')}
      </div>
    </div>`;
  }
  if (capArea === 'week') {
    return `<div class="cap-extra-group">
      ${dateStripWrapHtml('capWeekDay')}
      <div class="quickadd-options" style="padding:0;margin-top:10px;">
        ${timePickerContainerHtml('capTime', '')}
        <label class="qo-pill">🔁<select id="capRepeat">
          <option value="none">Once</option><option value="daily">Every day</option><option value="weekly">Weekly</option><option value="weekdays">Weekdays</option>
        </select></label>
        ${capContextPillHtml()}
        <button class="qo-flag" id="capFlag" type="button" data-on="0">🔶 Flag</button>
      </div>
      <div class="quickadd-options" style="padding:0;margin-top:8px;">
        ${estimatePickerContainerHtml('capEstimate', '')}
      </div>
    </div>`;
  }
  if (capArea === 'goal') {
    return `<div class="cap-extra-group">
      ${dateStripWrapHtml('capDeadline')}
    </div>`;
  }
  if (capArea === 'ongoing') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">
        ${capContextPillHtml()}
        ${estimatePickerContainerHtml('capEstimate', '')}
      </div>
      <div class="cap-extra-note">Starts today. Log progress anytime from the Today screen until you mark it finished.</div>
    </div>`;
  }
  if (capArea === 'inbox') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">${capContextPillHtml()}</div>
      <div class="cap-extra-note">No date — sits in Inbox until you schedule it.</div>
    </div>`;
  }
  return `<div class="cap-extra-note">Pick where this goes before adding.</div>`;
}
function dayOfWeekAbbr3(s) { return parseDateStr(s).toLocaleDateString(undefined, { weekday: 'short' }).slice(0,3); }
function recurringLabel(t) {
  if (t.recurring === 'daily') return 'daily';
  if (t.recurring === 'weekdays') return 'weekdays';
  if (t.recurring === 'weekly') return t.date ? `every ${dayOfWeekAbbr3(t.date)}` : 'weekly';
  return '';
}

function wireAddSheet() {
  document.getElementById('capCancel').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', (e) => {
    capArea = e.currentTarget.getAttribute('data-area');
    document.querySelectorAll('[data-area]').forEach(x => x.classList.toggle('active', x.getAttribute('data-area') === capArea));
    document.getElementById('capExtra').innerHTML = capExtraHtml();
    wireCapExtra();
  }));
  wireCapExtra();
  document.getElementById('capSave').addEventListener('click', submitAddSheet);
  document.getElementById('capTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAddSheet(); });
}
function wireCapExtra() {
  wireTimePicker('capTime');
  wireEstimatePicker('capEstimate');
  const flagBtn = document.getElementById('capFlag');
  if (flagBtn) flagBtn.addEventListener('click', () => {
    const on = flagBtn.dataset.on !== '1';
    flagBtn.dataset.on = on ? '1' : '0';
    flagBtn.classList.toggle('on', on);
  });
  if (capArea === 'week') wireDateStrip('capWeekDay', addDays(TODAY, 1));
  if (capArea === 'goal') { const d = new Date(); d.setDate(d.getDate() + 14); wireDateStrip('capDeadline', todayStr(d)); }
}

function submitAddSheet() {
  const titleInput = document.getElementById('capTitle');
  const title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }
  if (!capArea) { document.querySelector('.cap-area-label').style.color = 'var(--sys-red)'; return; }

  const notesInput = document.getElementById('capNotes');
  const repeatInput = document.getElementById('capRepeat');
  const flagBtn = document.getElementById('capFlag');
  const contextInput = document.getElementById('capContext');
  const time = getTimePickerValue('capTime');
  const recurring = repeatInput ? repeatInput.value : 'none';
  const flagged = flagBtn ? flagBtn.dataset.on === '1' : false;
  const context = contextInput ? contextInput.value : '';
  const notes = notesInput ? notesInput.value.trim() : '';
  const estimate = getEstimatePickerValue('capEstimate');

  if (capArea === 'today') {
    tasks.push({ id: uid(), kind: 'task', title, notes, estimate, date: TODAY, time, duration: null, recurring, flagged,
      context, completed: false, lastCompletedDate: null, order: Date.now(), createdAt: Date.now(), goalId: null });
  } else if (capArea === 'week') {
    tasks.push({ id: uid(), kind: 'task', title, notes, estimate, date: getDateStripValue('capWeekDay') || addDays(TODAY,1), time, duration: null, recurring, flagged,
      context, completed: false, lastCompletedDate: null, order: Date.now(), createdAt: Date.now(), goalId: null });
  } else if (capArea === 'inbox') {
    tasks.push({ id: uid(), kind: 'task', title, notes, estimate: '', date: '', time: '', duration: null, recurring: 'none', flagged: false,
      context, completed: false, lastCompletedDate: null, order: Date.now(), createdAt: Date.now(), goalId: null });
  } else if (capArea === 'ongoing') {
    tasks.push({ id: uid(), kind: 'ongoing', title, notes, estimate, context, startedDate: TODAY, lastTouchedDate: TODAY, finished: false, finishedDate: null, order: Date.now(), createdAt: Date.now() });
  } else if (capArea === 'goal') {
    const d = new Date(); d.setDate(d.getDate() + 14);
    tasks.push({ id: uid(), kind: 'goal', title, notes, deadline: getDateStripValue('capDeadline') || todayStr(d), finished: false, finishedDate: null, order: Date.now(), createdAt: Date.now() });
  }
  saveTasks();
  renderAll();
  closeSheet();
}

/* ===================== WEEK ===================== */
let searchQuery = '';

function renderWeek() {
  const el = document.getElementById('screenContent');

  let html = `<div class="search-row">
    <span class="search-icon">🔍</span>
    <input type="text" id="weekSearch" placeholder="Search tasks, ongoing, goals…" value="${escapeHtml(searchQuery)}">
    ${searchQuery ? `<button class="search-clear" id="searchClear" type="button">✕</button>` : ''}
  </div>`;

  if (searchQuery.trim()) {
    html += renderSearchResultsHtml(searchQuery.trim());
    el.innerHTML = html;
    wireSearchBar(el);
    return;
  }

  html += contextFilterHtml();
  html += renderMonthGridHtml();
  el.innerHTML = html;
  wireSearchBar(el);
  wireContextFilter(el);
  wireMonthGrid(el);
}
function wireSearchBar(el) {
  const input = document.getElementById('weekSearch');
  if (input) {
    input.addEventListener('input', () => { searchQuery = input.value; renderWeek(); });
    if (document.activeElement !== input && searchQuery) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  const clearBtn = document.getElementById('searchClear');
  if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; renderWeek(); });
}

/* ---------- Search results (across tasks, ongoing, goals) ---------- */
function renderSearchResultsHtml(query) {
  const q = query.toLowerCase();
  const results = tasks.filter(t => t.title.toLowerCase().includes(q));
  results.sort((a, b) => (b.order || 0) - (a.order || 0));

  let html = `<div class="section-title">${results.length} result${results.length === 1 ? '' : 's'} for "${escapeHtml(query)}"</div><div class="group">`;
  if (!results.length) {
    html += `<div class="empty-note">No matches.</div>`;
  } else {
    html += results.map(t => searchRowHtml(t)).join('');
  }
  html += `</div>`;
  return html;
}
function searchRowHtml(t) {
  let meta = '';
  let kindLabel = '';
  if (t.kind === 'task') {
    kindLabel = 'Task';
    meta = t.recurring !== 'none'
      ? recurringLabel(t) + (t.time ? ' · ' + fmtTime(t.time) : '')
      : (t.date ? (t.time ? `${t.date} · ${fmtTime(t.time)}` : t.date) : 'No date');
  } else if (t.kind === 'ongoing') {
    kindLabel = 'Ongoing';
    meta = t.finished ? 'Finished' : `Started ${fmtMonthDay(t.startedDate)}`;
  } else if (t.kind === 'goal') {
    kindLabel = 'Goal';
    meta = t.finished ? 'Done' : `Due ${fmtMonthDay(t.deadline)}`;
  }
  return `
    <div class="row" data-searchresult="${t.id}" data-searchkind="${t.kind}">
      <div class="row-body">
        <div class="row-title">${escapeHtml(t.title)}</div>
        <div class="row-meta"><span class="meta-chip">${kindLabel}</span><span>${escapeHtml(meta)}</span></div>
      </div>
      <span class="row-trail">${ICON_CHEVRON}</span>
    </div>`;
}
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-searchresult]');
  if (row) openEditor(row.getAttribute('data-searchresult'), row.getAttribute('data-searchkind'));
});

/* ---------- Month grid ---------- */
function renderMonthGridHtml() {
  if (!monthCursor) monthCursor = monthStart(TODAY);
  const first = parseDateStr(monthCursor);
  const year = first.getFullYear(), month = first.getMonth();
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDow = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const gridStart = addDays(monthCursor, -firstDow);
  const lastDate = new Date(year, month + 1, 0);
  const lastStr = todayStr(lastDate);
  const lastDow = (lastDate.getDay() + 6) % 7;
  const gridEnd = addDays(lastStr, 6 - lastDow);
  const totalDays = daysBetween(gridStart, gridEnd) + 1;
  const weeks = Math.round(totalDays / 7);

  let html = `<div class="month-nav">
    <button class="week-nav-btn" id="monthPrev" type="button">‹</button>
    <div class="month-nav-label">${monthLabel}</div>
    <button class="week-nav-btn" id="monthNext" type="button">›</button>
  </div>`;

  html += `<div class="month-legend">${CONTEXTS.map(c => `<span class="mleg-item"><span class="mleg-dot" style="background:${CONTEXT_COLORS[c]}"></span>${c}</span>`).join('')}</div>`;

  html += `<div class="month-grid">`;
  html += `<div class="month-dow-row">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="month-dow">${d}</div>`).join('')}</div>`;

  let cursor = gridStart;
  for (let w = 0; w < weeks; w++) {
    html += `<div class="month-week-row">`;
    for (let i = 0; i < 7; i++) {
      const d = cursor;
      const inMonth = parseDateStr(d).getMonth() === month;
      const isT = d === TODAY;
      const items = tasks.filter(t => t.kind === 'task' && appliesOnDate(t, d) && matchesContext(t));
      const contextsPresent = [...new Set(items.map(t => t.context).filter(Boolean))];
      html += `<button class="month-cell ${inMonth ? '' : 'outmonth'} ${isT ? 'is-today' : ''}" data-monthday="${d}" type="button">
        <span class="mc-num">${dayNum(d)}</span>
        ${items.length ? `<span class="mc-dots">
          ${contextsPresent.slice(0,4).map(c => `<span class="mc-dot" style="background:${CONTEXT_COLORS[c] || 'var(--sys-gray)'}"></span>`).join('')}
          <span class="mc-count">${items.length}</span>
        </span>` : ''}
      </button>`;
      cursor = addDays(cursor, 1);
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}
function wireMonthGrid(el) {
  document.getElementById('monthPrev').addEventListener('click', () => { monthCursor = addMonths(monthCursor, -1); renderAll(); });
  document.getElementById('monthNext').addEventListener('click', () => { monthCursor = addMonths(monthCursor, 1); renderAll(); });
  el.querySelectorAll('[data-monthday]').forEach(b => b.addEventListener('click', (e) => openDayDetail(e.currentTarget.getAttribute('data-monthday'))));
}

function openDayDetail(dateStr) {
  const items = tasks.filter(t => t.kind === 'task' && appliesOnDate(t, dateStr) && matchesContext(t));
  items.sort((a,b) => (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order||0)-(b.order||0));
  sheetEl.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${fmtDateFull(dateStr)}</div>
    <div class="group" style="margin-bottom:14px;">
      ${items.length ? items.map(t => weekRowHtml(t, dateStr)).join('') : '<div class="empty-note">Nothing planned.</div>'}
    </div>
    <div class="sheet-actions"><button class="sheet-cancel" id="dayDetailClose" type="button" style="flex:1;">Close</button></div>`;
  document.getElementById('dayDetailClose').addEventListener('click', closeSheet);
  sheetEl.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), e.currentTarget.getAttribute('data-forday')); openDayDetail(dateStr); }));
  sheetEl.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-body'), 'task')));
  sheetEl.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget); openDayDetail(dateStr); }));
  openSheet();
}
function weekRowHtml(t, dateStr) {
  const done = isDoneOnDate(t, dateStr);
  const meta = [];
  if (t.time) meta.push(`<span class="meta-chip">${fmtTime(t.time)}</span>`);
  if (t.recurring !== 'none') meta.push(`<span class="meta-chip">${recurringLabel(t)}</span>`);
  if (t.context) meta.push(`<span class="meta-chip">${escapeHtml(t.context)}</span>`);
  if (t.estimate) meta.push(`<span class="meta-chip">⏱ ${escapeHtml(t.estimate)}</span>`);
  return `
    <div class="row week-task-row">
      <button class="check-circle ${done ? 'done' : ''}" data-check="${t.id}" data-forday="${dateStr}" aria-label="Toggle done">${done ? ICON_CHECK : ''}</button>
      <div class="row-body" data-body="${t.id}">
        <div class="row-title ${done ? 'done' : ''}">${t.flagged ? '🔶 ' : ''}${escapeHtml(t.title)}</div>
        ${t.notes ? `<div class="row-notes">${escapeHtml(t.notes)}</div>` : ''}
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      <button class="row-del" data-del="${t.id}" aria-label="Delete">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== GOALS ===================== */
let goalAddOpenId = null; // which goal card currently shows its inline "add task" field

function renderGoals() {
  const el = document.getElementById('screenContent');
  const active = tasks.filter(t => t.kind === 'goal' && !t.finished).sort((a,b) => a.deadline.localeCompare(b.deadline));
  const done = tasks.filter(t => t.kind === 'goal' && t.finished).sort((a,b) => (b.finishedDate||'').localeCompare(a.finishedDate||''));

  let html = `<div class="section-title">Active</div><div class="group">`;
  if (!active.length) {
    html += `<div class="empty-note">No goals yet — tap + and choose "Goal", like "TV in the factory by end of month."</div>`;
  } else {
    html += active.map(g => goalCardHtml(g)).join('');
  }
  html += `</div>`;

  if (done.length) {
    html += `<div class="section-title">Completed</div><div class="group">`;
    html += done.map(g => goalCardHtml(g)).join('');
    html += `</div>`;
  }

  html += `<div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-goaltitle]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-goaltitle'), 'goal')));
  el.querySelectorAll('[data-goalcheck]').forEach(b => b.addEventListener('click', (e) => {
    const g = tasks.find(x => x.id === e.currentTarget.getAttribute('data-goalcheck'));
    if (g) { g.finished = !g.finished; g.finishedDate = g.finished ? TODAY : null; saveTasks(); renderAll(); }
  }));
  el.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), TODAY); }));
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-body'), 'task')));
  el.querySelectorAll('[data-goaladdtask]').forEach(b => b.addEventListener('click', (e) => {
    goalAddOpenId = e.currentTarget.getAttribute('data-goaladdtask');
    renderGoals();
  }));
  el.querySelectorAll('[data-goaltaskinput]').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      const gid = input.getAttribute('data-goaltaskinput');
      if (title) {
        tasks.push({ id: uid(), kind: 'task', title, notes: '', estimate: '', date: '', time: '', duration: null,
          recurring: 'none', flagged: false, context: '', completed: false, lastCompletedDate: null,
          order: Date.now(), createdAt: Date.now(), goalId: gid });
        saveTasks();
      }
      goalAddOpenId = null;
      renderAll();
    });
    input.addEventListener('blur', () => { if (goalAddOpenId === input.getAttribute('data-goaltaskinput')) { goalAddOpenId = null; renderGoals(); } });
  });
  const openInput = el.querySelector('[data-goaltaskinput]');
  if (openInput) openInput.focus();
}

function goalCardHtml(g) {
  const d = daysBetween(TODAY, g.deadline);
  let countdown;
  if (g.finished) countdown = 'Done';
  else if (d < 0) countdown = `${-d}d overdue`;
  else if (d === 0) countdown = 'Due today';
  else countdown = `${d}d left`;
  const cdClass = g.finished ? 'done' : d < 0 ? 'over' : '';
  const linkedTasks = tasks.filter(t => t.kind === 'task' && t.goalId === g.id);
  const linkedDone = linkedTasks.filter(t => t.completed).length;

  return `
    <div class="goal-card">
      <div class="goal-top">
        <button class="check-circle" style="width:22px;height:22px;flex-shrink:0;" data-goalcheck="${g.id}" aria-label="Mark goal done">${g.finished ? ICON_CHECK : ''}</button>
        <div style="flex:1;min-width:0;">
          <div class="goal-title ${g.finished ? 'done' : ''}" data-goaltitle="${g.id}">${escapeHtml(g.title)}</div>
          <div class="goal-sub">Due ${fmtMonthDay(g.deadline)}${linkedTasks.length ? ` · ${linkedDone}/${linkedTasks.length} tasks done` : ''}</div>
          ${g.notes ? `<div class="row-notes" style="white-space:normal;">${escapeHtml(g.notes)}</div>` : ''}
        </div>
        <div class="goal-countdown ${cdClass}">${countdown}</div>
      </div>
      ${linkedTasks.length ? `<div class="goal-tasks">${linkedTasks.map(t => {
        const stepMeta = [];
        if (t.date) stepMeta.push(t.time ? `${fmtMonthDay(t.date)} · ${fmtTime(t.time)}` : fmtMonthDay(t.date));
        if (t.estimate) stepMeta.push(`⏱ ${escapeHtml(t.estimate)}`);
        return `
        <div class="goal-task-row">
          <button class="check-circle ${t.completed ? 'done' : ''}" data-check="${t.id}" style="width:19px;height:19px;">${t.completed ? ICON_CHECK : ''}</button>
          <div style="flex:1;min-width:0;">
            <div class="row-title" data-body="${t.id}">${escapeHtml(t.title)}</div>
            ${stepMeta.length ? `<div class="row-notes" style="white-space:normal;">${stepMeta.join(' · ')}</div>` : ''}
          </div>
        </div>`;
      }).join('')}</div>` : ''}
      ${goalAddOpenId === g.id
        ? `<input type="text" class="goal-inline-input" data-goaltaskinput="${g.id}" placeholder="Task title, then Enter" style="width:100%;background:var(--bg-elevated-3);border:none;border-radius:var(--r-sm);padding:9px 11px;font-size:14px;color:var(--label);margin-top:8px;">`
        : `<button class="goal-add-task" data-goaladdtask="${g.id}" type="button">+ Add a task toward this</button>`}
    </div>`;
}

/* ===================== INBOX ===================== */
function renderInbox() {
  const el = document.getElementById('screenContent');
  const items = tasks.filter(t => isInboxTask(t) && matchesContext(t)).sort((a,b) => (b.order||0)-(a.order||0));

  let html = contextFilterHtml();
  html += `<div class="section-title">Unscheduled</div><div class="group">`;
  if (!items.length) {
    html += `<div class="empty-note">Nothing waiting — capture anything here without deciding when, then schedule it later.</div>`;
  } else {
    html += items.map(t => inboxRowHtml(t)).join('');
  }
  html += `</div>`;
  html += `<div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  wireContextFilter(el);
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', (e) => openEditor(e.currentTarget.getAttribute('data-body'), 'task')));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget)));
  el.querySelectorAll('[data-movetoday]').forEach(b => b.addEventListener('click', (e) => { const t = tasks.find(x=>x.id===e.currentTarget.getAttribute('data-movetoday')); if(t){t.date=TODAY; saveTasks(); renderAll();} }));
  el.querySelectorAll('[data-movetom]').forEach(b => b.addEventListener('click', (e) => { const t = tasks.find(x=>x.id===e.currentTarget.getAttribute('data-movetom')); if(t){t.date=addDays(TODAY,1); saveTasks(); renderAll();} }));
}
function inboxRowHtml(t) {
  return `
    <div class="row">
      <div class="row-body" data-body="${t.id}">
        <div class="row-title">${escapeHtml(t.title)}${t.context ? ` <span class="meta-chip">${escapeHtml(t.context)}</span>` : ''}</div>
      </div>
      <button class="row-trail" data-movetoday="${t.id}" style="background:none;border:none;color:var(--sys-blue);font-size:12.5px;font-weight:600;cursor:pointer;padding:4px 6px;">Today</button>
      <button class="row-trail" data-movetom="${t.id}" style="background:none;border:none;color:var(--sys-blue);font-size:12.5px;font-weight:600;cursor:pointer;padding:4px 6px;">Tmrw</button>
      <button class="row-del" data-del="${t.id}" aria-label="Delete">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== Edit sheet ===================== */
const scrimEl = document.getElementById('scrim');
const sheetEl = document.getElementById('sheet');

function openEditor(id, kind) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editingId = id; editingKind = kind || t.kind;
  sheetEl.innerHTML = buildSheetHtml(t);
  wireSheet(t);
  openSheet();
}

function notesFieldHtml(t) {
  return `<textarea id="editNotes" class="sheet-notes" placeholder="Add more detail or explanation…" maxlength="2000">${escapeHtml(t.notes || '')}</textarea>`;
}
function buildSheetHtml(t) {
  if (t.kind === 'goal') {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-title">Edit goal</div>
      <input type="text" id="editTitle" value="${escapeHtml(t.title)}" maxlength="120">
      ${notesFieldHtml(t)}
      <div class="fname" style="margin-bottom:8px;">Deadline</div>
      ${dateStripWrapHtml('editDeadline')}
      <div class="sheet-actions">
        <button class="sheet-cancel" id="sheetCancel" type="button">Cancel</button>
        <button class="sheet-delete" id="sheetDelete" type="button">Delete</button>
        <button class="sheet-save" id="sheetSave" type="button">Save</button>
      </div>`;
  }
  if (t.kind === 'ongoing') {
    return `
      <div class="sheet-handle"></div>
      <div class="sheet-title">Edit ongoing project</div>
      <input type="text" id="editTitle" value="${escapeHtml(t.title)}" maxlength="120">
      ${notesFieldHtml(t)}
      <div class="field-group">
        <div class="field-row"><span class="fname">Started</span><span style="color:var(--label-secondary);font-size:15px;">${fmtMonthDay(t.startedDate)}</span></div>
        <div class="field-row"><span class="fname">Last touched</span><span style="color:var(--label-secondary);font-size:15px;">${fmtMonthDay(t.lastTouchedDate || t.startedDate)}</span></div>
        <div class="field-row"><span class="fname">Estimate</span>${estimatePickerContainerHtml('editEstimate', t.estimate || '')}</div>
      </div>
      <div class="sheet-actions">
        <button class="sheet-cancel" id="sheetCancel" type="button">Cancel</button>
        <button class="sheet-delete" id="sheetDelete" type="button">Delete</button>
        <button class="sheet-save" id="sheetSave" type="button">Save</button>
      </div>`;
  }
  // plain task
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Edit task</div>
    <input type="text" id="editTitle" value="${escapeHtml(t.title)}" maxlength="120">
    ${notesFieldHtml(t)}
    <div class="sheet-move-row">
      <button class="sheet-move-btn" id="moveTodayBtn" type="button">Today</button>
      <button class="sheet-move-btn" id="moveTomBtn" type="button">Tomorrow</button>
      <button class="sheet-move-btn" id="moveNoneBtn" type="button">No date</button>
    </div>
    <div class="field-group">
      <div class="field-row"><span class="fname">Date</span><input type="date" id="editDate" value="${t.date || ''}"></div>
      <div class="field-row"><span class="fname">Time</span>${timePickerContainerHtml('editTime', t.time || '')}</div>
      <div class="field-row"><span class="fname">Estimate</span>${estimatePickerContainerHtml('editEstimate', t.estimate || '')}</div>
      <div class="field-row"><span class="fname">Repeats</span>
        <select id="editRecur">
          <option value="none" ${t.recurring==='none'?'selected':''}>Once</option>
          <option value="daily" ${t.recurring==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${t.recurring==='weekly'?'selected':''}>Weekly</option>
          <option value="weekdays" ${t.recurring==='weekdays'?'selected':''}>Weekdays</option>
        </select>
      </div>
      <div class="field-row"><span class="fname">Context</span>
        <select id="editContext">
          <option value="" ${!t.context?'selected':''}>—</option>
          <option value="Floor" ${t.context==='Floor'?'selected':''}>Floor</option>
          <option value="Admin" ${t.context==='Admin'?'selected':''}>Admin</option>
          <option value="App" ${t.context==='App'?'selected':''}>App</option>
          <option value="Home" ${t.context==='Home'?'selected':''}>Home</option>
        </select>
      </div>
      <div class="toggle-row"><span class="fname">Flagged</span><button class="ios-switch ${t.flagged?'on':''}" id="editFlagToggle" data-on="${t.flagged?'1':'0'}" type="button"><span class="thumb"></span></button></div>
    </div>
    <div class="sheet-actions">
      <button class="sheet-cancel" id="sheetCancel" type="button">Cancel</button>
      <button class="sheet-delete" id="sheetDelete" type="button">Delete</button>
      <button class="sheet-save" id="sheetSave" type="button">Save</button>
    </div>`;
}

function wireSheet(t) {
  document.getElementById('sheetCancel').addEventListener('click', closeSheet);
  document.getElementById('sheetDelete').addEventListener('click', () => { deleteTask(t.id); closeSheet(); });

  if (t.kind === 'goal') {
    wireDateStrip('editDeadline', t.deadline || TODAY);
  }

  wireEstimatePicker('editEstimate'); // safe no-op if this sheet has no estimate field

  if (t.kind === 'task') {
    document.getElementById('moveTodayBtn').addEventListener('click', () => { document.getElementById('editDate').value = TODAY; });
    document.getElementById('moveTomBtn').addEventListener('click', () => { document.getElementById('editDate').value = addDays(TODAY, 1); });
    document.getElementById('moveNoneBtn').addEventListener('click', () => { document.getElementById('editDate').value = ''; });
    wireTimePicker('editTime');
    const flagBtn = document.getElementById('editFlagToggle');
    flagBtn.addEventListener('click', () => {
      const on = flagBtn.dataset.on !== '1';
      flagBtn.dataset.on = on ? '1' : '0';
      flagBtn.classList.toggle('on', on);
    });
  }

  document.getElementById('sheetSave').addEventListener('click', () => {
    const title = document.getElementById('editTitle').value.trim();
    if (!title) { document.getElementById('editTitle').focus(); return; }
    t.title = title;
    const notesEl = document.getElementById('editNotes');
    if (notesEl) t.notes = notesEl.value.trim();
    if (document.getElementById('editEstimateContainer')) t.estimate = getEstimatePickerValue('editEstimate');
    if (t.kind === 'goal') {
      t.deadline = getDateStripValue('editDeadline') || t.deadline;
    } else if (t.kind === 'task') {
      t.date = document.getElementById('editDate').value || '';
      t.time = getTimePickerValue('editTime');
      t.recurring = document.getElementById('editRecur').value;
      t.context = document.getElementById('editContext').value || '';
      t.flagged = document.getElementById('editFlagToggle').dataset.on === '1';
    }
    saveTasks();
    renderAll();
    closeSheet();
  });
}

function openSheet() {
  scrimEl.style.pointerEvents = 'auto';
  sheetEl.style.pointerEvents = 'auto';
  animateOpacity(scrimEl, 1, 220);
  animateOpacity(sheetEl, 1, 180);
  const s = new Spring(0.92, { dampingRatio: 0.84, response: 0.3 });
  s.set(1);
  runSpring(s, (v) => { sheetEl.style.transform = `translate(-50%, -50%) scale(${v})`; });
}
function closeSheet() {
  const start = getSheetScale(sheetEl);
  const s = new Spring(start, { dampingRatio: 1, response: 0.22 });
  s.set(0.92);
  runSpring(s, (v) => { sheetEl.style.transform = `translate(-50%, -50%) scale(${v})`; }, () => {
    scrimEl.style.pointerEvents = 'none';
    sheetEl.style.pointerEvents = 'none';
  });
  animateOpacity(scrimEl, 0, 180);
  animateOpacity(sheetEl, 0, 150);
  editingId = null;
}
function getSheetScale(el) {
  const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
  return m ? parseFloat(m[1]) : 0.92;
}
function animateOpacity(el, target, ms) {
  if (REDUCE_MOTION) { el.style.opacity = target; return; }
  const start = parseFloat(el.style.opacity || 0);
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / ms);
    el.style.opacity = start + (target - start) * p;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
scrimEl.addEventListener('click', closeSheet);

/* ===================== Midnight rollover ===================== */
setInterval(() => {
  const t = todayStr();
  if (t !== TODAY) { TODAY = t; renderAll(); }
}, 60000);

/* ===================== Init ===================== */
(async function init() {
  document.getElementById('fabAdd').innerHTML = ICON_PLUS;
  document.getElementById('fabAdd').addEventListener('click', openAddSheet);
  await loadAll();
  renderAll();
})();
