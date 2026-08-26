// The planner: Today, Calendar, Goals, Inbox.
//
// This is the original app's logic, kept as close to the source as possible -
// same data shape, same sort rules, same swipe gestures, same sheets. What
// changed: the strings go through i18n, and `tasks`/`saveTasks` are now the
// Supabase-backed store in tasks.js instead of the `window.storage` object,
// which does not exist outside the environment it was written in.

import { t, lang } from './i18n.js';
import { items, saveItems } from './tasks.js';
import {
  $, escapeHtml, uid, Spring, runSpring, project, rubberband,
  ICON_CHECK, ICON_TRASH, ICON_CHEVRON, ICON_BOLT,
  todayStr, parseDateStr, addDays, dayNum, monthStart, addMonths, daysBetween,
  fmtDateFull, fmtMonthDay, fmtMonthYear, fmtTime, dowAbbr, dowLabels,
  dateStripWrapHtml, wireDateStrip, getDateStripValue,
  timePickerContainerHtml, wireTimePicker, getTimePickerValue,
  sheetEl, openSheet, closeSheet, toast, refresh,
} from './ui.js';
import { diaryDatesInRange, openDiaryDate } from './diary.js';

export const CONTEXTS = ['Floor', 'Admin', 'App', 'Home'];
export const CONTEXT_COLORS = { Floor: 'var(--sys-orange)', Admin: 'var(--sys-gray)', App: 'var(--sys-teal)', Home: 'var(--sys-purple)' };

let activeContext = 'All';
let monthCursor = null;
let searchQuery = '';
let goalAddOpenId = null;
let pendingDelete = null;

const TODAY = () => todayStr();

/* ===================== helpers ===================== */

export function appliesOnDate(t2, dateStr) {
  if (t2.kind !== 'task') return false;
  if (t2.recurring === 'daily') return true;
  if (t2.recurring === 'weekdays') { const dow = parseDateStr(dateStr).getDay(); return dow >= 1 && dow <= 5; }
  if (t2.recurring === 'weekly' && t2.date) return parseDateStr(dateStr).getDay() === parseDateStr(t2.date).getDay();
  return t2.date === dateStr;
}
function isDoneOnDate(t2, dateStr) {
  if (t2.recurring && t2.recurring !== 'none') return t2.lastCompletedDate === dateStr;
  return !!t2.completed;
}
function isCarried(t2) { return t2.kind === 'task' && t2.recurring === 'none' && t2.date && t2.date < TODAY() && !t2.completed; }
function daysOverdue(t2) { return Math.max(0, daysBetween(t2.date, TODAY())); }
export function isInboxTask(t2) { return t2.kind === 'task' && t2.recurring === 'none' && !t2.date; }
function matchesContext(t2) { return activeContext === 'All' || t2.context === activeContext; }

export function inboxCount() { return items.filter(isInboxTask).length; }
export function goalsSoonCount() {
  return items.filter(x => x.kind === 'goal' && !x.finished && daysBetween(TODAY(), x.deadline) <= 3).length;
}
export function monthCursorLabel() { return fmtMonthYear(monthCursor || monthStart(TODAY())); }

function save() { saveItems({ onError: () => setStatus(t('planner.saveFail')) }); }
function setStatus(msg) { const el = $('statusLine'); if (el) el.textContent = msg; }

function recurringLabel(t2) {
  if (t2.recurring === 'daily') return t('rep.daily');
  if (t2.recurring === 'weekdays') return t('rep.weekdays');
  if (t2.recurring === 'weekly') return t2.date ? t('rep.everyDow', { dow: dowAbbr(t2.date) }) : t('rep.weekly');
  return '';
}

function contextFilterHtml() {
  const chips = ['All', ...CONTEXTS];
  return `<div class="ctxfilter-row">${chips.map(c =>
    `<button class="ctxfilter-btn ${activeContext === c ? 'active' : ''}" data-ctxf="${c}" type="button">${c === 'All' ? t('ctx.all') : c}</button>`
  ).join('')}</div>`;
}
function wireContextFilter(el) {
  el.querySelectorAll('[data-ctxf]').forEach(b => b.addEventListener('click', e => {
    activeContext = e.currentTarget.getAttribute('data-ctxf');
    refresh();
  }));
}

/* ===================== TODAY ===================== */

