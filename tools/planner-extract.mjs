/**
 * Pull the CSS and JS out of one of the single-file planner builds, so two
 * versions can be diffed like normal source files.
 *
 *   node tools/planner-extract.mjs vendor/planner/planner_9.html
 *
 * Writes vendor/planner/extracted/<name>/{style.css,script.js}. Commit those
 * alongside the html. When a new version arrives:
 *
 *   node tools/planner-extract.mjs vendor/planner/planner_10.html
 *   git diff --no-index vendor/planner/extracted/planner_9 vendor/planner/extracted/planner_10
 *
 * That diff is the exact list of what he changed, and the only thing that needs
 * carrying across into js/planner.js.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node tools/planner-extract.mjs <path-to-planner.html>');
  process.exit(1);
}

const html = readFileSync(input, 'utf8');
const name = basename(input).replace(/\.html?$/i, '');
const outDir = join(dirname(input), 'extracted', name);
mkdirSync(outDir, { recursive: true });

const grab = (tag) => {
  const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)</${tag}>`, 'gi');
  const parts = [];
  for (const m of html.matchAll(re)) parts.push(m[1].trim());
  return parts.join('\n\n/* ---- next block ---- */\n\n');
};

const css = grab('style');
const js = grab('script');

writeFileSync(join(outDir, 'style.css'), css + '\n');
writeFileSync(join(outDir, 'script.js'), js + '\n');

const lines = s => s.split('\n').length;
console.log(`extracted ${name}`);
console.log(`  style.css  ${lines(css)} lines`);
console.log(`  script.js  ${lines(js)} lines`);
console.log(`  -> ${outDir}`);
