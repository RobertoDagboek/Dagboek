/**
 * The Supabase function carries a copy of the rules.   node test/function-in-sync.mjs
 *
 * It has to: Supabase's bundler only accepts npm, jsr and esm.sh imports, so
 * the function cannot fetch js/planner/schedule.js from our own site. Copies
 * drift, and a drifted copy here means notifications quietly following last
 * month's rules. This fails the moment the two disagree.
 */
import { readFileSync } from 'node:fs';
import { scheduleBlock } from '../tools/build-send-push.mjs';

const fn = readFileSync(new URL('../supabase/functions/send-push/index.ts', import.meta.url), 'utf8');
const want = scheduleBlock();

let fails = 0;
const check = (label, ok) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

check('the function carries the current rules, verbatim', fn.includes(want));
check('it does not import them from the web - the bundler refuses that',
  !fn.includes('robertodagboek.github.io'));
check('only bundler-approved imports are used',
  [...fn.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
    .every(u => u.startsWith('npm:') || u.startsWith('jsr:') || u.startsWith('https://esm.sh/')));

if (!fn.includes(want)) {
  console.log('\n  The copy is stale. Run:  node tools/build-send-push.mjs');
  console.log('  ...then paste supabase/functions/send-push/index.ts into Supabase again.');
}
console.log(fails ? `\n${fails} FAILED` : '\nall good - one set of rules');
process.exit(fails ? 1 : 0);
