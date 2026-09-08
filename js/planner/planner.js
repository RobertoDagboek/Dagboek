// The planner: Today, Calendar, Goals, Inbox.
//
// This is the original app's logic, kept as close to the source as possible -
// same data shape, same sort rules, same swipe gestures, same sheets. What
// changed: `tasks`/`saveTasks` are now the
// Supabase-backed store in tasks.js instead of the `window.storage` object,
// which does not exist outside the environment it was written in.

import { items, saveItems, loadItems } from './tasks.js';
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
import { sendInvite, myInvites, respondToInvite, cancelInvite, currentUserId } from '../core/supa.js';

/** Invites waiting on you to accept or decline - see loadInvites(). */
let receivedInvites = [];

/**
 * Refresh the received-invites cache. Call once at boot; after that, actions
 * (accept/decline) update the cache in place rather than re-fetching, so
 * there is no risk of this looping back into a render that re-fetches again.
 */
export async function loadInvites() {
  try {
    const [all, me] = await Promise.all([myInvites(), currentUserId()]);
    receivedInvites = all.filter(i => i.to_user_id === me && i.status === 'pending');
  } catch { receivedInvites = []; }
}

export function pendingInviteCount() { return receivedInvites.length; }

export const CONTEXTS = ['Floor', 'Admin', 'App', 'Home'];
export const CONTEXT_COLORS = { Floor: 'var(--sys-orange)', Admin: 'var(--sys-gray)', App: 'var(--sys-teal)', Home: 'var(--sys-purple)' };
function ctxChipHtml(context) {
  return `<span class="meta-chip ctx" style="--chip-color:${CONTEXT_COLORS[context] || 'var(--sys-gray)'}">${escapeHtml(context)}</span>`;
}

let activeContext = 'All';
let monthCursor = null;
let selectedDay = null;
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
/**
 * Was this done on that particular day?
 *
 * A repeating task is finished separately on each day it comes round, so it
 * keeps a set of dates. It used to keep only the most recent one, which meant
 * ticking it on Tuesday silently un-ticked Monday.
 */
export function isDoneOnDate(t2, dateStr) {
  if (t2.recurring && t2.recurring !== 'none') {
    if (Array.isArray(t2.doneDates) && t2.doneDates.includes(dateStr)) return true;
    // Tasks last ticked before migration 012 still only have the single date.
    return !t2.doneDates?.length && t2.lastCompletedDate === dateStr;
  }
  return !!t2.completed;
}
function isCarried(t2) { return t2.kind === 'task' && t2.recurring === 'none' && t2.date && t2.date < TODAY() && !t2.completed; }
function daysOverdue(t2) { return Math.max(0, daysBetween(t2.date, TODAY())); }
/** Goals whose deadline falls on this date. */
export function goalsDueOn(dateStr) {
  return items.filter(x => x.kind === 'goal' && x.deadline === dateStr);
}