export function renderToday() {
  const el = $('screenContent');
  const today = TODAY();
  const ongoing = items.filter(x => x.kind === 'ongoing' && !x.finished && matchesContext(x));
  const goalsSoon = items.filter(x => x.kind === 'goal' && !x.finished && daysBetween(today, x.deadline) <= 3)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const todays = items.filter(x => x.kind === 'task' && (appliesOnDate(x, today) || isCarried(x)) && matchesContext(x));
  todays.sort((a, b) => {
    const ad = isDoneOnDate(a, today), bd = isDoneOnDate(b, today);
    if (ad !== bd) return ad ? 1 : -1;
    const af = a.flagged ? 0 : 1, bf = b.flagged ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0);
  });
  const doneCount = todays.filter(x => isDoneOnDate(x, today)).length;

  let html = contextFilterHtml();

  if (goalsSoon.length) {
    html += `<div class="goal-banner">
      <div class="goal-banner-title">${t('goal.comingUp')}</div>
      ${goalsSoon.map(g => {
        const d = daysBetween(today, g.deadline);
        const label = d < 0 ? t('goal.overdue', { n: -d }) : d === 0 ? t('goal.dueToday') : t('goal.daysLeft', { n: d });
        return `<div class="goal-banner-item" data-goalbanner="${g.id}"><span class="gname">${escapeHtml(g.title)}</span><span class="gdays ${d < 0 ? 'over' : ''}">${label}</span></div>`;
      }).join('')}
    </div>`;
  }

  if (ongoing.length) {
    html += `<div class="section-title">${t('sec.ongoing')}</div><div class="group">`;
    html += ongoing.map(ongoingRowHtml).join('');
    html += `</div>`;
  }

  html += `<div class="section-title">${t('sec.tasks')} &nbsp;&middot;&nbsp; ${doneCount}/${todays.length}</div><div class="group">`;
  html += todays.length ? todays.map(x => taskRowHtml(x, today)).join('') : `<div class="empty-note">${t('empty.today')}</div>`;
  html += `</div><div class="status-line" id="statusLine"></div>`;

  el.innerHTML = html;
  wireTaskRows(el, today);
  wireOngoingRows(el);
  wireContextFilter(el);
  el.querySelectorAll('[data-goalbanner]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goalbanner'))));
}

function ongoingRowHtml(x) {
  const today = TODAY();
  const lastTouch = x.lastTouchedDate || x.startedDate;
  const staleDays = daysBetween(lastTouch, today);
  const startedDays = daysBetween(x.startedDate, today);
  const started = startedDays === 0 ? t('time.today') : t('time.daysAgo', { n: startedDays });
  const touched = staleDays === 0 ? t('time.today') : t('time.daysAgo', { n: staleDays });
  return `<div class="ongoing-row">
      <div class="ongoing-top"><div class="ongoing-title" data-ongoingbody="${x.id}">${escapeHtml(x.title)}</div></div>
      ${x.notes ? `<div class="row-notes">${escapeHtml(x.notes)}</div>` : ''}
      <div class="ongoing-meta ${staleDays >= 2 ? 'stale' : ''}">${t('ongoing.meta', { started, touched })}${x.context ? ` &middot; ${escapeHtml(x.context)}` : ''}</div>
      <div class="ongoing-actions">
        <button class="ongoing-btn log" data-log="${x.id}" type="button">${ICON_BOLT} ${t('ongoing.log')}</button>
        <button class="ongoing-btn finish" data-finish="${x.id}" type="button">${ICON_CHECK} ${t('ongoing.finish')}</button>
      </div>
    </div>`;
}
function wireOngoingRows(el) {
  el.querySelectorAll('[data-ongoingbody]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-ongoingbody'))));
  el.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-log'));
    if (x) { x.lastTouchedDate = TODAY(); save(); refresh(); }
  }));
  el.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-finish'));
    if (x) { x.finished = true; x.finishedDate = TODAY(); save(); refresh(); }
  }));
}

/* ===================== task rows ===================== */

function taskRowHtml(x, dateStr) {
  const done = isDoneOnDate(x, dateStr);
  const meta = [];
  if (isCarried(x)) meta.push(`<span class="meta-chip age">${daysOverdue(x)}d</span>`);
  if (x.time) meta.push(`<span class="meta-chip">${fmtTime(x.time)}</span>`);
  if (x.recurring && x.recurring !== 'none') meta.push(`<span class="meta-chip">${recurringLabel(x)}</span>`);
  if (x.context) meta.push(`<span class="meta-chip">${escapeHtml(x.context)}</span>`);
  if (x.goalId) meta.push(`<span class="meta-chip goal">${t('chip.goal')}</span>`);
  return `<div class="swipe-slot" data-taskslot="${x.id}">
      <div class="swipe-bg">
        <span class="swipe-side left">${ICON_CHECK} ${t('swipe.complete')}</span>
        <span class="swipe-side right">${t('swipe.delete')} ${ICON_TRASH}</span>
      </div>
      <div class="row">
        <button class="check-circle ${done ? 'done' : ''} ${x.flagged ? 'flag-color' : ''}" style="--dot-color:var(--sys-orange)" data-check="${x.id}" aria-label="${t('aria.toggleDone')}">${done ? ICON_CHECK : ''}</button>
        <div class="row-body" data-body="${x.id}">
          <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
          ${x.notes ? `<div class="row-notes">${escapeHtml(x.notes)}</div>` : ''}
          ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
        </div>
        <button class="row-del" data-del="${x.id}" aria-label="${t('aria.delete')}">${ICON_TRASH}</button>
      </div>
    </div>`;
}

