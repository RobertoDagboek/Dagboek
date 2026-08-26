/**
 * Pull the CSS and JS out of one of the single-file planner builds, so two
 * versions can be diffed like normal source files.
 *
 *   node tools/planner-extract.mjs vendor/planner/planner.html
 *
 * Writes vendor/planner/extracted/<name>/{style.css,script.js}. Commit those
 * alongside the html. When a new version arrives:
 *
 *   node tools/planner-extract.mjs vendor/planner/planner_next.html
 *   git diff --no-index \
 *     vendor/planner/extracted/planner \
 *     vendor/planner/extracted/planner_next
 *
 * That diff is the exact list of what changed, and the only thing that needs
 * carrying into js/planner/planner.js.
 *
 * Deliberately no regex here. The first version of this used a template
 * literal to build one, where `\s` is not an escape sequence and quietly
 * became a plain 's' - so it matched nothing and wrote two empty files while
 * reporting success. Plain string searching cannot fail that way.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node tools/planner-extract.mjs <path-to-planner.html>');
  process.exit(1);
}

const html = readFileSync(input, 'utf8');

/** Everything between the first <tag ...> and the last </tag>. */
function grab(tag) {
  const openAt = html.toLowerCase().indexOf('<' + tag);
  if (openAt === -1) return '';
  const bodyAt = html.indexOf('>', openAt);
  const closeAt = html.toLowerCase().lastIndexOf('</' + tag);
  if (bodyAt === -1 || closeAt === -1 || closeAt < bodyAt) return '';
  return html.slice(bodyAt + 1, closeAt).trim();
}

const css = grab('style');
const js = grab('script');

if (!css || !js) {
  console.error(`extracted nothing from ${input}`);
  console.error(`  <style> found: ${Boolean(css)}   <script> found: ${Boolean(js)}`);
  console.error('  is this really a single-file build?');
  process.exit(1);
}

const name = basename(input).replace(/\.html?$/i, '');
const outDir = join(dirname(input), 'extracted', name);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'style.css'), css + '\n');
writeFileSync(join(outDir, 'script.js'), js + '\n');

const lines = s => s.split('\n').length;
console.log(`extracted ${name}`);
console.log(`  style.css  ${lines(css)} lines`);
console.log(`  script.js  ${lines(js)} lines`);
console.log(`  -> ${outDir}`);