export function isInboxTask(t2) { return t2.kind === 'task' && !t2.draft && t2.recurring === 'none' && !t2.date; }
/** Shared-item permissions - unset (a plain, unshared item) counts as owner. */
export function canEdit(t2) { const r = t2.role || 'owner'; return r === 'owner' || r === 'editor'; }
export function canDelete(t2) { return (t2.role || 'owner') === 'owner'; }
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
  // Goals with breathing room still belong on Today, just not in the urgent
  // banner above - the ones due soon already live there.
  const goalsLater = items.filter(x => x.kind === 'goal' && !x.finished && daysBetween(today, x.deadline) > 3)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  const todays = items.filter(x => x.kind === 'task' && (appliesOnDate(x, today) || isCarried(x)) && matchesContext(x));
  todays.sort(todayOrder(today));
  const doneCount = todays.filter(x => isDoneOnDate(x, today)).length;

  let html = contextFilterHtml();

  const pending = draftCount();
  if (pending || goalsSoon.length) {
    html += `<div class="attn-card">
      <div class="attn-title">&#9888; Needs attention</div>
      ${pending ? `<div class="attn-item" id="draftNudge"><span class="aname">${pending} reminder${pending === 1 ? '' : 's'} waiting to be finished</span><span class="atag">Inbox &rsaquo;</span></div>` : ''}
      ${goalsSoon.map(g => {
        const d = daysBetween(today, g.deadline);
        const label = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d}d left`;
        return `<div class="attn-item" data-goalbanner="${g.id}"><span class="aname">${escapeHtml(g.title)}</span><span class="atag ${d < 0 ? 'over' : ''}">${label}</span></div>`;
      }).join('')}
    </div>`;
  }

  if (ongoing.length || goalsLater.length) {
    html += `<div class="section-title">Ongoing</div>`;
    if (ongoing.length) html += `<div class="group">${ongoing.map(ongoingRowHtml).join('')}</div>`;
    html += goalsLater.map(ongoingGoalHtml).join('');
  }

  html += `<div class="section-title">Tasks &nbsp;&middot;&nbsp; ${doneCount}/${todays.length}</div><div class="group">`;
  html += todays.length ? todays.map(x => taskRowHtml(x, today)).join('') : `<div class="empty-note">Nothing on your plate today. Tap + to add something.</div>`;
  html += `</div><div class="status-line" id="statusLine"></div>`;

  el.innerHTML = html;
  wireTaskRows(el, today);
  wireOngoingRows(el);
  wireContextFilter(el);
  el.querySelectorAll('[data-goalbanner]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goalbanner'))));
  el.querySelectorAll('[data-goalbody]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goalbody'))));
  $('draftNudge')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('app:goto', { detail: { screen: 'inbox' } })));
}

/** A goal shown on Today as ongoing work - same shape as the Goals screen's card, without the task breakdown. */
function ongoingGoalHtml(g) {
  const d = daysBetween(TODAY(), g.deadline);
  const countdown = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : `${d}d left`;
  const linked = items.filter(x => x.kind === 'task' && x.goalId === g.id);
  const linkedDone = linked.filter(x => x.completed).length;
  const pct = linked.length ? Math.round((linkedDone / linked.length) * 100) : 0;
  return `<div class="goal-card">
      <div class="goal-top">
        <div style="flex:1;min-width:0;cursor:pointer;" data-goalbody="${g.id}">
          <div class="goal-title">${escapeHtml(g.title)}</div>
          <div class="goal-sub">Due ${fmtMonthDay(g.deadline)}${linked.length ? ` &middot; ${linkedDone} of ${linked.length} steps` : ''}</div>
        </div>
        <div class="goal-countdown ${d < 0 ? 'over' : ''}">${countdown}</div>
      </div>
      ${linked.length ? `<div class="goal-bar"><span style="width:${pct}%"></span></div>` : ''}
    </div>`;
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
    if (!x) return;
    if (!canEdit(x)) { toast("View only — you can't change this."); return; }
    x.lastTouchedDate = TODAY(); save(); refresh();
  }));
  el.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', e => {
    const x = items.find(i => i.id === e.currentTarget.getAttribute('data-finish'));
    if (!x) return;
    if (!canEdit(x)) { toast("View only — you can't change this."); return; }
    x.finished = true; x.finishedDate = TODAY(); save(); refresh();
  }));
}

/* ===================== task rows ===================== */

function taskRowHtml(x, dateStr) {
  const done = isDoneOnDate(x, dateStr);
  const meta = [];
  if (isCarried(x)) meta.push(`<span class="meta-chip age">${daysOverdue(x)}d</span>`);
  if (x.time) meta.push(`<span class="meta-chip">${fmtTime(x.time)}</span>`);
  if (x.recurring && x.recurring !== 'none') meta.push(`<span class="meta-chip">${recurringLabel(x)}</span>`);
  if (x.context) meta.push(ctxChipHtml(x.context));
  if (x.estimate) meta.push(`<span class="meta-chip">&#9201; ${escapeHtml(x.estimate)}</span>`);
  if (x.timeLocked && x.time) meta.push('<span class="meta-chip locked">&#9200; fixed</span>');
  const q = quadrant(x.priority);
  if (q.value !== DEFAULT_QUADRANT) {
    meta.push(`<span class="meta-chip quad" style="--q:${q.colour}">${q.label}</span>`);
  }
  if (x.goalId) meta.push(`<span class="meta-chip goal">goal</span>`);
  if (checklistProgressChip(x)) meta.push(checklistProgressChip(x));
  if (sharedChip(x)) meta.push(sharedChip(x));
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
        ${canDelete(x) ? `<button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>` : ''}
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
  if (!canEdit(x)) { toast("View only — you can't change this."); return; }
  if (x.recurring && x.recurring !== 'none') {
    const days = new Set(x.doneDates ?? []);
    // Fold in a pre-012 tick so it is not lost the first time this is touched.
    if (x.lastCompletedDate) days.add(x.lastCompletedDate);
    if (days.has(dateStr)) days.delete(dateStr); else days.add(dateStr);
    x.doneDates = [...days].sort();
    x.lastCompletedDate = x.doneDates.length ? x.doneDates[x.doneDates.length - 1] : null;
  } else {
    x.completed = !x.completed;
  }
  save();
  refresh();
}

