// Catching "remind me to ..." inside a dictated diary entry.
//
// This runs on the transcript, so its accuracy has two halves. The matching
// below is deterministic - given the right words it is exact. Whether those
// words arrive correctly is down to the transcription, which is why the
// trigger phrases are also fed to the speech model as hints (see
// transcribe.js). Getting "remind me" heard reliably matters far more than
// any cleverness here.
//
// Deliberately literal: it looks for phrases a person actually says out loud,
// and ignores everything else. A missed reminder is a small annoyance; an
// invented one you never said is worse, because you would trust it.

const TRIGGERS = [
  // English
  'remind me to', 'remind me that', 'remind me',
  'reminder to', 'reminder that',
  "don't let me forget to", 'dont let me forget to', "don't forget to", 'dont forget to',
  'i must remember to', 'i need to remember to', 'i mustn’t forget to',
  'make a note to', 'note to self',
  // Afrikaans
  'herinner my om', 'herinner my dat', 'herinner my',
  'onthou om', 'onthou dat', 'ek moet onthou om', 'ek moet onthou',
  'moenie vergeet om', 'moenie vergeet nie om', 'moenie my laat vergeet om',
];

// Longest first, so "remind me to" wins over "remind me".
const ORDERED = [...TRIGGERS].sort((a, b) => b.length - a.length);

// Where a reminder stops. A full stop, or the speaker moving on.
const ENDINGS = [
  '.', '!', '?', '\n',
  ' and then ', ' and also ', ' after that ', ' anyway ', ' but anyway ',
  ' en dan ', ' en ook ', ' daarna ', ' in elk geval ',
];

/** Day words -> how many days ahead, or a weekday number. */
const WHEN = [
  { words: ['today', 'vandag'], days: 0 },
  { words: ['tonight', 'vanaand'], days: 0 },
  { words: ['tomorrow', 'more', 'môre'], days: 1 },
  { words: ['day after tomorrow', 'oormore', 'oormôre'], days: 2 },
  { words: ['next week', 'volgende week'], days: 7 },
  { words: ['monday', 'maandag'], dow: 1 },
  { words: ['tuesday', 'dinsdag'], dow: 2 },
  { words: ['wednesday', 'woensdag'], dow: 3 },
  { words: ['thursday', 'donderdag'], dow: 4 },
  { words: ['friday', 'vrydag'], dow: 5 },
  { words: ['saturday', 'saterdag'], dow: 6 },
  { words: ['sunday', 'sondag'], dow: 0 },
];

// The connective right after a trigger ("remind me to *call*"). Deliberately
// not "the" or "die" - those are part of what was said, and stripping them
// eats a word off the front of the task.
const LEAD_IN = /^(?:to|that|om|dat)\s+/i;

/**
 * Pull reminders out of a transcript.
 * @param {string} text
 * @param {string} todayStr  today as YYYY-MM-DD, so this stays testable
 * @returns {{subject: string, date: string, heard: string}[]}
 */
export function findReminders(text, todayStr) {
  if (!text) return [];
  const hay = text.toLowerCase();
  const found = [];
  const takenUpTo = [];

  for (let i = 0; i < hay.length; i++) {
    const trigger = ORDERED.find(tr => hay.startsWith(tr, i));
    if (!trigger) continue;
    // Skip a match that sits inside one already taken.
    if (takenUpTo.some(([from, to]) => i >= from && i < to)) continue;

    const start = i + trigger.length;
    let end = text.length;
    for (const stop of ENDINGS) {
      const at = hay.indexOf(stop, start);
      if (at !== -1 && at < end) end = at;
    }

    const raw = text.slice(start, end).trim();
    if (raw) {
      const { subject, date } = split(raw, todayStr);
      if (subject) found.push({ subject, date, heard: text.slice(i, end).trim() });
    }
    takenUpTo.push([i, end]);
    i = end;
  }
  return found;
}

/** Separate "call the bank on Friday" into a subject and a date. */
function split(raw, todayStr) {
  let subject = raw.replace(LEAD_IN, '').trim();
  let date = '';

  const lower = subject.toLowerCase();
  let best = null;
  for (const entry of WHEN) {
    for (const word of entry.words) {
      // Only a trailing mention sets the date. "call about Friday's order" in
      // the middle of a sentence is part of what to do, not when to do it.
      const at = lower.lastIndexOf(word);
      if (at === -1) continue;
      const after = lower.slice(at + word.length).trim();
      if (after && !/^[.,!?]*$/.test(after)) continue;
      if (!best || at > best.at) best = { at, word, entry };
    }
  }

  if (best && todayStr) {
    date = resolve(best.entry, todayStr);
    subject = subject.slice(0, best.at)
      .replace(/\b(on|next|this|op|volgende|hierdie)\s*$/i, '')
      .replace(/[\s,]+$/, '')
      .trim();
  }

  subject = subject.replace(/[\s.,!?]+$/, '').trim();
  if (subject) subject = subject[0].toUpperCase() + subject.slice(1);
  return { subject, date };
}

function resolve(entry, todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  if (entry.days !== undefined) {
    base.setDate(base.getDate() + entry.days);
  } else {
    // The next time that weekday comes round; today counts as next week.
    const ahead = ((entry.dow - base.getDay() + 7) % 7) || 7;
    base.setDate(base.getDate() + ahead);
  }
  const p = n => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

/** The phrases worth telling the speech model to listen for. */
export function triggerHints() {
  return ['remind me to', 'don’t forget to', 'onthou om', 'herinner my om'];
}
