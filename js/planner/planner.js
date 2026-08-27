// The planner: Today, Calendar, Goals, Inbox.
//
// This is the original app's logic, kept as close to the source as possible -
// same data shape, same sort rules, same swipe gestures, same sheets. What
// changed: `tasks`/`saveTasks` are now the
// Supabase-backed store in tasks.js instead of the `window.storage` object,
// which does not exist outside the environment it was written in.

import { items, saveItems } from './tasks.js';
import { settings } from '../core/config.js';
import { QUADRANTS, quadrant, DEFAULT_QUADRANT } from './priority.js';
import {
  $, escapeHtml, uid, Spring, runSpring, project, rubberband,
  ICON_CHECK, ICON_TRASH, ICON_CHEVRON, ICON_BOLT,
  todayStr, parseDateStr, addDays, dayNum, monthStart, addMonths, daysBetween,
  fmtDateFull, fmtMonthDay, fmtMonthYear, fmtTime, dowAbbr, dowLabels,
  dateStripWrapHtml, wireDateStrip, getDateStripValue,
  timePickerContainerHtml, wireTimePicker, getTimePickerValue,
  estimatePickerContainerHtml, wireEstimatePicker, getEstimatePickerValue,
  dayTogglesHtml, wireDayToggles, getDayToggles, dayNames,
  sheetEl, openSheet, closeSheet, toast, refresh,
} from '../core/ui.js';
import { diaryDatesInRange, openDiaryDate } from '../diary/diary.js';

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
  if (t2.kind !== 'task' || t2.draft) return false;
  if (t2.recurring === 'daily') return true;
  if (t2.recurring === 'weekdays') { const dow = parseDateStr(dateStr).getDay(); return dow >= 1 && dow <= 5; }
  if (t2.recurring === 'days') {
    return Array.isArray(t2.repeatDays) && t2.repeatDays.includes(parseDateStr(dateStr).getDay());
  }
  if (t2.recurring === 'weekly' && t2.date) return parseDateStr(dateStr).getDay() === parseDateStr(t2.date).getDay();
  return t2.date === dateStr;
}
function isDoneOnDate(t2, dateStr) {
  if (t2.recurring && t2.recurring !== 'none') return t2.lastCompletedDate === dateStr;
  return !!t2.completed;
}
function isCarried(t2) { return t2.kind === 'task' && t2.recurring === 'none' && t2.date && t2.date < TODAY() && !t2.completed; }
function daysOverdue(t2) { return Math.max(0, daysBetween(t2.date, TODAY())); }
/** Goals whose deadline falls on this date. */
export function goalsDueOn(dateStr) {
  return items.filter(x => x.kind === 'goal' && x.deadline === dateStr);
}

export function isInboxTask(t2) { return t2.kind === 'task' && !t2.draft && t2.recurring === 'none' && !t2.date; }
export function drafts() { return items.filter(x => x.draft); }
export function draftCount() { return drafts().length; }
function matchesContext(t2) { return activeContext === 'All' || t2.context === activeContext; }

export function inboxCount() { return items.filter(isInboxTask).length + draftCount(); }
export function goalsSoonCount() {
  return items.filter(x => x.kind === 'goal' && !x.finished && daysBetween(TODAY(), x.deadline) <= 3).length;
}
export function monthCursorLabel() { return fmtMonthYear(monthCursor || monthStart(TODAY())); }

function save() { saveItems({ onError: () => setStatus('Could not save just now — will retry on the next change.') }); }
function setStatus(msg) { const el = $('statusLine'); if (el) el.textContent = msg; }

function recurringLabel(t2) {
  if (t2.recurring === 'daily') return 'daily';
  if (t2.recurring === 'weekdays') return 'weekdays';
  if (t2.recurring === 'days') return dayNames(t2.repeatDays) || 'no days picked';
  if (t2.recurring === 'weekly') return t2.date ? `every ${dowAbbr(t2.date)}` : 'weekly';
  return '';
}

function contextFilterHtml() {
  const chips = ['All', ...CONTEXTS];
  return `<div class="ctxfilter-row">${chips.map(c =>
    `<button class="ctxfilter-btn ${activeContext === c ? 'active' : ''}" data-ctxf="${c}" type="button">${c === 'All' ? 'All' : c}</button>`
  ).join('')}</div>`;
}
function wireContextFilter(el) {
  el.querySelectorAll('[data-ctxf]').forEach(b => b.addEventListener('click', e => {
    activeContext = e.currentTarget.getAttribute('data-ctxf');
    refresh();
  }));
}