function requestDelete(id, btn) {
  const x = items.find(i => i.id === id);
  if (x && !canDelete(x)) { toast('Only the owner can delete a shared task.'); return; }
  if (pendingDelete !== id) {
    pendingDelete = id;
    if (btn) { btn.classList.add('confirm'); btn.title = 'Tap again to delete'; }
    setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; refresh(); } }, 3000);
    return;
  }
  deleteItem(id);
}
function deleteItem(id) {
  const existing = items.find(x => x.id === id);
  if (existing && !canDelete(existing)) { toast('Only the owner can delete a shared task.'); pendingDelete = null; refresh(); return; }
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
      const swiped = items.find(i => i.id === id);
      if (projected < -width * 0.5 && swiped && !canDelete(swiped)) {
        // Would only be rejected and snapped back after playing the full
        // fly-away animation - stop it before it starts instead.
        toast('Only the owner can delete a shared task.');
        settle();
      } else if (projected < -width * 0.5) {
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

function weekSearchRowHtml(belowAgenda) {
  return `<div class="search-row ${belowAgenda ? 'below-agenda' : ''}">
    <span class="search-icon">${ICON_CHEVRON}</span>
    <input type="text" id="weekSearch" data-i18n-ph="search.ph" placeholder="Search tasks, projects, goals…" value="${escapeHtml(searchQuery)}">
    ${searchQuery ? `<button class="search-clear" id="searchClear" type="button">&times;</button>` : ''}
  </div>`;
}

export function renderWeek() {
  const el = $('screenContent');

  // While actively searching, the box stays up top with the keyboard and
  // takes over the screen - the calendar itself doesn't need to be reachable
  // at the same time.
  if (searchQuery.trim()) {
    const html = weekSearchRowHtml(false) + renderSearchResultsHtml(searchQuery.trim());
    el.innerHTML = html;
    wireSearchBar();
    return;
  }

  let html = contextFilterHtml();
  html += renderMonthGridHtml();
  html += `<div class="agenda" id="dayAgenda"></div>`;
  html += weekSearchRowHtml(true);
  el.innerHTML = html;
  wireSearchBar();
  wireContextFilter(el);
  wireMonthGrid(el);
  renderAgenda();
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
    <div class="month-nav-mid">
      <div class="month-nav-label">${fmtMonthYear(monthCursor)}</div>
      <button class="legend-toggle" id="legendToggle" type="button" aria-label="Show legend">i</button>
    </div>
    <button class="week-nav-btn" id="monthNext" type="button">&rsaquo;</button>
  </div>`;

  html += `<div class="month-legend" id="monthLegend">
    ${CONTEXTS.map(c => `<span class="mleg-item"><span class="mleg-dot" style="background:${CONTEXT_COLORS[c]}"></span>${c}</span>`).join('')}
    <span class="mleg-item"><span class="mc-diary"></span>Diary</span>
    <span class="mleg-item"><span class="mleg-flag">&#9873;</span>Goal due</span>
    <span class="mleg-item"><span class="mc-done">&#10003;</span>Something done</span>
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
      // Dots stand for work still outstanding, so a day that is finished shows
      // the tick alone rather than a tick beside dots that are no longer true.
      const outstanding = dayItems.filter(x => !isDoneOnDate(x, d));
      const anyDone = outstanding.length < dayItems.length;
      const ctxs = [...new Set(outstanding.map(x => x.context).filter(Boolean))];
      const hasDiary = diaryDays.has(d);
      const dueGoals = goalsDueOn(d);
      const openGoal = dueGoals.some(g => !g.finished);
      html += `<button class="month-cell ${inMonth ? '' : 'outmonth'} ${d === today ? 'is-today' : ''} ${d === selectedDay ? 'is-selected' : ''} ${dueGoals.length ? 'is-deadline' : ''} ${openGoal ? '' : 'goal-done'}" data-monthday="${d}" type="button">
        ${dueGoals.length ? `<span class="mc-flag" title="${escapeHtml(dueGoals.map(g => g.title).join(', '))}">&#9873;</span>` : ''}
        <span class="mc-num">${dayNum(d)}</span>
        ${(dayItems.length || hasDiary) ? `<span class="mc-dots">
          ${ctxs.slice(0, 3).map(c => `<span class="mc-dot" style="background:${CONTEXT_COLORS[c] || 'var(--sys-gray)'}"></span>`).join('')}
          ${anyDone ? '<span class="mc-done">&#10003;</span>' : ''}
          ${hasDiary ? '<span class="mc-diary"></span>' : ''}
          ${outstanding.length ? `<span class="mc-count">${outstanding.length}</span>` : ''}
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
  el.querySelectorAll('[data-monthday]').forEach(b => b.addEventListener('click', e => selectDay(e.currentTarget.getAttribute('data-monthday'))));
  $('legendToggle').addEventListener('click', () => {
    $('monthLegend').classList.toggle('show');
    $('legendToggle').classList.toggle('is-on');
  });
}

/** Pick a day on the grid - just swaps the agenda card below it, no popup. */
function selectDay(dateStr) {
  selectedDay = dateStr;
  document.querySelectorAll('[data-monthday]').forEach(b =>
    b.classList.toggle('is-selected', b.getAttribute('data-monthday') === dateStr));
  renderAgenda();
}

function renderAgenda() {
  const box = $('dayAgenda');
  if (!box) return;
  if (!selectedDay) selectedDay = TODAY();
  const dateStr = selectedDay;

  const dayItems = items.filter(x => x.kind === 'task' && appliesOnDate(x, dateStr) && matchesContext(x));
  dayItems.sort((a, b) => (a.time || 'zz').localeCompare(b.time || 'zz') || (a.order || 0) - (b.order || 0));
  const hasDiary = diaryDatesInRange(dateStr, dateStr).has(dateStr);
  const dueGoals = goalsDueOn(dateStr);

  box.innerHTML = `
    <div class="agenda-date">${fmtDateFull(dateStr)}</div>
    ${dueGoals.map(g => `<div class="agenda-goal" data-goaldue="${g.id}">
      <span class="${g.finished ? 'done' : ''}">&#9873; ${escapeHtml(g.title)}</span>
      <span>${g.finished ? 'done' : 'open'}</span>
    </div>`).join('')}
    ${dayItems.length ? dayItems.map(x => dayRowHtml(x, dateStr)).join('')
      : (dueGoals.length ? '' : `<div class="empty-note">Nothing planned.</div>`)}
    <button class="agenda-diary-btn" id="agendaDiaryBtn" type="button">
      ${hasDiary ? '✎ Open this day in the diary' : '✎ Write a diary entry for this day'}
    </button>`;

  $('agendaDiaryBtn').addEventListener('click', () => openDiaryDate(dateStr));
  box.querySelectorAll('[data-goaldue]').forEach(b => b.addEventListener('click', e =>
    openPlannerEditor(e.currentTarget.getAttribute('data-goaldue'))));
  box.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    toggleCompleteOn(e.currentTarget.getAttribute('data-check'), dateStr);
  }));
  box.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    requestDelete(e.currentTarget.getAttribute('data-del'), e.currentTarget);
  }));
}

function dayRowHtml(x, dateStr) {
  const done = isDoneOnDate(x, dateStr);
  const meta = [];
  if (x.time) meta.push(`<span class="meta-chip">${fmtTime(x.time)}</span>`);
  if (x.recurring && x.recurring !== 'none') meta.push(`<span class="meta-chip">${recurringLabel(x)}</span>`);
  if (x.context) meta.push(ctxChipHtml(x.context));
  if (x.estimate) meta.push(`<span class="meta-chip">⏱ ${escapeHtml(x.estimate)}</span>`);
  if (checklistProgressChip(x)) meta.push(checklistProgressChip(x));
  if (sharedChip(x)) meta.push(sharedChip(x));
  return `<div class="row week-task-row">
      <button class="check-circle ${done ? 'done' : ''}" data-check="${x.id}" aria-label="Toggle done">${done ? ICON_CHECK : ''}</button>
      <div class="row-body" data-body="${x.id}">
        <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      ${canDelete(x) ? `<button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>` : ''}
    </div>`;
}

/* ===================== GOALS ===================== */

export function renderGoals() {
  const el = $('screenContent');
  const active = items.filter(x => x.kind === 'goal' && !x.finished).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const done = items.filter(x => x.kind === 'goal' && x.finished).sort((a, b) => (b.finishedDate || '').localeCompare(a.finishedDate || ''));

  let html = `<div class="section-title">Active</div>`;
  html += active.length ? active.map(goalCardHtml).join('') : `<div class="group"><div class="empty-note">No goals yet — tap + and choose “Goal”.</div></div>`;

  if (done.length) {
    html += `<div class="section-title">Completed</div>${done.map(goalCardHtml).join('')}`;
  }
  html += `<div class="status-line" id="statusLine"></div>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-goaltitle]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-goaltitle'))));
  el.querySelectorAll('[data-goalcheck]').forEach(b => b.addEventListener('click', e => {
    const g = items.find(x => x.id === e.currentTarget.getAttribute('data-goalcheck'));
    if (!g) return;
    if (!canEdit(g)) { toast("View only — you can't change this."); return; }
    g.finished = !g.finished; g.finishedDate = g.finished ? TODAY() : null; save(); refresh();
  }));
  el.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); toggleCompleteOn(e.currentTarget.getAttribute('data-check'), TODAY());
  }));
  el.querySelectorAll('[data-body]').forEach(b => b.addEventListener('click', e => openPlannerEditor(e.currentTarget.getAttribute('data-body'))));
  el.querySelectorAll('.goal-tasks-head').forEach(b => b.addEventListener('click', () => {
    const list = b.nextElementSibling;
    list.hidden = !list.hidden;
    b.classList.toggle('is-open', !list.hidden);
  }));
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
  const pct = linked.length ? Math.round((linkedDone / linked.length) * 100) : 0;

  return `<div class="goal-card ${g.finished ? 'is-finished' : ''}">
      <div class="goal-top">
        <button class="check-circle" style="width:22px;height:22px;" data-goalcheck="${g.id}" aria-label="Mark goal done">${g.finished ? ICON_CHECK : ''}</button>
        <div style="flex:1;min-width:0;">
          <div class="goal-title ${g.finished ? 'done' : ''}" data-goaltitle="${g.id}">${escapeHtml(g.title)}</div>
          <div class="goal-sub">Due ${fmtMonthDay(g.deadline)}</div>
          ${g.notes ? `<div class="row-notes" style="white-space:normal;">${escapeHtml(g.notes)}</div>` : ''}
        </div>
        <div class="goal-countdown ${cdClass}">${countdown}</div>
      </div>
      ${linked.length ? `<div class="goal-bar"><span style="width:${pct}%"></span></div>` : ''}
      ${linked.length ? `<div class="goal-tasks-drop">
        <button class="goal-tasks-head ${goalAddOpenId === g.id ? 'is-open' : ''}" type="button">
          <span class="goal-tasks-chev">&rsaquo;</span>
          <span>${linkedDone} of ${linked.length} step${linked.length === 1 ? '' : 's'} completed</span>
        </button>
        <div class="goal-tasks" ${goalAddOpenId === g.id ? '' : 'hidden'}>${linked.map(x => `
          <div class="goal-task-row">
            <button class="check-circle ${x.completed ? 'done' : ''}" data-check="${x.id}" style="width:19px;height:19px;">${x.completed ? ICON_CHECK : ''}</button>
            <div style="flex:1;min-width:0;">
              <div class="row-title" data-body="${x.id}">${escapeHtml(x.title)}</div>
              ${stepMeta(x).length ? `<div class="row-notes" style="white-space:normal;">${stepMeta(x).join(' · ')}</div>` : ''}
            </div>
          </div>`).join('')}</div>
      </div>` : ''}
      ${canEdit(g) ? (goalAddOpenId === g.id
        ? `<input type="text" class="tag-input" data-goaltaskinput="${g.id}" placeholder="Task title, then Enter">`
        : `<button class="goal-add-task" data-goaladdtask="${g.id}" type="button">+ Add a task toward this</button>`) : ''}
    </div>`;
}