function wireTaskRows(el, dateStr) {
  el.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), dateStr);
  }));
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget);
  }));
  el.querySelectorAll('[data-taskslot]').forEach(slot => attachSwipe(slot, dateStr));
}

function toggleCompleteOn(id, dateStr) {
  const x = items.find(i => i.id === id);
  if (!x) return;
  if (x.recurring && x.recurring !== 'none') {
    x.lastCompletedDate = (x.lastCompletedDate === dateStr) ? null : dateStr;
  } else {
    x.completed = !x.completed;
  }
  save();
  refresh();
}

function requestDelete(id, btn) {
  if (pendingDelete !== id) {
    pendingDelete = id;
    if (btn) { btn.classList.add('confirm'); btn.title = t('confirm.tapAgain'); }
    setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; refresh(); } }, 3000);
    return;
  }
  deleteItem(id);
}
function deleteItem(id) {
  const i = items.findIndex(x => x.id === id);
  if (i >= 0) items.splice(i, 1);
  pendingDelete = null;
  save();
  refresh();
}

/* ---- swipe gesture (touch only) ---- */
function attachSwipe(slot, dateStr) {
  const row = slot.querySelector('.row');
  const swipeBg = slot.querySelector('.swipe-bg');
  const id = slot.getAttribute('data-taskslot');
  slot.addEventListener('pointerdown', e => {
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
    function settle() {
      const s = new Spring(dx, { dampingRatio: 0.8, response: 0.24 });
      s.velocity = vel; s.set(0);
      runSpring(s, v => { row.style.transform = `translateX(${v}px)`; },
        () => { row.style.transform = ''; if (swipeBg) swipeBg.style.opacity = '0'; });
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
        runSpring(s, v => {
          row.style.transform = `translateX(${v}px)`;
          row.style.opacity = Math.max(0, 1 - Math.abs(v) / (width * 1.2));
        }, () => deleteItem(id));
      } else if (projected > width * 0.5) {
        toggleCompleteOn(id, dateStr);
        settle();
      } else {
        settle();
      }
    }
    slot.addEventListener('pointermove', onMove);
    slot.addEventListener('pointerup', onUp);
    slot.addEventListener('pointercancel', onUp);
  });
}

/* ===================== CALENDAR ===================== */

export function renderWeek() {
  const el = $('screenContent');
  let html = `<div class="search-row">
    <span class="search-icon">${ICON_CHEVRON}</span>
    <input type="text" id="weekSearch" data-i18n-ph="search.ph" placeholder="${t('search.ph')}" value="${escapeHtml(searchQuery)}">
    ${searchQuery ? `<button class="search-clear" id="searchClear" type="button">&times;</button>` : ''}
  </div>`;

  if (searchQuery.trim()) {
    html += renderSearchResultsHtml(searchQuery.trim());
    el.innerHTML = html;
    wireSearchBar();
    return;
  }

  html += contextFilterHtml();
  html += renderMonthGridHtml();
  el.innerHTML = html;
  wireSearchBar();
  wireContextFilter(el);
  wireMonthGrid(el);
}

