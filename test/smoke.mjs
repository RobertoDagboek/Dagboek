/**
 * Smoke test.   Run with:  node test/smoke.mjs
 *
 * `node --check` only parses a file - it happily accepts code that explodes the
 * moment it runs. This starts the app against a stubbed browser and then draws
 * every screen, failing on anything thrown: temporal dead zones, missing
 * bindings, a render reaching for an element that no longer exists.
 *
 * It proves the app runs, not that it looks right. Only a real browser can
 * tell you that.
 */
import { mkdtempSync, readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const JS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');

/* ----------------------- a browser, roughly ----------------------- */

const NOOP_METHODS = new Set([
  'addEventListener', 'removeEventListener', 'appendChild', 'append', 'prepend',
  'remove', 'scrollIntoView', 'focus', 'blur', 'click', 'play', 'pause', 'load',
  'setAttribute', 'removeAttribute', 'insertBefore', 'replaceChildren',
  'getContext', 'toBlob', 'close', 'setSelectionRange',
]);

function makeEl(tag = 'div') {
  const store = {
    tagName: String(tag).toUpperCase(),
    style: {}, dataset: {},
    value: '', textContent: '', innerHTML: '',
    hidden: false, open: false, scrollHeight: 60, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return new Proxy(store, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol') return undefined;
      if (key === 'querySelectorAll') return () => [];
      if (key === 'querySelector') return () => makeEl();
      if (key === 'closest') return () => null;
      if (key === 'contains') return () => false;
      if (key === 'getBoundingClientRect') return () => ({ width: 320, height: 44, top: 0, left: 0 });
      if (NOOP_METHODS.has(key)) return () => {};
      return undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const byId = new Map();
globalThis.document = {
  documentElement: { lang: 'af' },
  body: makeEl('body'),
  getElementById(id) {
    if (!byId.has(id)) byId.set(id, makeEl());
    return byId.get(id);
  },
  createElement: makeEl,
  createDocumentFragment: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
  dispatchEvent() { return true; },
  get activeElement() { return null; },
};

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear(),
};

globalThis.location = {
  origin: 'https://robertodagboek.github.io',
  pathname: '/Dagboek/', protocol: 'https:', reload() {},
};

Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) }, geolocation: {} },
  configurable: true, writable: true,
});

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.confirm = () => false;
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
globalThis.AudioContext = class { createAnalyser() { return {}; } };
globalThis.createImageBitmap = async () => ({ width: 10, height: 10, close() {} });

/* ---------------- copy the real modules, stub the CDN ---------------- */

const SUPABASE_STUB = `export function createClient() {
  const q = { select:()=>q, eq:()=>q, ilike:()=>q, or:()=>q, not:()=>q, contains:()=>q, in:()=>q,
    gte:()=>q, lte:()=>q, order:()=>q, limit:()=>q, insert:()=>q, upsert:()=>q, delete:()=>q, update:()=>q,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: r => Promise.resolve({ data: [], error: null }).then(r) };
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'stub-user' } } } }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signInWithOtp: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => {},
    },
    from: () => q,
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({}),
      createSignedUrl: async () => ({ data: null, error: 'stub' }),
    }) },
  };
}`;

const work = mkdtempSync(join(tmpdir(), 'dagboek-smoke-'));
const problems = [];
process.on('unhandledRejection', e => problems.push(`unhandled rejection: ${e?.stack || e}`));
process.on('uncaughtException', e => problems.push(`uncaught: ${e?.stack || e}`));

try {
  // Mirror the js/ tree, so relative imports between core/planner/diary hold.
  const copyTree = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const e of readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copyTree(join(from, e.name), join(to, e.name));
      else if (e.name.endsWith('.js')) copyFileSync(join(from, e.name), join(to, e.name));
    }
  };
  copyTree(JS_DIR, work);
  writeFileSync(join(work, 'package.json'), '{ "type": "module" }');
  writeFileSync(join(work, 'supabase-stub.js'), SUPABASE_STUB);

  const supaPath = join(work, 'core', 'supa.js');
  writeFileSync(supaPath, readFileSync(supaPath, 'utf8')
    .replace(/from 'https:\/\/esm\.sh\/@supabase\/supabase-js@\d+'/, "from '../supabase-stub.js'"));

  const url = f => pathToFileURL(join(work, f)).href;

  // 1. does it boot?
  try {
    await import(url('app.js'));
  } catch (e) {
    problems.push(`boot threw: ${e?.stack || e}`);
  }
  await new Promise(r => setTimeout(r, 300));

  // 2. does every screen draw?
  const screens = [];
  try {
    const planner = await import(url('planner/planner.js'));
    const diary = await import(url('diary/diary.js'));
    diary.setDiarySession({ user: { id: 'stub-user' } });
    screens.push(
      ['today', planner.renderToday],
      ['calendar', planner.renderWeek],
      ['goals', planner.renderGoals],
      ['inbox', planner.renderInbox],
      ['diary', diary.renderDiary],
      ['capture sheet', () => planner.openCaptureSheet('today')],
    );
  } catch (e) {
    problems.push(`could not load screens: ${e?.stack || e}`);
  }

  for (const [name, fn] of screens) {
    try {
      await fn();
      console.log(`  drew ${name}`);
    } catch (e) {
      problems.push(`${name} threw: ${e?.stack || e}`);
    }
  }
  await new Promise(r => setTimeout(r, 300));

  if (problems.length) {
    console.log('\nSMOKE FAILED\n');
    for (const p of problems) console.log(p, '\n');
    process.exitCode = 1;
  } else {
    console.log('\nSMOKE PASSED - boots and every screen renders');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// The app sets a midnight-rollover interval, which would keep node alive.
process.exit(process.exitCode || 0);