/* ===================== INBOX ===================== */

export function renderInbox() {
  const el = $('screenContent');
  const list = items.filter(x => isInboxTask(x) && matchesContext(x)).sort((a, b) => (b.order || 0) - (a.order || 0));

  let html = contextFilterHtml();

  if (receivedInvites.length) {
    html += `<div class="section-title">Shared with you</div><div class="group">`;
    html += receivedInvites.map(inviteRowHtml).join('');
    html += `</div>`;
  }

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
  el.querySelectorAll('[data-inviteaccept]').forEach(b => b.addEventListener('click', e => respondInvite(e.currentTarget.getAttribute('data-inviteaccept'), true)));
  el.querySelectorAll('[data-invitedecline]').forEach(b => b.addEventListener('click', e => respondInvite(e.currentTarget.getAttribute('data-invitedecline'), false)));
}

function inviteRowHtml(i) {
  const kindHint = i.share_kind === 'delegate' ? "it's now your job to do"
    : i.share_kind === 'collaborate' ? 'you can both edit it'
    : 'view only, watching their progress';
  return `<div class="row invite-row">
      <div class="row-body">
        <div class="row-title">${escapeHtml(i.item_title || 'A task')}</div>
        <div class="row-notes">${escapeHtml(i.from_username || 'Someone')} wants to ${shareKindLabel(i.share_kind).toLowerCase()} &middot; ${kindHint}</div>
      </div>
      <button class="link" data-inviteaccept="${i.id}" type="button">Accept</button>
      <button class="link danger" data-invitedecline="${i.id}" type="button">Decline</button>
    </div>`;
}

