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
  + 'finished_date, sort_order, created_at, repeat_days, draft, source, heard, priority, done_dates, time_locked, '
  + 'notes_mode, checklist';

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
    priority: Number(t.priority) || 2,
    time_locked: !!t.timeLocked,
    context: orNull(t.context),
    completed: !!t.completed,
    last_done: orNull(t.lastCompletedDate),
    done_dates: Array.isArray(t.doneDates) ? t.doneDates : [],
    goal_id: orNull(t.goalId),
    started_date: orNull(t.startedDate),
    touched_date: orNull(t.lastTouchedDate),
    deadline: orNull(t.deadline),
    finished: !!t.finished,
    finished_date: orNull(t.finishedDate),
    draft: !!t.draft,
    source: orNull(t.source),
    heard: orNull(t.heard),
    notes_mode: t.notesMode === 'checklist' ? 'checklist' : 'text',
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
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
    priority: Number(r.priority) || 2,
    timeLocked: !!r.time_locked,
    context: r.context ?? '',
    completed: !!r.completed,
    lastCompletedDate: r.last_done ?? null,
    doneDates: r.done_dates ?? [],
    goalId: r.goal_id ?? null,
    startedDate: r.started_date ?? '',
    lastTouchedDate: r.touched_date ?? '',
    deadline: r.deadline ?? '',
    finished: !!r.finished,
    finishedDate: r.finished_date ?? null,
    draft: !!r.draft,
    source: r.source ?? '',
    heard: r.heard ?? '',
    notesMode: r.notes_mode === 'checklist' ? 'checklist' : 'text',
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
    order: Number(r.sort_order) || 0,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

const stamp = t => JSON.stringify(toRow(t));

/**
 * Two things every item needs from planner_item_members: which role the
 * current account holds on it ('owner' | 'editor' | 'viewer' - unset falls
 * back to 'owner', so an unshared account keeps working exactly as before
 * migration 015), and whether it has more than one member at all (so an
 * owner can tell their own copy is shared with someone, not just a
 * recipient's copy of someone else's). RLS already lets a member of an
 * item see every other row for that same item, so one unfiltered query
 * gives us both.
 */
async function loadMembership() {
  try {
    // getSession() reads the already-verified session from local storage -
    // no network round trip, unlike getUser() (which re-checks with the
    // server every time). Fine here: this id only shapes which row of an
    // already-RLS-filtered query we ask for, it grants nothing on its own.
    const { data: { session } } = await supa().auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { roles: new Map(), memberCounts: new Map() };
    const { data, error } = await supa().from('planner_item_members').select('item_id, user_id, role');
    if (error) throw error;
    const roles = new Map();
    const memberCounts = new Map();
    for (const m of data ?? []) {
      memberCounts.set(m.item_id, (memberCounts.get(m.item_id) || 0) + 1);
      if (m.user_id === uid) roles.set(m.item_id, m.role);
    }
    return { roles, memberCounts };
  } catch {
    return { roles: new Map(), memberCounts: new Map() };
  }
}

export async function loadItems() {
  // Independent queries (different tables, no data dependency) - run them
  // together rather than paying two sequential round trips.
  const [{ data, error }, { roles, memberCounts }] = await Promise.all([
    supa().from(TABLE).select(COLUMNS),
    loadMembership(),
  ]);
  if (error) throw error;
  items = (data ?? []).map(r => ({
    ...fromRow(r),
    role: roles.get(r.id) || 'owner',
    sharedWithOthers: (memberCounts.get(r.id) || 1) > 1,
  }));
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

  let stuck = false;

  if (changed.length) {
    try {
      const { error } = await supa().from(TABLE).upsert(changed.map(toRow), { onConflict: 'id' });
      if (error) throw error;
      for (const t of changed) saved.set(t.id, stamp(t));
    } catch {
      // A batched upsert can fail as a whole over just one row - e.g. a task
      // whose sharing role changed since it was loaded, so this account can
      // no longer write it. Left as-is, that one row would keep "changed"
      // forever and drag every future save down with it, since it is
      // re-included in every batch until something marks it saved. Retrying
      // the rest one row at a time keeps everything else saving; only the
      // genuinely stuck row(s) keep retrying (harmlessly) after this.
      for (const t of changed) {
        try {
          const { error } = await supa().from(TABLE).upsert(toRow(t), { onConflict: 'id' });
          if (error) throw error;
          saved.set(t.id, stamp(t));
        } catch {
          stuck = true;
        }
      }
    }
  }

  if (removed.length) {
    try {
      const { error } = await supa().from(TABLE).delete().in('id', removed);
      if (error) throw error;
      for (const id of removed) saved.delete(id);
    } catch {
      stuck = true;
    }
  }

  if (stuck) onError?.(new Error('Could not save everything just now.'));
}