function wireSearchBar() {
  const input = $('weekSearch');
  if (input) {
    input.addEventListener('input', () => { searchQuery = input.value; renderWeek(); });
    if (document.activeElement !== input && searchQuery) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  const clear = $('searchClear');
  if (clear) clear.addEventListener('click', () => { searchQuery = ''; renderWeek(); });
}

function renderSearchResultsHtml(query) {
  const q = query.toLowerCase();
  const results = items.filter(x => (x.title || '').toLowerCase().includes(q)
    || (x.notes || '').toLowerCase().includes(q));
  results.sort((a, b) => (b.order || 0) - (a.order || 0));

  let html = `<div class="section-title">${t('search.results', { n: results.length, q: escapeHtml(query) })}</div><div class="group">`;
  html += results.length ? results.map(searchRowHtml).join('') : `<div class="empty-note">${t('search.none')}</div>`;
  html += `</div>`;
  return html;
}
function searchRowHtml(x) {
  let kindLabel = '', meta = '';
  if (x.kind === 'task') {
    kindLabel = t('kind.task');
    meta = x.recurring !== 'none'
      ? recurringLabel(x) + (x.time ? ' · ' + fmtTime(x.time) : '')
      : (x.date ? (x.time ? `${fmtMonthDay(x.date)} · ${fmtTime(x.time)}` : fmtMonthDay(x.date)) : t('meta.noDate'));
  } else if (x.kind === 'ongoing') {
    kindLabel = t('kind.ongoing');
    meta = x.finished ? t('meta.finished') : t('meta.started', { d: fmtMonthDay(x.startedDate) });
  } else {
    kindLabel = t('kind.goal');
    meta = x.finished ? t('meta.done') : t('meta.due', { d: fmtMonthDay(x.deadline) });
  }
  return `<div class="row" data-searchresult="${x.id}">
      <div class="row-body">
        <div class="row-title">${escapeHtml(x.title)}</div>
        <div class="row-meta"><span class="meta-chip">${kindLabel}</span><span>${escapeHtml(meta)}</span></div>
      </div>
      <span class="row-trail">${ICON_CHEVRON}</span>
    </div>`;
}

function renderMonthGridHtml() {
  if (!monthCursor) monthCursor = monthStart(TODAY());
  const first = parseDateStr(monthCursor);
  const month = first.getMonth();
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = addDays(monthCursor, -firstDow);
  const lastDate = new Date(first.getFullYear(), month + 1, 0);
  const lastDow = (lastDate.getDay() + 6) % 7;
  const gridEnd = addDays(todayStr(lastDate), 6 - lastDow);
  const weeks = Math.round((daysBetween(gridStart, gridEnd) + 1) / 7);
  const diaryDays = diaryDatesInRange(gridStart, gridEnd);

  let html = `<div class="month-nav">
    <button class="week-nav-btn" id="monthPrev" type="button">&lsaquo;</button>
    <div class="month-nav-label">${fmtMonthYear(monthCursor)}</div>
    <button class="week-nav-btn" id="monthNext" type="button">&rsaquo;</button>
  </div>`;

  html += `<div class="month-legend">
    ${CONTEXTS.map(c => `<span class="mleg-item"><span class="mleg-dot" style="background:${CONTEXT_COLORS[c]}"></span>${c}</span>`).join('')}
    <span class="mleg-item"><span class="mc-diary"></span>${t('legend.diary')}</span>
  </div>`;

  html += `<div class="month-dow-row">${dowLabels('short').map(d => `<div class="month-dow">${d}</div>`).join('')}</div>`;

  let cursor = gridStart;
  const today = TODAY();
  for (let w = 0; w < weeks; w++) {
    html += `<div class="month-week-row">`;
    for (let i = 0; i < 7; i++) {
      const d = cursor;
      const inMonth = parseDateStr(d).getMonth() === month;
      const dayItems = items.filter(x => x.kind === 'task' && appliesOnDate(x, d) && matchesContext(x));
      const ctxs = [...new Set(dayItems.map(x => x.context).filter(Boolean))];
      const hasDiary = diaryDays.has(d);
      html += `<button class="month-cell ${inMonth ? '' : 'outmonth'} ${d === today ? 'is-today' : ''}" data-monthday="${d}" type="button">
        <span class="mc-num">${dayNum(d)}</span>
        ${(dayItems.length || hasDiary) ? `<span class="mc-dots">
          ${ctxs.slice(0, 3).map(c => `<span class="mc-dot" style="background:${CONTEXT_COLORS[c] || 'var(--sys-gray)'}"></span>`).join('')}
          ${hasDiary ? '<span class="mc-diary"></span>' : ''}
          ${dayItems.length ? `<span class="mc-count">${dayItems.length}</span>` : ''}
        </span>` : ''}
      </button>`;
      cursor = addDays(cursor, 1);
    }
    html += `</div>`;
  }
  return html;
}

function wireMonthGrid(el) {
  $('monthPrev').addEventListener('click', () => { monthCursor = addMonths(monthCursor, -1); refresh(); });
  $('monthNext').addEventListener('click', () => { monthCursor = addMonths(monthCursor, 1); refresh(); });
  el.querySelectorAll('[data-monthday]').forEach(b => b.addEventListener('click', e => openDayDetail(e.currentTarget.getAttribute('data-monthday'))));
}

function openDayDetail(dateStr) {
  const dayItems = items.filter(x => x.kind === 'task' && appliesOnDate(x, dateStr) && matchesContext(x));
  dayItems.sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0));
  const hasDiary = diaryDatesInRange(dateStr, dateStr).has(dateStr);

  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${fmtDateFull(dateStr)}</div>
    <div class="group" style="margin-bottom:14px;">
      ${dayItems.length ? dayItems.map(x => dayRowHtml(x, dateStr)).join('') : `<div class="empty-note">${t('empty.day')}</div>`}
    </div>
    <button class="sheet-move-btn" id="dayDiaryBtn" type="button" style="width:100%;margin-bottom:10px;">
      ${hasDiary ? t('day.openDiary') : t('day.writeDiary')}
    </button>
    <div class="sheet-actions"><button class="sheet-cancel" id="dayClose" type="button">${t('btn.close')}</button></div>`;

  $('dayClose').addEventListener('click', closeSheet);
  $('dayDiaryBtn').addEventListener('click', () => { closeSheet(); openDiaryDate(dateStr); });
  sheetEl().querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    toggleCompleteOn(e.currentTarget.getAttribute('data-check'), dateStr);
    openDayDetail(dateStr);
  }));
  sheetEl().querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  sheetEl().querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget);
    openDayDetail(dateStr);
  }));
  openSheet();
}

function dayRowHtml(x, dateStr) {
  const done = isDoneOnDate(x, dateStr);
  const meta = [];
  if (x.time) meta.push(`<span class="meta-chip">${fmtTime(x.time)}</span>`);
  if (x.recurring && x.recurring !== 'none') meta.push(`<span class="meta-chip">${recurringLabel(x)}</span>`);
  if (x.context) meta.push(`<span class="meta-chip">${escapeHtml(x.context)}</span>`);
  return `<div class="row week-task-row">
      <button class="check-circle ${done ? 'done' : ''}" data-check="${x.id}" aria-label="${t('aria.toggleDone')}">${done ? ICON_CHECK : ''}</button>
      <div class="row-body" data-body="${x.id}">
        <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      <button class="row-del" data-del="${x.id}" aria-label="${t('aria.delete')}">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== GOALS ===================== */