async function respondInvite(inviteId, accept) {
  receivedInvites = receivedInvites.filter(i => i.id !== inviteId);
  refresh();
  try {
    await respondToInvite(inviteId, accept);
    if (accept) { await loadItems(); refresh(); toast('Added to your planner.'); }
  } catch {
    // The RPC may well have gone through server-side even though this
    // request failed to come back - re-check both invites and items rather
    // than assuming nothing happened, so an actually-accepted item doesn't
    // sit invisible until the next full reload.
    toast('Could not answer that invite - try again.');
    await Promise.all([loadInvites(), loadItems()]);
    refresh();
  }
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
  const meta = [];
  if (x.context) meta.push(ctxChipHtml(x.context));
  if (x.estimate) meta.push(`<span class="meta-chip">&#9201; ${escapeHtml(x.estimate)}</span>`);
  if (checklistProgressChip(x)) meta.push(checklistProgressChip(x));
  if (sharedChip(x)) meta.push(sharedChip(x));
  return `<div class="row">
      <div class="row-body" data-body="${x.id}">
        <div class="row-title">${escapeHtml(x.title)}</div>
        ${meta.length ? `<div class="row-meta">${meta.join('')}</div>` : ''}
      </div>
      ${canEdit(x) ? `<button class="link" data-movetoday="${x.id}" type="button">Today</button>
      <button class="link" data-movetom="${x.id}" type="button">Tomorrow</button>` : ''}
      ${canDelete(x) ? `<button class="row-del" data-del="${x.id}" aria-label="Delete">${ICON_TRASH}</button>` : ''}
    </div>`;
}

/* ===================== new item shapes ===================== */

function newTask(over = {}) {
  return {
    id: uid(), kind: 'task', title: '', notes: '', notesMode: 'text', checklist: [], estimate: '', date: '', time: '', recurring: 'none', repeatDays: [], doneDates: [], priority: DEFAULT_QUADRANT, timeLocked: false,
    flagged: false, context: '', completed: false, lastCompletedDate: null, goalId: null,
    startedDate: '', lastTouchedDate: '', deadline: '', finished: false, finishedDate: null,
    order: Date.now(), createdAt: Date.now(), ...over,
  };
}

/* ===================== description field: notes or checklist ===================== */

function descModeToggleHtml(mode) {
  return `<div class="desc-mode-toggle">
      <button class="desc-mode-btn ${mode !== 'checklist' ? 'is-on' : ''}" data-descmode="text" type="button">Notes</button>
      <button class="desc-mode-btn ${mode === 'checklist' ? 'is-on' : ''}" data-descmode="checklist" type="button">Checklist</button>
    </div>`;
}
function checklistBodyHtml(list) {
  return `<div class="checklist">
      ${list.map((it, i) => `<div class="checklist-row">
          <button class="check-circle ${it.done ? 'done' : ''}" data-clcheck="${i}" type="button">${it.done ? ICON_CHECK : ''}</button>
          <span class="checklist-text ${it.done ? 'done' : ''}">${escapeHtml(it.text)}</span>
          <button class="row-del" data-cldel="${i}" aria-label="Remove">${ICON_TRASH}</button>
        </div>`).join('')}
      <input type="text" class="tag-input checklist-add" placeholder="Add an item, then Enter">
    </div>`;
}
function descFieldHtml(desc, placeholder) {
  const mode = desc.mode === 'checklist' ? 'checklist' : 'text';
  const body = mode === 'checklist'
    ? checklistBodyHtml(desc.checklist)
    : `<textarea class="sheet-notes" placeholder="${placeholder}" maxlength="2000">${escapeHtml(desc.notes || '')}</textarea>`;
  return descModeToggleHtml(mode) + body;
}

