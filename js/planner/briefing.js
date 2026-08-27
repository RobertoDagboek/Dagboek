// The morning briefing.
//
// Shown once on the first open of a day, never again that day - not on every
// refresh, and not when the app is simply unlocked a second time. It lists
// what is on today, lets the order be set, and that choice then becomes the
// order of the Today screen itself.
//
// It reuses the standard sheet, so it arrives with the same spring as the
// New item panel rather than inventing a second kind of popup.

import { settings, saveSettings } from '../core/config.js';
import { items, saveItems } from './tasks.js';
import {
  $, escapeHtml, todayStr, fmtDateFull, fmtTime,
  sheetEl, openSheet, closeSheet, refresh, ICON_CHECK,
} from '../core/ui.js';
import { appliesOnDate, goalsDueOn, todayOrder } from './planner.js';
import { QUADRANTS, quadrant, matrixKeyHtml, DEFAULT_QUADRANT } from './priority.js';

/** Has the briefing already been shown today? */
export function alreadyBriefed(today = todayStr()) {
  return settings().lastBriefing === today;
}

/**
 * Show it, if today has anything worth showing and it has not been shown yet.
 * @returns {boolean} whether it opened
 */
export function maybeBrief(today = todayStr()) {
  if (alreadyBriefed(today)) return false;

  const todays = todaysTasks(today);
  const dueGoals = goalsDueOn(today).filter(g => !g.finished);
  // An empty day does not need a popup. Still count it as briefed, so it does
  // not spring open later just because a task got added.
  if (!todays.length && !dueGoals.length) {
    saveSettings({ lastBriefing: today });
    return false;
  }

  openBriefing(today);
  return true;
}

function todaysTasks(today) {
  return items.filter(x => x.kind === 'task' && !x.draft && appliesOnDate(x, today));
}

export function openBriefing(today = todayStr()) {
  let mode = settings().todaySort === 'priority' ? 'priority' : 'time';

  const draw = () => {
    const todays = todaysTasks(today).sort(todayOrder(today, mode));
    const dueGoals = goalsDueOn(today).filter(g => !g.finished);
    const done = todays.filter(x => x.completed || x.lastCompletedDate === today).length;

    sheetEl().innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-title">Today</div>
      <p class="sheet-hint" style="margin:-6px 2px 14px;">${fmtDateFull(today)} &middot; ${todays.length} task${todays.length === 1 ? '' : 's'}${done ? `, ${done} already done` : ''}</p>

      ${dueGoals.length ? `<div class="deadline-banner">
        <div class="deadline-title">&#9873; ${dueGoals.length === 1 ? 'Goal due today' : 'Goals due today'}</div>
        ${dueGoals.map(g => `<div class="deadline-item"><span>${escapeHtml(g.title)}</span></div>`).join('')}
      </div>` : ''}

      <div class="brief-sort">
        <button class="brief-sort-btn ${mode === 'time' ? 'is-on' : ''}" data-sort="time" type="button">By time</button>
        <button class="brief-sort-btn ${mode === 'priority' ? 'is-on' : ''}" data-sort="priority" type="button">By matrix</button>
      </div>

      <div class="group brief-list">
        ${todays.length
          ? todays.map(x => rowHtml(x, today)).join('')
          : '<div class="empty-note">Nothing scheduled today.</div>'}
      </div>

      ${mode === 'priority' ? matrixKeyHtml() : ''}

      <p class="sheet-hint">${mode === 'priority'
        ? 'Place each one in the matrix. Today will keep this order.'
        : 'Sorted by the clock. Switch to the matrix to order them yourself.'}</p>

      <div class="sheet-actions">
        <button class="sheet-save" id="briefDone" type="button">Start the day</button>
      </div>`;

    sheetEl().querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', e => {
      mode = e.currentTarget.getAttribute('data-sort');
      saveSettings({ todaySort: mode });
      draw();
    }));

    sheetEl().querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', e => {
      const el = e.currentTarget;
      const task = items.find(i => i.id === el.getAttribute('data-prio'));
      if (!task) return;
      task.priority = Number(el.getAttribute('data-value'));
      saveItems();
      draw();
    }));

    $('briefDone').addEventListener('click', () => {
      saveSettings({ lastBriefing: today, todaySort: mode });
      closeSheet();
      refresh();
    });
  };

  draw();
  openSheet();
}

function rowHtml(x, today) {
  const done = x.recurring && x.recurring !== 'none' ? x.lastCompletedDate === today : x.completed;
  const prio = Number(x.priority) || DEFAULT_QUADRANT;
  return `<div class="row brief-row">
      <div class="row-body">
        <div class="row-title ${done ? 'done' : ''}">${x.flagged ? '&#128681; ' : ''}${escapeHtml(x.title)}</div>
        <div class="row-meta">
          ${x.time ? `<span class="meta-chip">${fmtTime(x.time)}</span>` : '<span class="meta-chip">any time</span>'}
          ${x.context ? `<span class="meta-chip">${escapeHtml(x.context)}</span>` : ''}
          ${x.estimate ? `<span class="meta-chip">&#9201; ${escapeHtml(x.estimate)}</span>` : ''}
          ${done ? `<span class="meta-chip">${ICON_CHECK}</span>` : ''}
        </div>
        <div class="prio-row">
          ${QUADRANTS.map(q => `<button class="prio-btn ${prio === q.value ? 'is-on' : ''}"
            style="--q:${q.colour}" data-prio="${x.id}" data-value="${q.value}"
            title="${q.hint}" type="button">${q.label}</button>`).join('')}
        </div>
      </div>
    </div>`;
}
