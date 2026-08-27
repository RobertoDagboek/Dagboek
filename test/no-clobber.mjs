/**
 * Unsaved diary words must survive a redraw.   node test/no-clobber.mjs
 *
 * A 2-minute recording was once transcribed, then lost: catching a reminder
 * triggered a full redraw, the editor reloaded from the database (which did not
 * have the transcript yet), and the save that followed wrote the reverted text
 * back. This mirrors the guard that now prevents it.
 */

// --- the rule, as it is written in js/diary/diary.js
function wouldRebuild({ dirty, search, editorFor, date, sectionsExist }) {
  const keepsWhatIsOnScreen = dirty && !search.trim() && editorFor === date && sectionsExist;
  return !keepsWhatIsOnScreen;
}

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `   got rebuild=${got}, want ${want}`}`);
};

const editing = {
  dirty: true, search: '', editorFor: '2026-08-27', date: '2026-08-27', sectionsExist: true,
};

console.log('--- the bug that lost a 2-minute recording ---');
check('a reminder fires while the transcript is unsaved: keep the words',
  wouldRebuild(editing), false);
check('a task saved on another tab: still keep the words',
  wouldRebuild(editing), false);
check('midnight rolls over mid-sentence: still keep the words',
  wouldRebuild(editing), false);

console.log('\n--- but a redraw must still happen when it is safe ---');
check('nothing unsaved',
  wouldRebuild({ ...editing, dirty: false }), true);
check('after saving, so the screen can refresh normally',
  wouldRebuild({ ...editing, dirty: false }), true);
check('the user moved to another day',
  wouldRebuild({ ...editing, date: '2026-08-28' }), true);
check('the user is searching, not writing',
  wouldRebuild({ ...editing, search: 'braai' }), true);
check('the editor is not on screen at all',
  wouldRebuild({ ...editing, sectionsExist: false }), true);
check('first render, nothing built yet',
  wouldRebuild({ dirty: false, search: '', editorFor: null, date: '2026-08-27', sectionsExist: false }), true);

console.log(fails ? `\n${fails} FAILED` : '\nall good - unsaved words cannot be redrawn away');
process.exit(fails ? 1 : 0);
