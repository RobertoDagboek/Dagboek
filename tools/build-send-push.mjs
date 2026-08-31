/**
 * Rebuild the Supabase function from js/planner/schedule.js.
 *
 *   node tools/build-send-push.mjs
 *
 * The function cannot import the rules at runtime - Supabase's bundler only
 * allows npm, jsr and esm.sh, not our own site. So the rules are copied in,
 * and copies drift. This generates the copy instead of anyone maintaining it,
 * and test/function-in-sync.mjs fails the moment the two disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const START = '// >>> GENERATED FROM js/planner/schedule.js - DO NOT EDIT BELOW';
const END   = '// <<< END GENERATED';

export function scheduleBlock() {
  const src = readFileSync(new URL('../js/planner/schedule.js', import.meta.url), 'utf8');
  // Strip the exports: in here they are plain top-level declarations.
  const body = src.replace(/^export (function|const) /gm, '$1 ');
  return `${START}\n${body.trimEnd()}\n${END}`;
}

export function rebuild() {
  const path = new URL('../supabase/functions/send-push/index.ts', import.meta.url);
  const cur = readFileSync(path, 'utf8');
  const a = cur.indexOf(START);
  const b = cur.indexOf(END);
  if (a === -1 || b === -1) throw new Error('markers missing from index.ts');
  const next = cur.slice(0, a) + scheduleBlock() + cur.slice(b + END.length);
  writeFileSync(path, next);
  return next !== cur;
}

if (process.argv[1] && process.argv[1].endsWith('build-send-push.mjs')) {
  console.log(rebuild() ? 'index.ts regenerated' : 'index.ts already up to date');
}