/**
 * Wires the Notes/Checklist switch into `wrap`. `desc` (`{ mode, notes, checklist }`)
 * is mutated in place, so a save handler elsewhere can read it back at any time
 * via `descFieldValue` without this module needing to track it separately.
 */
function wireDescField(wrap, desc, placeholder) {
  function draw() {
    wrap.innerHTML = descFieldHtml(desc, placeholder);
    wrap.querySelectorAll('[data-descmode]').forEach(b => b.addEventListener('click', e => {
      if (desc.mode !== 'checklist') { const ta = wrap.querySelector('.sheet-notes'); if (ta) desc.notes = ta.value; }
      desc.mode = e.currentTarget.getAttribute('data-descmode');
      draw();
    }));
    wrap.querySelectorAll('[data-clcheck]').forEach(b => b.addEventListener('click', e => {
      const item = desc.checklist[Number(e.currentTarget.getAttribute('data-clcheck'))];
      item.done = !item.done;
      draw();
    }));
    wrap.querySelectorAll('[data-cldel]').forEach(b => b.addEventListener('click', e => {
      desc.checklist.splice(Number(e.currentTarget.getAttribute('data-cldel')), 1);
      draw();
    }));
    const addInput = wrap.querySelector('.checklist-add');
    addInput?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const text = addInput.value.trim();
      if (!text) return;
      desc.checklist.push({ text, done: false });
      draw();
      wrap.querySelector('.checklist-add')?.focus();
    });
  }
  draw();
}

/** Read back whatever is currently in the field, straight from the live DOM where it matters. */
function descFieldValue(wrap, desc) {
  if (desc.mode === 'checklist') return { notesMode: 'checklist', notes: '', checklist: desc.checklist.filter(it => it.text) };
  const ta = wrap.querySelector('.sheet-notes');
  return { notesMode: 'text', notes: (ta ? ta.value : (desc.notes || '')).trim(), checklist: [] };
}

/** A small marker on rows that aren't fully yours to edit. */
function sharedChip(x) {
  const role = x.role || 'owner';
  if (role === 'viewer') return `<span class="meta-chip shared-chip">&#128274; view only</span>`;
  if (role === 'editor') return `<span class="meta-chip shared-chip">&#128101; shared</span>`;
  return '';
}