/* ===================== TODAY ===================== */

/**
 * How Today is ordered. Done always sinks. Beyond that it follows whichever
 * sort was chosen in the morning briefing: by clock time, or by priority with
 * time breaking ties.
 */
export function todayOrder(today, mode = settings().todaySort) {
  return (a, b) => {
    const ad = isDoneOnDate(a, today), bd = isDoneOnDate(b, today);
    if (ad !== bd) return ad ? 1 : -1;

    if (mode === 'priority') {
      const ap = Number(a.priority) || DEFAULT_QUADRANT, bp = Number(b.priority) || DEFAULT_QUADRANT;
      if (ap !== bp) return ap - bp;
    } else {
      const af = a.flagged ? 0 : 1, bf = b.flagged ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    return (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0);
  };
}

export function renderToday() {
  const el = $('screenContent');
  const today = TODAY();
  const ongoing = items.filter(x => x.kind === 'ongoing' && !x.finished && matchesContext(x));
  const goalsSoon = items.filter(x => x.kind === 'goal' && !x.finished && daysBetween(today, x.deadline) <= 3)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const todays = items.filter(x => x.kind === 'task' && (appliesOnDate(x, today) || isCarried(x)) && matchesContext(x));
  todays.sort(todayOrder(today));
  const doneCount = todays.filter(x => isDoneOnDate(x, today)).length;

  let html = contextFilterHtml();

  const pending = draftCount();
  if (pending) {
    html += `<div class="goal-banner draft-banner" id="draftNudge">
      <div class="goal-banner-title">From your diary</div>
      <div class="goal-banner-item"><span class="gname">${pending} reminder${pending === 1 ? '' : 's'} waiting to be finished</span><span class="gdays">Inbox &rsaquo;</span></div>
    </div>`;
  }

  if (goalsSoon.length) {
    html += `<div class="goal-banner">
      <div class="goal-banner-title">Goals coming up</div>
      ${goalsSoon.map(g => {
        const d = daysBetween(today, g.deadline);
        const label = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d}d left`;
        return `<div class="goal-banner-item" data-goalbanner="${g.id}"><span class="gname">${escapeHtml(g.title)}</span><span class="gdays ${d < 0 ? 'over' : ''}">${label}</span></div>`;
      }).join('')}
    </div>`;
  }

  if (ongoing.length) {
    html += `<div class="section-title">Ongoing</div><div class="group">`;
    html += ongoing.map(ongoingRowHtml).join('');
    html += `</div>`;
  }

  html += `<div class="section-title">Tasks &nbsp;&middot;&nbsp; ${doneCount}/${todays.length}</div><div class="group">`;
  html += todays.length ? todays.map(x => taskRowHtml(x, today)).join('') : `<div class="empty-note">Nothing on your plate today. Tap + to add something.</div>`;
  html += `</div><div class="status-line" id="statusLine"></div>`;

  el.innerHTML = html;
  wireTaskRows(el, today);
  wireOngoingRows(el);
  wireContextFilter(el);
  el.querySelectorAll('[data-goalbanner]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goalbanner'))));
  $('draftNudge')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('app:goto', { detail: { screen: 'inbox' } })));
}

function ongoingRowHtml(x) {
  const today = TODAY();
  const lastTouch = x.lastTouchedDate || x.startedDate;
  const staleDays = daysBetween(lastTouch, today);
  const startedDays = daysBetween(x.startedDate, today);
  const started = startedDays === 0 ? 'today' : `${startedDays}d ago`;
  const touched = staleDays === 0 ? 'today' : `${staleDays}d ago`;
  return `<div class="ongoing-row">
      <div class="ongoing-top"><div class="ongoing-title" data-ongoingbody="${x.id}">${escapeHtml(x.title)}</div></div>
      ${x.notes ? `<div class="row-notes">${escapeHtml(x.notes)}</div>` : ''}
      <div class="ongoing-meta ${staleDays >= 2 ? 'stale' : ''}">${`Started ${started} · last touched ${touched}`}${x.context ? ` &middot; ${escapeHtml(x.context)}` : ''}${x.estimate ? ` &middot; ⏱ ${escapeHtml(x.estimate)}` : ''}</div>
      <div class="ongoing-actions">
        <button class="ongoing-btn log" data-log="${x.id}" type="button">${ICON_BOLT} Log today</button>
        <button class="ongoing-btn finish" data-finish="${x.id}" type="button">${ICON_CHECK} Finish</button>
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
  if (x.estimate) meta.push(`<span class="meta-chip">&#9201; ${escapeHtml(x.estimate)}</span>`);
  const q = quadrant(x.priority);
  if (q.value !== DEFAULT_QUADRANT) {
    meta.push(`<span class="meta-chip quad" style="--q:${q.colour}">${q.label}</span>`);
  }
  if (x.goalId) meta.push(`<span class="meta-chip goal">goal</span>`);
  return `<div class="swipe-slot" data-taskslot="${x.id}">
      <div class="swipe-bg">
        <span class="swipe-side left">${ICON_CHECK} Complete</span>
        <span class="swipe-side right">Delete ${ICON_TRASH}</span>
      </div>
      <div class="row">
        <button class="check-circle ${done ? 'done' : ''} ${x.flagged ? 'flag-color' : ''}" style="--dot-color:var(--sys-orange)" data-check="${x.id}" aria-label="Toggle done">${done ? ICON_CHECK : ''}</button>
        <div class="row-body" data-body="${x.id}">
          <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
          ${x.notes ? `<div class="row-notes">${escapeHtml(x.notes)}</div>` : ''}
          ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
        </div>
        <button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>
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
    if (btn) { btn.classList.add('confirm'); btn.title = 'Tap again to delete'; }
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
    <input type="text" id="weekSearch" data-i18n-ph="search.ph" placeholder="Search tasks, projects, goals…" value="${escapeHtml(searchQuery)}">
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

  let html = `<div class="section-title">${`${results.length} results for “${escapeHtml(query)}”`}</div><div class="group">`;
  html += results.length ? results.map(searchRowHtml).join('') : `<div class="empty-note">No matches.</div>`;
  html += `</div>`;
  return html;
}
function searchRowHtml(x) {
  let kindLabel = '', meta = '';
  if (x.kind === 'task') {
    kindLabel = 'Task';
    meta = x.recurring !== 'none'
      ? recurringLabel(x) + (x.time ? ' · ' + fmtTime(x.time) : '')
      : (x.date ? (x.time ? `${fmtMonthDay(x.date)} · ${fmtTime(x.time)}` : fmtMonthDay(x.date)) : 'No date');
  } else if (x.kind === 'ongoing') {
    kindLabel = 'Ongoing';
    meta = x.finished ? 'Finished' : `Started ${fmtMonthDay(x.startedDate)}`;
  } else {
    kindLabel = 'Goal';
    meta = x.finished ? 'Done' : `Due ${fmtMonthDay(x.deadline)}`;
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
    <span class="mleg-item"><span class="mc-diary"></span>Diary</span>
    <span class="mleg-item"><span class="mleg-flag">&#9873;</span>Goal due</span>
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
      const dueGoals = goalsDueOn(d);
      const openGoal = dueGoals.some(g => !g.finished);
      html += `<button class="month-cell ${inMonth ? '' : 'outmonth'} ${d === today ? 'is-today' : ''} ${dueGoals.length ? 'is-deadline' : ''} ${openGoal ? '' : 'goal-done'}" data-monthday="${d}" type="button">
        ${dueGoals.length ? `<span class="mc-flag" title="${escapeHtml(dueGoals.map(g => g.title).join(', '))}">&#9873;</span>` : ''}
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
  const dueGoals = goalsDueOn(dateStr);

  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${fmtDateFull(dateStr)}</div>
    ${dueGoals.length ? `<div class="deadline-banner">
      <div class="deadline-title">&#9873; ${dueGoals.length === 1 ? 'Goal due today' : 'Goals due today'}</div>
      ${dueGoals.map(g => `<div class="deadline-item" data-goaldue="${g.id}">
        <span class="${g.finished ? 'done' : ''}">${escapeHtml(g.title)}</span>
        <span>${g.finished ? 'done' : 'open'}</span>
      </div>`).join('')}
    </div>` : ''}
    <div class="group" style="margin-bottom:14px;">
      ${dayItems.length ? dayItems.map(x => dayRowHtml(x, dateStr)).join('') : `<div class="empty-note">Nothing planned.</div>`}
    </div>
    <button class="sheet-move-btn" id="dayDiaryBtn" type="button" style="width:100%;margin-bottom:10px;">
      ${hasDiary ? '✎ Open this day in the diary' : '✎ Write a diary entry for this day'}
    </button>
    <div class="sheet-actions"><button class="sheet-cancel" id="dayClose" type="button">Close</button></div>`;

  $('dayClose').addEventListener('click', closeSheet);
  sheetEl().querySelectorAll('[data-goaldue]').forEach(b => b.addEventListener('click', e =>
    openPlannerEditor(e.currentTarget.getAttribute('data-goaldue'))));
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
  if (x.estimate) meta.push(`<span class="meta-chip">⏱ ${escapeHtml(x.estimate)}</span>`);
  return `<div class="row week-task-row">
      <button class="check-circle ${done ? 'done' : ''}" data-check="${x.id}" aria-label="Toggle done">${done ? ICON_CHECK : ''}</button>
      <div class="row-body" data-body="${x.id}">
        <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      <button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== GOALS ===================== */