export function renderGoals() {
  const el = $('screenContent');
  const active = items.filter(x => x.kind === 'goal' && !x.finished).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const done = items.filter(x => x.kind === 'goal' && x.finished).sort((a, b) => (b.finishedDate || '').localeCompare(a.finishedDate || ''));

  let html = `<div class="section-title">${t('sec.active')}</div><div class="group">`;
  html += active.length ? active.map(goalCardHtml).join('') : `<div class="empty-note">${t('empty.goals')}</div>`;
  html += `</div>`;

  if (done.length) {
    html += `<div class="section-title">${t('sec.completed')}</div><div class="group">${done.map(goalCardHtml).join('')}</div>`;
  }
  html += `<div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-goaltitle]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goaltitle'))));
  el.querySelectorAll('[data-goalcheck]').forEach(b => b.addEventListener('click', e => {
    const g = items.find(x => x.id === e.currentTarget.getAttribute('data-goalcheck'));
    if (g) { g.finished = !g.finished; g.finishedDate = g.finished ? TODAY() : null; save(); refresh(); }
  }));
  el.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), TODAY());
  }));
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  el.querySelectorAll('[data-goaladdtask]').forEach(b => b.addEventListener('click', e => {
    goalAddOpenId = e.currentTarget.getAttribute('data-goaladdtask');
    renderGoals();
  }));
  el.querySelectorAll('[data-goaltaskinput]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      const gid = input.getAttribute('data-goaltaskinput');
      if (title) {
        items.push(newTask({ title, goalId: gid }));
        save();
      }
      goalAddOpenId = null;
      refresh();
    });
    input.addEventListener('blur', () => {
      if (goalAddOpenId === input.getAttribute('data-goaltaskinput')) { goalAddOpenId = null; renderGoals(); }
    });
  });
  const openInput = el.querySelector('[data-goaltaskinput]');
  if (openInput) openInput.focus();
}

function goalCardHtml(g) {
  const d = daysBetween(TODAY(), g.deadline);
  let countdown;
  if (g.finished) countdown = t('meta.done');
  else if (d < 0) countdown = t('goal.overdue', { n: -d });
  else if (d === 0) countdown = t('goal.dueToday');
  else countdown = t('goal.daysLeft', { n: d });
  const cdClass = g.finished ? 'done' : d < 0 ? 'over' : '';
  const linked = items.filter(x => x.kind === 'task' && x.goalId === g.id);
  const linkedDone = linked.filter(x => x.completed).length;

  return `<div class="goal-card">
      <div class="goal-top">
        <button class="check-circle" style="width:22px;height:22px;" data-goalcheck="${g.id}" aria-label="${t('aria.goalDone')}">${g.finished ? ICON_CHECK : ''}</button>
        <div style="flex:1;min-width:0;">
          <div class="goal-title ${g.finished ? 'done' : ''}" data-goaltitle="${g.id}">${escapeHtml(g.title)}</div>
          <div class="goal-sub">${t('meta.due', { d: fmtMonthDay(g.deadline) })}${linked.length ? ` &middot; ${t('goal.tasksDone', { done: linkedDone, total: linked.length })}` : ''}</div>
          ${g.notes ? `<div class="row-notes" style="white-space:normal;">${escapeHtml(g.notes)}</div>` : ''}
        </div>
        <div class="goal-countdown ${cdClass}">${countdown}</div>
      </div>
      ${linked.length ? `<div class="goal-tasks">${linked.map(x => `
        <div class="goal-task-row">
          <button class="check-circle ${x.completed ? 'done' : ''}" data-check="${x.id}" style="width:19px;height:19px;">${x.completed ? ICON_CHECK : ''}</button>
          <div class="row-title" data-body="${x.id}">${escapeHtml(x.title)}</div>
        </div>`).join('')}</div>` : ''}
      ${goalAddOpenId === g.id
        ? `<input type="text" class="tag-input" data-goaltaskinput="${g.id}" placeholder="${t('goal.taskPh')}">`
        : `<button class="goal-add-task" data-goaladdtask="${g.id}" type="button">${t('goal.addTask')}</button>`}
    </div>`;
}

/* ===================== INBOX ===================== */

export function renderInbox() {
  const el = $('screenContent');
  const list = items.filter(x => isInboxTask(x) && matchesContext(x)).sort((a, b) => (b.order || 0) - (a.order || 0));

  let html = contextFilterHtml();
  html += `<div class="section-title">${t('sec.unscheduled')}</div><div class="group">`;
  html += list.length ? list.map(inboxRowHtml).join('') : `<div class="empty-note">${t('empty.inbox')}</div>`;
  html += `</div><div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  wireContextFilter(el);
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget)));
  el.querySelectorAll('[data-movetoday]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-movetoday'));
    if (x) { x.date = TODAY(); save(); refresh(); }
  }));
  el.querySelectorAll('[data-movetom]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-movetom'));
    if (x) { x.date = addDays(TODAY(), 1); save(); refresh(); }
  }));
}