/** How many of a checklist's items are ticked, for the row-meta chip. */
function checklistProgressChip(x) {
  if (!Array.isArray(x.checklist) || !x.checklist.length) return '';
  const done = x.checklist.filter(it => it.done).length;
  return `<span class="meta-chip checklist-chip">&#9744; ${done}/${x.checklist.length}</span>`;
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
let capDesc = { mode: 'text', notes: '', checklist: [] };

// Grouped so the picker reads as "when" vs "what kind" instead of six equal
// buttons in one wall - Today/Schedule/Inbox are the same thing (a task)
// with a different date, Ongoing/Goal/Diary are genuinely different kinds.
const CAP_AREA_GROUPS = () => [
  { label: 'Task', areas: [
    { id: 'today', label: '☀️ Today' },
    { id: 'week', label: '📅 Schedule' },
    { id: 'inbox', label: '📥 Inbox' },
  ] },
  { label: 'Other', areas: [
    { id: 'ongoing', label: '⚡ Ongoing' },
    { id: 'goal', label: '🚩 Goal' },
    { id: 'diary', label: '📔 Diary' },
  ] },
];

function capAreaGridHtml() {
  return CAP_AREA_GROUPS().map(g => `<div class="cap-area-group">
      <div class="cap-area-group-label">${g.label}</div>
      <div class="cap-area-grid">
        ${g.areas.map(a => `<button class="cap-area-btn ${capArea === a.id ? 'active' : ''}" data-area="${a.id}" type="button">${a.label}</button>`).join('')}
      </div>
    </div>`).join('');
}

export function openCaptureSheet(preferred) {
  capArea = preferred || null;
  capDesc = { mode: 'text', notes: '', checklist: [] };
  sheetEl().innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">New task</div>
    <input type="text" id="capTitle" placeholder="What needs doing?">
    <div id="capDescWrap"></div>
    <div class="cap-area-label">Where does this go?</div>
    ${capAreaGridHtml()}
    <div id="capExtra">${capExtraHtml()}</div>
    <div class="sheet-actions">
      <button class="sheet-cancel" id="capCancel" type="button">Cancel</button>
      <button class="sheet-save" id="capSave" type="button">Add</button>
    </div>`;

  $('capCancel').addEventListener('click', closeSheet);
  wireDescField($('capDescWrap'), capDesc, 'Add a description (optional)…');
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
  if (capArea === 'week') {
    return `<div class="cap-extra-group">${dateStripWrapHtml('capWeekDay')}${commons}
      <div class="cap-extra-note">Pick the day it belongs on. Defaults to tomorrow.</div></div>`;
  }
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
  const { notes, notesMode, checklist } = descFieldValue($('capDescWrap'), capDesc);
  const estimate = getEstimatePickerValue('capEstimate');

  if (capArea === 'diary') {
    closeSheet();
    openDiaryDate(TODAY(), title);
    return;
  }

  if (capArea === 'today') {
    items.push(newTask({ title, notes, notesMode, checklist, estimate, date: TODAY(), time, recurring, repeatDays, flagged, context }));
  } else if (capArea === 'week') {
    items.push(newTask({ title, notes, notesMode, checklist, estimate, date: getDateStripValue('capWeekDay') || addDays(TODAY(), 1), time, recurring, repeatDays, flagged, context }));
  } else if (capArea === 'inbox') {
    items.push(newTask({ title, notes, notesMode, checklist, context }));
  } else if (capArea === 'ongoing') {
    items.push(newTask({ title, notes, notesMode, checklist, estimate, kind: 'ongoing', context, startedDate: TODAY(), lastTouchedDate: TODAY() }));
  } else if (capArea === 'goal') {
    items.push(newTask({ title, notes, notesMode, checklist, kind: 'goal', deadline: getDateStripValue('capDeadline') || addDays(TODAY(), 14) }));
  }
  save();
  refresh();
  closeSheet();
}

/* ===================== editor sheet ===================== */

let editDesc = { mode: 'text', notes: '', checklist: [] };

export function openPlannerEditor(id) {
  const x = items.find(i => i.id === id);
  if (!x) return;
  const role = x.role || 'owner';
  if (role === 'viewer') {
    sheetEl().innerHTML = viewerEditorHtml(x);
    $('sheetCancel').addEventListener('click', closeSheet);
    openSheet();
    return;
  }
  editDesc = { mode: x.notesMode === 'checklist' ? 'checklist' : 'text', notes: x.notes || '', checklist: (x.checklist || []).map(it => ({ ...it })) };
  sheetEl().innerHTML = editorHtml(x, role);
  wireDescField($('editDescWrap'), editDesc, 'More detail or explanation…');
  wireEditor(x, role);
  openSheet();
}

function notesFieldHtml() {
  return `<div id="editDescWrap"></div>`;
}

/** Someone else's task, shared as view-only - a compact read-only card instead of the edit form. */
function viewerEditorHtml(x) {
  const meta = [];
  if (x.kind === 'task') {
    if (x.date) meta.push(fmtMonthDay(x.date));
    if (x.time) meta.push(fmtTime(x.time));
    if (x.context) meta.push(x.context);
  }
  if (x.kind === 'goal' && x.deadline) meta.push(`Due ${fmtMonthDay(x.deadline)}`);
  if (x.estimate) meta.push(x.estimate);
  const done = x.kind === 'task' ? isDoneOnDate(x, x.date || TODAY()) : !!x.finished;

  const body = x.notesMode === 'checklist' && x.checklist?.length
    ? `<div class="checklist">${x.checklist.map(it => `<div class="checklist-row">
          <span class="check-circle ${it.done ? 'done' : ''}" style="cursor:default;">${it.done ? ICON_CHECK : ''}</span>
          <span class="checklist-text ${it.done ? 'done' : ''}">${escapeHtml(it.text)}</span>
        </div>`).join('')}</div>`
    : (x.notes ? `<div class="row-notes" style="white-space:normal;margin-bottom:12px;">${escapeHtml(x.notes)}</div>` : '');

  return `<div class="sheet-handle"></div>
    <div class="share-banner">&#128274; Shared with you &middot; view only</div>
    <div class="sheet-title">${escapeHtml(x.title)}</div>
    ${meta.length ? `<div class="row-meta" style="margin-bottom:12px;">${meta.map(m => `<span class="meta-chip">${escapeHtml(m)}</span>`).join('')}</div>` : ''}
    ${body}
    <p class="sheet-hint">${done ? `${ICON_CHECK} Marked done.` : 'Not finished yet.'}</p>
    <div class="sheet-actions"><button class="sheet-cancel" id="sheetCancel" type="button">Close</button></div>`;
}

function editorActionsHtml(role) {
  return `<div class="sheet-actions">
      <button class="sheet-cancel" id="sheetCancel" type="button">Cancel</button>
      ${role === 'owner' ? `<button class="sheet-delete" id="sheetDelete" type="button">Delete</button>` : ''}
      <button class="sheet-save" id="sheetSave" type="button">Save</button>
    </div>`;
}

function editorHtml(x, role) {
  const actions = editorActionsHtml(role);
  const shareBtn = role === 'owner' ? `<button class="link share-btn" id="openShare" type="button">&#128279; Share</button>` : '';
  const banner = role === 'editor' ? `<div class="share-banner">&#128101; Shared with you &middot; you can edit, not delete</div>` : '';

  if (x.kind === 'goal') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title-row"><div class="sheet-title">Edit goal</div>${shareBtn}</div>
      ${banner}
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="fname" style="margin-bottom:8px;">Deadline</div>
      ${dateStripWrapHtml('editDeadline')}
      ${actions}`;
  }
  if (x.kind === 'ongoing') {
    return `<div class="sheet-handle"></div>
      <div class="sheet-title-row"><div class="sheet-title">Edit project</div>${shareBtn}</div>
      ${banner}
      <input type="text" id="editTitle" value="${escapeHtml(x.title)}" maxlength="120">
      ${notesFieldHtml(x)}
      <div class="field-group">
        <div class="field-row"><span class="fname">Started</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.startedDate)}</span></div>
        <div class="field-row"><span class="fname">Last touched</span><span style="color:var(--label-secondary);">${fmtMonthDay(x.lastTouchedDate || x.startedDate)}</span></div>
        <div class="toggle-row"><span class="fname">Alert me at this time</span>
        <button class="ios-switch ${x.timeLocked ? 'on' : ''}" id="editTimeLock" type="button"><span class="thumb"></span></button></div>
      <p class="sheet-hint" style="margin:-2px 2px 10px;">Fires at its time even when the day is sorted by matrix.</p>
      <div class="field-row"><span class="fname">Estimate</span>${estimatePickerContainerHtml('editEstimate', x.estimate || '')}</div>
      </div>
      ${actions}`;
  }
  return `<div class="sheet-handle"></div>
    <div class="sheet-title-row"><div class="sheet-title">Edit task</div>${shareBtn}</div>
    ${banner}
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

