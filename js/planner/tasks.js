// The planner's store.
//
// The original app kept everything in one in-memory array and called a
// `saveTasks()` after mutating it directly. That is a nice way to write UI code,
// so it is preserved exactly - only the thing underneath changed. It used
// `window.storage`, which is not a browser API and silently loses everything on
// GitHub Pages; this writes to Supabase instead.
//
// Saving diffs against the last known state, so editing one task sends one row
// rather than the whole list.

import { supa } from '../core/supa.js';

const TABLE = 'planner_items';

/** Live array. The planner reads and mutates this directly. */
export let items = [];

/** id -> JSON of the row as last written, for working out what actually changed. */
let saved = new Map();

const COLUMNS = 'id, kind, title, notes, estimate, entry_date, at_time, recurring, flagged, context, '
  + 'completed, last_done, goal_id, started_date, touched_date, deadline, finished, '
  + 'finished_date, sort_order, created_at, repeat_days';

const orNull = v => (v === '' || v === undefined ? null : v);

/** app shape -> database row */
function toRow(t) {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title ?? '',
    notes: t.notes ?? '',
    estimate: orNull(t.estimate),
    entry_date: orNull(t.date),
    at_time: orNull(t.time),
    recurring: t.recurring ?? 'none',
    repeat_days: (t.repeatDays?.length ? t.repeatDays : null),
    flagged: !!t.flagged,
    context: orNull(t.context),
    completed: !!t.completed,
    last_done: orNull(t.lastCompletedDate),
    goal_id: orNull(t.goalId),
    started_date: orNull(t.startedDate),
    touched_date: orNull(t.lastTouchedDate),
    deadline: orNull(t.deadline),
    finished: !!t.finished,
    finished_date: orNull(t.finishedDate),
    sort_order: Number(t.order) || 0,
    created_at: new Date(Number(t.createdAt) || Date.now()).toISOString(),
  };
}

/** database row -> app shape */
function fromRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title ?? '',
    notes: r.notes ?? '',
    estimate: r.estimate ?? '',
    date: r.entry_date ?? '',
    time: r.at_time ?? '',
    recurring: r.recurring ?? 'none',
    repeatDays: r.repeat_days ?? [],
    flagged: !!r.flagged,
    context: r.context ?? '',
    completed: !!r.completed,
    lastCompletedDate: r.last_done ?? null,
    goalId: r.goal_id ?? null,
    startedDate: r.started_date ?? '',
    lastTouchedDate: r.touched_date ?? '',
    deadline: r.deadline ?? '',
    finished: !!r.finished,
    finishedDate: r.finished_date ?? null,
    order: Number(r.sort_order) || 0,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

const stamp = t => JSON.stringify(toRow(t));

export async function loadItems() {
  const { data, error } = await supa().from(TABLE).select(COLUMNS);
  if (error) throw error;
  items = (data ?? []).map(fromRow);
  saved = new Map(items.map(t => [t.id, stamp(t)]));
  return items;
}

/** Replace the whole array, e.g. after a failed save is retried. */
export function setItems(next) { items = next; }

let timer = null;
let inflight = null;

/**
 * Write whatever changed since the last successful save.
 * Debounced, and never runs two writes at once - a rapid tap-tap-tap on
 * checkboxes should not race itself into an inconsistent order.
 */
export function saveItems({ onError } = {}) {
  clearTimeout(timer);
  return new Promise(resolve => {
    timer = setTimeout(async () => {
      if (inflight) await inflight.catch(() => {});
      inflight = flush(onError);
      await inflight;
      inflight = null;
      resolve();
    }, 150);
  });
}

async function flush(onError) {
  const changed = [];
  const seen = new Set();

  for (const t of items) {
    seen.add(t.id);
    const now = stamp(t);
    if (saved.get(t.id) !== now) changed.push(t);
  }
  const removed = [...saved.keys()].filter(id => !seen.has(id));

  if (!changed.length && !removed.length) return;

  try {
    if (changed.length) {
      const { error } = await supa().from(TABLE).upsert(changed.map(toRow), { onConflict: 'id' });
      if (error) throw error;
      for (const t of changed) saved.set(t.id, stamp(t));
    }
    if (removed.length) {
      const { error } = await supa().from(TABLE).delete().in('id', removed);
      if (error) throw error;
      for (const id of removed) saved.delete(id);
    }
  } catch (e) {
    // Leave `saved` untouched so the next save retries these same rows.
    onError?.(e);
  }
}