function inboxRowHtml(x) {
  return `<div class="row">
      <div class="row-body" data-body="${x.id}">
        <div class="row-title">${escapeHtml(x.title)}${x.context ? ` <span class="meta-chip">${escapeHtml(x.context)}</span>` : ''}</div>
      </div>
      <button class="link" data-movetoday="${x.id}" type="button">${t('btn.today')}</button>
      <button class="link" data-movetom="${x.id}" type="button">${t('btn.tomorrow')}</button>
      <button class="row-del" data-del="${x.id}" aria-label="${t('aria.delete')}">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== new item shapes ===================== */

function newTask(over = {}) {
  return {
    id: uid(), kind: 'task', title: '', notes: '', date: '', time: '', recurring: 'none',
    flagged: false, context: '', completed: false, lastCompletedDate: null, goalId: null,
    startedDate: '', lastTouchedDate: '', deadline: '', finished: false, finishedDate: null,
    order: Date.now(), createdAt: Date.now(), ...over,
  };
}

/* ===================== capture sheet ===================== */

let capArea = null;

const CAP_AREAS = () => [
  { id: 'today', label: t('cap.today') },
  { id: 'week', label: t('cap.week') },
  { id: 'ongoing', label: t('cap.ongoing') },
  { id: 'goal', label: t('cap.goal') },
  { id: 'inbox', label: t('cap.inbox') },
  { id: 'diary', label: t('cap.diary') },
];

export function openCaptureSheet(preferred) {
  capArea = preferred || null;
  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${t('cap.title')}</div>
    <input type="text" id="capTitle" placeholder="${t('cap.ph')}">
    <div class="cap-area-label">${t('cap.where')}</div>
    <div class="cap-area-grid">
      ${CAP_AREAS().map(a => `<button class="cap-area-btn ${capArea === a.id ? 'active' : ''}" data-area="${a.id}" type="button">${a.label}</button>`).join('')}
    </div>
    <div id="capExtra">${capExtraHtml()}</div>
    <div class="sheet-actions">
      <button class="sheet-cancel" id="capCancel" type="button">${t('btn.cancel')}</button>
      <button class="sheet-save" id="capSave" type="button">${t('btn.add')}</button>
    </div>`;

  $('capCancel').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', e => {
    capArea = e.currentTarget.getAttribute('data-area');
    document.querySelectorAll('[data-area]').forEach(x => x.classList.toggle('active', x.getAttribute('data-area') === capArea));
    $('capExtra').innerHTML = capExtraHtml();
    wireCapExtra();
  }));
  wireCapExtra();
  $('capSave').addEventListener('click', submitCapture);
  $('capTitle').addEventListener('keydown', e => { if (e.key === 'Enter') submitCapture(); });

  openSheet();
  setTimeout(() => $('capTitle')?.focus(), 60);
}