function wireEditor(x, role) {
  $('sheetCancel').addEventListener('click', closeSheet);
  $('sheetDelete')?.addEventListener('click', () => { deleteItem(x.id); closeSheet(); });
  $('openShare')?.addEventListener('click', () => openShareView(x));

  if (x.kind === 'goal') wireDateStrip('editDeadline', x.deadline || TODAY(), TODAY());

  if (x.kind === 'task') {
    $('moveTodayBtn').addEventListener('click', () => { $('editDate').value = TODAY(); });
    $('moveTomBtn').addEventListener('click', () => { $('editDate').value = addDays(TODAY(), 1); });
    $('moveNoneBtn').addEventListener('click', () => { $('editDate').value = ''; });
    wireTimePicker('editTime', '🕐 Time');
    $('editTimeLock')?.addEventListener('click', e => e.currentTarget.classList.toggle('on'));
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
    const { notes, notesMode, checklist } = descFieldValue($('editDescWrap'), editDesc);
    x.notes = notes;
    x.notesMode = notesMode;
    x.checklist = checklist;
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
      x.timeLocked = !!$('editTimeLock')?.classList.contains('on');
      x.context = $('editContext').value || '';
      x.flagged = $('editFlagToggle').dataset.on === '1';
    }
    save();
    refresh();
    closeSheet();
  });
}

/* ===================== share sheet ===================== */

const SHARE_KINDS = [
  { id: 'delegate', label: 'Delegate', hint: "It's their job now — they edit and complete it, you just watch their progress." },
  { id: 'collaborate', label: 'Collaborate', hint: 'You both can edit it and tick things off.' },
  { id: 'view', label: 'Share progress', hint: "They can see it and how far you've gotten, but can't change anything." },
];
function shareKindLabel(k) { return SHARE_KINDS.find(s => s.id === k)?.label || k; }

function shareViewHtml(x, invites) {
  const pending = invites.filter(i => i.item_id === x.id && i.status === 'pending');
  return `<div class="sheet-handle"></div>
    <div class="sheet-title">Share &ldquo;${escapeHtml(x.title)}&rdquo;</div>
    <input type="text" id="shareUsername" placeholder="Their username">
    <div class="share-kind-list">
      ${SHARE_KINDS.map((k, i) => `<label class="share-kind-row">
          <input type="radio" name="shareKind" value="${k.id}" ${i === 1 ? 'checked' : ''}>
          <span class="share-kind-body"><span class="share-kind-label">${k.label}</span><span class="share-kind-hint">${k.hint}</span></span>
        </label>`).join('')}
    </div>
    ${pending.length ? `<div class="cap-area-label">Waiting to be accepted</div><div class="group">
        ${pending.map(i => `<div class="row">
            <div class="row-body">
              <div class="row-title">${escapeHtml(i.to_username || 'someone')}</div>
              <div class="row-meta"><span class="meta-chip">${shareKindLabel(i.share_kind)}</span></div>
            </div>
            <button class="link" data-cancelinvite="${i.id}" type="button">Cancel</button>
          </div>`).join('')}
      </div>` : ''}
    <div class="sheet-actions">
      <button class="sheet-cancel" id="shareDone" type="button">Done</button>
      <button class="sheet-save" id="shareSend" type="button">Send invite</button>
    </div>`;
}

async function openShareView(x) {
  let invites = [];
  try { invites = await myInvites(); } catch { /* best effort - the list just starts empty */ }
  sheetEl().innerHTML = shareViewHtml(x, invites);

  // Closes outright rather than looping back into the edit form - from here
  // "Back" read like the only way out was "Cancel" the task itself.
  $('shareDone').addEventListener('click', closeSheet);
  $('shareSend').addEventListener('click', async () => {
    const toUsername = $('shareUsername').value.trim();
    if (!toUsername) { $('shareUsername').focus(); return; }
    const shareKind = sheetEl().querySelector('input[name="shareKind"]:checked')?.value || 'collaborate';
    try {
      await sendInvite({ itemId: x.id, toUsername, shareKind });
      toast(`Invite sent to ${toUsername} — waiting for them to accept.`);
      openShareView(x);
    } catch (e) {
      toast(e.message || 'Could not send that invite.');
    }
  });
  sheetEl().querySelectorAll('[data-cancelinvite]').forEach(b => b.addEventListener('click', async e => {
    try { await cancelInvite(e.currentTarget.getAttribute('data-cancelinvite')); openShareView(x); }
    catch { toast('Could not cancel that invite.'); }
  }));
}

/* Search results are delegated, because the list is rebuilt as you type. */
document.addEventListener('click', e => {
  const row = e.target.closest('[data-searchresult]');
  if (row) openPlannerEditor(row.getAttribute('data-searchresult'));
});
