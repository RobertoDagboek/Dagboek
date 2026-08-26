/**
 * Reminder catching.   Run with:  node test/reminders.mjs
 *
 * Checks what the app pulls out of a transcript. The cases below are written
 * the way speech actually arrives: no punctuation, Afrikaans and English in
 * one sentence, and the reminder buried mid-paragraph.
 */
import { findReminders } from '../js/diary/reminders.js';

const TODAY = '2026-08-26';   // a Wednesday

let fails = 0;
function check(label, text, want) {
  const got = findReminders(text, TODAY);
  const same = JSON.stringify(got.map(r => ({ subject: r.subject, date: r.date })))
             === JSON.stringify(want);
  if (!same) fails++;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label}`);
  if (!same) {
    console.log(`        got  ${JSON.stringify(got.map(r => ({ subject: r.subject, date: r.date })))}`);
    console.log(`        want ${JSON.stringify(want)}`);
  }
}

console.log('--- the plain case ---');
check('remind me to',
  'Long day today. Remind me to call the bank.',
  [{ subject: 'Call the bank', date: '' }]);

check('no punctuation, which is how speech arrives',
  'was a good day remind me to order more timber',
  [{ subject: 'Order more timber', date: '' }]);

check('nothing to find',
  'Quiet day, finished the drawings and went home.',
  []);

console.log('\n--- when ---');
check('tomorrow',
  'Remind me to phone the supplier tomorrow.',
  [{ subject: 'Phone the supplier', date: '2026-08-27' }]);

check('a weekday ahead',
  'Remind me to send the invoice on Friday.',
  [{ subject: 'Send the invoice', date: '2026-08-28' }]);

check('a weekday that has passed rolls to next week',
  'Remind me to book the truck on Monday.',
  [{ subject: 'Book the truck', date: '2026-08-31' }]);

check('today named as today',
  'Remind me to lock the workshop today.',
  [{ subject: 'Lock the workshop', date: '2026-08-26' }]);

check('a day named mid-sentence is part of the task, not the date',
  'Remind me to call about Friday delivery with the client.',
  [{ subject: 'Call about Friday delivery with the client', date: '' }]);

console.log('\n--- Afrikaans and code-switching ---');
check('onthou om',
  'Lekker dag gehad. Onthou om die hout te bestel.',
  [{ subject: 'Die hout te bestel', date: '' }]);

check('mixed, with an Afrikaans day word',
  'Ek het by die werk gewerk, remind me to bel die kliënt môre.',
  [{ subject: 'Bel die kliënt', date: '2026-08-27' }]);

check('herinner my om',
  'Herinner my om die bakkie se olie te check.',
  [{ subject: 'Die bakkie se olie te check', date: '' }]);

console.log('\n--- more than one ---');
check('two in one entry',
  'Remind me to call the bank. Later I sanded the doors. Remind me to buy sandpaper tomorrow.',
  [{ subject: 'Call the bank', date: '' },
   { subject: 'Buy sandpaper', date: '2026-08-27' }]);

check('run on with "and then"',
  'Remind me to fetch the delivery and then I went to lunch.',
  [{ subject: 'Fetch the delivery', date: '' }]);

console.log('\n--- must not invent ---');
check('an empty trigger produces nothing',
  'Remind me.',
  []);

check('the word reminder alone is not a trigger',
  'That was a good reminder of why I do this.',
  []);

check('longest trigger wins, so "to" is not left in the subject',
  'Remind me to to be careful.',
  [{ subject: 'Be careful', date: '' }]);

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