function capContextPillHtml() {
  return `<label class="qo-pill">${t('cap.area')}<select id="capContext">
    <option value="">${t('cap.noArea')}</option>
    ${CONTEXTS.map(c => `<option value="${c}">${c}</option>`).join('')}
  </select></label>`;
}
function capRepeatPillHtml() {
  return `<label class="qo-pill">${t('cap.repeat')}<select id="capRepeat">
    <option value="none">${t('rep.once')}</option>
    <option value="daily">${t('rep.daily')}</option>
    <option value="weekly">${t('rep.weekly')}</option>
    <option value="weekdays">${t('rep.weekdays')}</option>
  </select></label>`;
}
function capExtraHtml() {
  const commons = `<div class="quickadd-options" style="padding:0;margin-top:10px;">
      ${timePickerContainerHtml('capTime', '', t('cap.addTime'))}
      ${capRepeatPillHtml()}
      ${capContextPillHtml()}
      <button class="qo-flag" id="capFlag" type="button" data-on="0">${t('cap.flag')}</button>
    </div>`;

  if (capArea === 'today') return `<div class="cap-extra-group">${commons}</div>`;
  if (capArea === 'week') return `<div class="cap-extra-group">${dateStripWrapHtml('capWeekDay')}${commons}</div>`;
  if (capArea === 'goal') return `<div class="cap-extra-group">${dateStripWrapHtml('capDeadline')}</div>`;
  if (capArea === 'ongoing') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">${capContextPillHtml()}</div>
      <div class="cap-extra-note">${t('cap.ongoingNote')}</div></div>`;
  }
  if (capArea === 'inbox') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">${capContextPillHtml()}</div>
      <div class="cap-extra-note">${t('cap.inboxNote')}</div></div>`;
  }
  if (capArea === 'diary') {
    return `<div class="cap-extra-group">
      <div class="cap-extra-note">${t('cap.diaryNote')}</div></div>`;
  }
  return `<div class="cap-extra-note">${t('cap.pickFirst')}</div>`;
}
function wireCapExtra() {
  wireTimePicker('capTime', t('cap.addTime'));
  const flag = $('capFlag');
  if (flag) flag.addEventListener('click', () => {
    const on = flag.dataset.on !== '1';
    flag.dataset.on = on ? '1' : '0';
    flag.classList.toggle('on', on);
  });
  if (capArea === 'week') wireDateStrip('capWeekDay', addDays(TODAY(), 1), TODAY());
  if (capArea === 'goal') wireDateStrip('capDeadline', addDays(TODAY(), 14), TODAY());
}

function submitCapture() {
  const titleInput = $('capTitle');
  const title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }
  if (!capArea) { document.querySelector('.cap-area-label').style.color = 'var(--sys-red)'; return; }

  const time = getTimePickerValue('capTime');
  const recurring = $('capRepeat') ? $('capRepeat').value : 'none';
  const flagged = $('capFlag') ? $('capFlag').dataset.on === '1' : false;
  const context = $('capContext') ? $('capContext').value : '';

  if (capArea === 'diary') {
    closeSheet();
    openDiaryDate(TODAY(), title);
    return;
  }

  if (capArea === 'today') {
    items.push(newTask({ title, date: TODAY(), time, recurring, flagged, context }));
  } else if (capArea === 'week') {
    items.push(newTask({ title, date: getDateStripValue('capWeekDay') || addDays(TODAY(), 1), time, recurring, flagged, context }));
  } else if (capArea === 'inbox') {
    items.push(newTask({ title, context }));
  } else if (capArea === 'ongoing') {
    items.push(newTask({ title, kind: 'ongoing', context, startedDate: TODAY(), lastTouchedDate: TODAY() }));
  } else if (capArea === 'goal') {
    items.push(newTask({ title, kind: 'goal', deadline: getDateStripValue('capDeadline') || addDays(TODAY(), 14) }));
  }
  save();
  refresh();
  closeSheet();
}

/* ===================== editor sheet ===================== */

export function openPlannerEditor(id) {
  const x = items.find(i => i.id === id);
  if (!x) return;
  sheetEl().innerHTML = editorHtml(x);
  wireEditor(x);
  openSheet();
}

function notesFieldHtml(x) {
  return `<textarea id="editNotes" class="sheet-notes" placeholder="${t('edit.notesPh')}" maxlength="2000">${escapeHtml(x.notes || '')}</textarea>`;
}