export function renderGoals() {
  const el = $('screenContent');
  const active = items.filter(x => x.kind === 'goal' && !x.finished).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const done = items.filter(x => x.kind === 'goal' && x.finished).sort((a, b) => (b.finishedDate || '').localeCompare(a.finishedDate || ''));

  let html = `<div class="section-title">Active</div><div class="group">`;
  html += active.length ? active.map(goalCardHtml).join('') : `<div class="empty-note">No goals yet — tap + and choose “Goal”.</div>`;
  html += `</div>`;

  if (done.length) {
    html += `<div class="section-title">Completed</div><div class="group">${done.map(goalCardHtml).join('')}</div>`;
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

/** Date and estimate under a goal's step, so a plan reads as a plan. */
function stepMeta(x) {
  const bits = [];
  if (x.date) bits.push(x.time ? `${fmtMonthDay(x.date)} · ${fmtTime(x.time)}` : fmtMonthDay(x.date));
  if (x.estimate) bits.push(`&#9201; ${escapeHtml(x.estimate)}`);
  return bits;
}

function goalCardHtml(g) {
  const d = daysBetween(TODAY(), g.deadline);
  let countdown;
  if (g.finished) countdown = 'Done';
  else if (d < 0) countdown = `${-d}d overdue`;
  else if (d === 0) countdown = 'Due today';
  else countdown = `${d}d left`;
  const cdClass = g.finished ? 'done' : d < 0 ? 'over' : '';
  const linked = items.filter(x => x.kind === 'task' && x.goalId === g.id);
  const linkedDone = linked.filter(x => x.completed).length;

  return `<div class="goal-card">
      <div class="goal-top">
        <button class="check-circle" style="width:22px;height:22px;" data-goalcheck="${g.id}" aria-label="Mark goal done">${g.finished ? ICON_CHECK : ''}</button>
        <div style="flex:1;min-width:0;">
          <div class="goal-title ${g.finished ? 'done' : ''}" data-goaltitle="${g.id}">${escapeHtml(g.title)}</div>
          <div class="goal-sub">${`Due ${fmtMonthDay(g.deadline)}`}${linked.length ? ` &middot; ${`${linkedDone}/${linked.length} tasks done`}` : ''}</div>
          ${g.notes ? `<div class="row-notes" style="white-space:normal;">${escapeHtml(g.notes)}</div>` : ''}
        </div>
        <div class="goal-countdown ${cdClass}">${countdown}</div>
      </div>
      ${linked.length ? `<div class="goal-tasks">${linked.map(x => `
        <div class="goal-task-row">
          <button class="check-circle ${x.completed ? 'done' : ''}" data-check="${x.id}" style="width:19px;height:19px;">${x.completed ? ICON_CHECK : ''}</button>
          <div style="flex:1;min-width:0;">
            <div class="row-title" data-body="${x.id}">${escapeHtml(x.title)}</div>
            ${stepMeta(x).length ? `<div class="row-notes" style="white-space:normal;">${stepMeta(x).join(' · ')}</div>` : ''}
          </div>
        </div>`).join('')}</div>` : ''}
      ${goalAddOpenId === g.id
        ? `<input type="text" class="tag-input" data-goaltaskinput="${g.id}" placeholder="Task title, then Enter">`
        : `<button class="goal-add-task" data-goaladdtask="${g.id}" type="button">+ Add a task toward this</button>`}
    </div>`;
}

/* ===================== INBOX ===================== */

export function renderInbox() {
  const el = $('screenContent');
  const list = items.filter(x => isInboxTask(x) && matchesContext(x)).sort((a, b) => (b.order || 0) - (a.order || 0));

  let html = contextFilterHtml();

  const pending = drafts();
  if (pending.length) {
    html += `<div class="section-title">From your diary &nbsp;&middot;&nbsp; not finished</div><div class="group">`;
    html += pending.map(draftRowHtml).join('');
    html += `</div>`;
  }

  html += `<div class="section-title">Unscheduled</div><div class="group">`;
  html += list.length ? list.map(inboxRowHtml).join('') : `<div class="empty-note">Nothing waiting — capture anything here without deciding when.</div>`;
  html += `</div><div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  wireContextFilter(el);
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget)));
  el.querySelectorAll('[data-keepdraft]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-keepdraft'));
    if (x) { x.draft = false; save(); refresh(); }
  }));
  el.querySelectorAll('[data-movetoday]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-movetoday'));
    if (x) { x.date = TODAY(); save(); refresh(); }
  }));
  el.querySelectorAll('[data-movetom]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-movetom'));
    if (x) { x.date = addDays(TODAY(), 1); save(); refresh(); }
  }));
}

function draftRowHtml(x) {
  return `<div class="row draft-row">
      <div class="row-body" data-body="${x.id}">
        <div class="row-title">${escapeHtml(x.title)}</div>
        ${x.heard ? `<div class="row-notes">&ldquo;${escapeHtml(x.heard)}&rdquo;</div>` : ''}
        <div class="row-meta">
          <span class="meta-chip draft">draft</span>
          ${x.date ? `<span class="meta-chip">${fmtMonthDay(x.date)}</span>` : ''}
        </div>
      </div>
      <button class="link" data-keepdraft="${x.id}" type="button">Keep</button>
      <button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>
    </div>`;
}

function inboxRowHtml(x) {
  return `<div class="row">
      <div class="row-body" data-body="${x.id}">
        <div class="row-title">${escapeHtml(x.title)}${x.context ? ` <span class="meta-chip">${escapeHtml(x.context)}</span>` : ''}</div>
      </div>
      <button class="link" data-movetoday="${x.id}" type="button">Today</button>
      <button class="link" data-movetom="${x.id}" type="button">Tomorrow</button>
      <button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>
    </div>`;
}

/* ===================== new item shapes ===================== */

function newTask(over = {}) {
  return {
    id: uid(), kind: 'task', title: '', notes: '', estimate: '', date: '', time: '', recurring: 'none', repeatDays: [], priority: DEFAULT_QUADRANT,
    flagged: false, context: '', completed: false, lastCompletedDate: null, goalId: null,
    startedDate: '', lastTouchedDate: '', deadline: '', finished: false, finishedDate: null,
    order: Date.now(), createdAt: Date.now(), ...over,
  };
}

/** Show the weekday row only while "chosen days" is selected. */
function bindRepeatToggle(selectId, wrapId) {
  const select = $(selectId);
  const wrap = $(wrapId);
  if (!select || !wrap) return;
  const sync = () => { wrap.hidden = select.value !== 'days'; };
  select.addEventListener('change', sync);
  sync();
}

/* ===================== capture sheet ===================== */

let capArea = null;

const CAP_AREAS = () => [
  { id: 'today', label: '☀️ Today' },
  { id: 'week', label: '📅 This week' },
  { id: 'ongoing', label: '⚡ Ongoing' },
  { id: 'goal', label: '🚩 Goal' },
  { id: 'inbox', label: '📥 Inbox' },
  { id: 'diary', label: '📔 Diary' },
];

export function openCaptureSheet(preferred) {
  capArea = preferred || null;
  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">New item</div>
    <input type="text" id="capTitle" placeholder="What needs doing?">
    <textarea id="capNotes" class="sheet-notes" placeholder="Add a description (optional)…" maxlength="2000"></textarea>
    <div class="cap-area-label">Where does this go?</div>
    <div class="cap-area-grid">
      ${CAP_AREAS().map(a => `<button class="cap-area-btn ${capArea === a.id ? 'active' : ''}" data-area="${a.id}" type="button">${a.label}</button>`).join('')}
    </div>
    <div id="capExtra">${capExtraHtml()}</div>
    <div class="sheet-actions">
      <button class="sheet-cancel" id="capCancel" type="button">Cancel</button>
      <button class="sheet-save" id="capSave" type="button">Add</button>
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
  return `<label class="qo-pill">🏷️<select id="capContext">
    <option value="">No area</option>
    ${CONTEXTS.map(c => `<option value="${c}">${c}</option>`).join('')}
  </select></label>`;
}
function capRepeatPillHtml() {
  return `<label class="qo-pill">🔁<select id="capRepeat">
    <option value="none">Once</option>
    <option value="daily">daily</option>
    <option value="weekly">weekly</option>
    <option value="weekdays">weekdays</option>
    <option value="days">chosen days</option>
  </select></label>`;
}
function capExtraHtml() {
  const commons = `<div class="quickadd-options" style="padding:0;margin-top:10px;">
      ${timePickerContainerHtml('capTime', '', '🕐 Time')}
      ${estimatePickerContainerHtml('capEstimate', '')}
      ${capRepeatPillHtml()}
      ${capContextPillHtml()}
      <button class="qo-flag" id="capFlag" type="button" data-on="0">🚩 Flag</button>
    </div>
    <div id="capDaysWrap" hidden>${dayTogglesHtml('capDays', [])}</div>`;

  if (capArea === 'today') return `<div class="cap-extra-group">${commons}</div>`;
  if (capArea === 'week') return `<div class="cap-extra-group">${dateStripWrapHtml('capWeekDay')}${commons}</div>`;
  if (capArea === 'goal') return `<div class="cap-extra-group">${dateStripWrapHtml('capDeadline')}</div>`;
  if (capArea === 'ongoing') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">${estimatePickerContainerHtml('capEstimate', '')}${capContextPillHtml()}</div>
      <div class="cap-extra-note">Starts today. Log progress from the Today screen until you mark it finished.</div></div>`;
  }
  if (capArea === 'inbox') {
    return `<div class="cap-extra-group">
      <div class="quickadd-options" style="padding:0;margin-top:10px;">${capContextPillHtml()}</div>
      <div class="cap-extra-note">No date — sits in the Inbox until you schedule it.</div></div>`;
  }
  if (capArea === 'diary') {
    return `<div class="cap-extra-group">
      <div class="cap-extra-note">Opens today’s diary and drops this text under the topic you pick.</div></div>`;
  }
  return `<div class="cap-extra-note">Pick where this goes first.</div>`;
}
function wireCapExtra() {
  wireTimePicker('capTime', '🕐 Time');
  wireEstimatePicker('capEstimate');
  wireDayToggles('capDays');
  bindRepeatToggle('capRepeat', 'capDaysWrap');
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
  const repeatDays = recurring === 'days' ? getDayToggles('capDays') : [];
  const notes = $('capNotes') ? $('capNotes').value.trim() : '';
  const estimate = getEstimatePickerValue('capEstimate');

  if (capArea === 'diary') {
    closeSheet();
    openDiaryDate(TODAY(), title);
    return;
  }

  if (capArea === 'today') {
    items.push(newTask({ title, notes, estimate, date: TODAY(), time, recurring, repeatDays, flagged, context }));
  } else if (capArea === 'week') {
    items.push(newTask({ title, notes, estimate, date: getDateStripValue('capWeekDay') || addDays(TODAY(), 1), time, recurring, repeatDays, flagged, context }));
  } else if (capArea === 'inbox') {
    items.push(newTask({ title, notes, context }));
  } else if (capArea === 'ongoing') {
    items.push(newTask({ title, notes, estimate, kind: 'ongoing', context, startedDate: TODAY(), lastTouchedDate: TODAY() }));
  } else if (capArea === 'goal') {
    items.push(newTask({ title, notes, kind: 'goal', deadline: getDateStripValue('capDeadline') || addDays(TODAY(), 14) }));
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
  return `<textarea id="editNotes" class="sheet-notes" placeholder="More detail or explanation…" maxlength="2000">${escapeHtml(x.notes || '')}</textarea>`;
}

function editorHtml(x) {
  const actions = `<div class="sheet-actions">
      <button class="sheet-cancel" id="sheetCancel" type="button">Cancel</button>
      <button class="sheet-delete" id="sheetDelete" type="button">Delete</button>
      <button class="sheet-save" id="sheetSave" type="button">Save</button>
    </div>`;

  if (x.kind === 'goal') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title">Edit goal</div>
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="fname" style="margin-bottom:8px;">Deadline</div>
      ${dateStripWrapHtml('editDeadline')}
      ${actions}`;
  }
  if (x.kind === 'ongoing') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title">Edit project</div>
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="field-group">
        <div class="field-row"><span class="fname">Started</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.startedDate)}</span></div>
        <div class="field-row"><span class="fname">Last touched</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.lastTouchedDate || x.startedDate)}</span></div>
        <div class="field-row"><span class="fname">Estimate</span>${estimatePickerContainerHtml('editEstimate', x.estimate || '')}</div>
      </div>
      ${actions}`;
  }
  return `<div class="sheet-handle"></div>
    <div class="sheet-title">Edit task</div>
    <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
    ${notesFieldHtml(x)}
    <div class="sheet-move-row">
      <button class="sheet-move-btn" id="moveTodayBtn" type="button">Today</button>
      <button class="sheet-move-btn" id="moveTomBtn" type="button">Tomorrow</button>
      <button class="sheet-move-btn" id="moveNoneBtn" type="button">No date</button>
    </div>
    <div class="field-group">
      <div class="field-row"><span class="fname">Date</span><input type="date" id="editDate" value="${x.date || ''}"></div>
      <div class="field-row"><span class="fname">Time</span>${timePickerContainerHtml('editTime', x.time || '', '🕐 Time')}</div>
      <div class="field-row"><span class="fname">Estimate</span>${estimatePickerContainerHtml('editEstimate', x.estimate || '')}</div>
      <div class="field-row"><span class="fname">Repeats</span>
        <select id="editRecur">
          <option value="none" ${x.recurring === 'none' ? 'selected' : ''}>Once</option>
          <option value="daily" ${x.recurring === 'daily' ? 'selected' : ''}>daily</option>
          <option value="weekly" ${x.recurring === 'weekly' ? 'selected' : ''}>weekly</option>
          <option value="weekdays" ${x.recurring === 'weekdays' ? 'selected' : ''}>weekdays</option>
          <option value="days" ${x.recurring === 'days' ? 'selected' : ''}>chosen days</option>
        </select>
      </div>
      <div class="field-row"><span class="fname">Area</span>
        <select id="editContext">
          <option value="" ${!x.context ? 'selected' : ''}>&mdash;</option>
          ${CONTEXTS.map(c => `<option value="${c}" ${x.context === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field-row" id="editDaysWrap" ${x.recurring === 'days' ? '' : 'hidden'}>
        ${dayTogglesHtml('editDays', x.repeatDays || [])}
      </div>
      <div class="field-row" style="display:block;">
        <span class="fname">Matrix</span>
        <div class="prio-row" id="editPrio" style="margin-top:8px;">
          ${QUADRANTS.map(q => `<button class="prio-btn ${(Number(x.priority) || DEFAULT_QUADRANT) === q.value ? 'is-on' : ''}"
            style="--q:${q.colour}" data-value="${q.value}" title="${q.hint}" type="button">${q.label}</button>`).join('')}
        </div>
      </div>
      <div class="toggle-row"><span class="fname">Flagged</span>
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
    wireTimePicker('editTime', '🕐 Time');
    wireEstimatePicker('editEstimate');
    $('editPrio')?.querySelectorAll('[data-value]').forEach(b => b.addEventListener('click', e => {
      $('editPrio').querySelectorAll('[data-value]').forEach(o => o.classList.remove('is-on'));
      e.currentTarget.classList.add('is-on');
    }));
    wireDayToggles('editDays');
    bindRepeatToggle('editRecur', 'editDaysWrap');
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
    x.draft = false;   // editing and saving is what finishes a draft
    const notes = $('editNotes');
    if (notes) x.notes = notes.value.trim();
    if (x.kind === 'goal') {
      x.deadline = getDateStripValue('editDeadline') || x.deadline;
    } else if (x.kind === 'task') {
      x.date = $('editDate').value || '';
      x.time = getTimePickerValue('editTime');
      x.estimate = getEstimatePickerValue('editEstimate');
      x.recurring = $('editRecur').value;
      x.repeatDays = x.recurring === 'days' ? getDayToggles('editDays') : [];
      const picked = $('editPrio')?.querySelector('[data-value].is-on');
      x.priority = picked ? Number(picked.getAttribute('data-value')) : DEFAULT_QUADRANT;
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