function editorHtml(x) {
  const actions = `<div class="sheet-actions">
      <button class="sheet-cancel" id="sheetCancel" type="button">${t('btn.cancel')}</button>
      <button class="sheet-delete" id="sheetDelete" type="button">${t('btn.delete')}</button>
      <button class="sheet-save" id="sheetSave" type="button">${t('btn.save')}</button>
    </div>`;

  if (x.kind === 'goal') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title">${t('edit.goal')}</div>
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="fname" style="margin-bottom:8px;">${t('edit.deadline')}</div>
      ${dateStripWrapHtml('editDeadline')}
      ${actions}`;
  }
  if (x.kind === 'ongoing') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title">${t('edit.ongoing')}</div>
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="field-group">
        <div class="field-row"><span class="fname">${t('edit.started')}</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.startedDate)}</span></div>
        <div class="field-row"><span class="fname">${t('edit.touched')}</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.lastTouchedDate || x.startedDate)}</span></div>
      </div>
      ${actions}`;
  }
  return `<div class="sheet-handle"></div>
    <div class="sheet-title">${t('edit.task')}</div>
    <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
    ${notesFieldHtml(x)}
    <div class="sheet-move-row">
      <button class="sheet-move-btn" id="moveTodayBtn" type="button">${t('btn.today')}</button>
      <button class="sheet-move-btn" id="moveTomBtn" type="button">${t('btn.tomorrow')}</button>
      <button class="sheet-move-btn" id="moveNoneBtn" type="button">${t('btn.noDate')}</button>
    </div>
    <div class="field-group">
      <div class="field-row"><span class="fname">${t('edit.date')}</span><input type="date" id="editDate" value="${x.date || ''}"></div>
      <div class="field-row"><span class="fname">${t('edit.time')}</span>${timePickerContainerHtml('editTime', x.time || '', t('cap.addTime'))}</div>
      <div class="field-row"><span class="fname">${t('edit.repeats')}</span>
        <select id="editRecur">
          <option value="none" ${x.recurring === 'none' ? 'selected' : ''}>${t('rep.once')}</option>
          <option value="daily" ${x.recurring === 'daily' ? 'selected' : ''}>${t('rep.daily')}</option>
          <option value="weekly" ${x.recurring === 'weekly' ? 'selected' : ''}>${t('rep.weekly')}</option>
          <option value="weekdays" ${x.recurring === 'weekdays' ? 'selected' : ''}>${t('rep.weekdays')}</option>
        </select>
      </div>
      <div class="field-row"><span class="fname">${t('edit.context')}</span>
        <select id="editContext">
          <option value="" ${!x.context ? 'selected' : ''}>&mdash;</option>
          ${CONTEXTS.map(c => `<option value="${c}" ${x.context === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="toggle-row"><span class="fname">${t('edit.flagged')}</span>
        <button class="ios-switch ${x.flagged ? 'on' : ''}" id="editFlagToggle" data-on="${x.flagged ? '1' : '0'}" type="button"><span class="thumb"></span></button>
      </div>
    </div>
    ${actions}`;
}

function wireEditor(x) {
  $('sheetCancel').addEventListener('click', closeSheet);
  $('sheetDelete').addEventListener('click', () => { deleteItem(x.id); closeSheet(); });

  if (x.kind === 'goal') wireDateStrip('editDeadline', x.deadline || TODAY(), TODAY());

  if (x.kind === 'task') {
    $('moveTodayBtn').addEventListener('click', () => { $('editDate').value = TODAY(); });
    $('moveTomBtn').addEventListener('click', () => { $('editDate').value = addDays(TODAY(), 1); });
    $('moveNoneBtn').addEventListener('click', () => { $('editDate').value = ''; });
    wireTimePicker('editTime', t('cap.addTime'));
    const flag = $('editFlagToggle');
    flag.addEventListener('click', () => {
      const on = flag.dataset.on !== '1';
      flag.dataset.on = on ? '1' : '0';
      flag.classList.toggle('on', on);
    });
  }

  $('sheetSave').addEventListener('click', () => {
    const title = $('editTitle').value.trim();
    if (!title) { $('editTitle').focus(); return; }
    x.title = title;
    const notes = $('editNotes');
    if (notes) x.notes = notes.value.trim();
    if (x.kind === 'goal') {
      x.deadline = getDateStripValue('editDeadline') || x.deadline;
    } else if (x.kind === 'task') {
      x.date = $('editDate').value || '';
      x.time = getTimePickerValue('editTime');
      x.recurring = $('editRecur').value;
      x.context = $('editContext').value || '';
      x.flagged = $('editFlagToggle').dataset.on === '1';
    }
    save();
    refresh();
    closeSheet();
  });
}

/* Search results are delegated, because the list is rebuilt as you type. */
document.addEventListener('click', e => {
  const row = e.target.closest('[data-searchresult]');
  if (row) openPlannerEditor(row.getAttribute('data-searchresult'));
});
