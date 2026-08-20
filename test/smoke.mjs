/**
 * Boot smoke test.   Run with:  node test/smoke.mjs
 *
 * `node --check` only parses a file - it happily accepts code that explodes the
 * moment it runs. This actually starts app.js against a stubbed browser and
 * fails on anything thrown during startup: temporal dead zones, missing
 * bindings, property access on something undefined.
 *
 * It is a smoke test, not a DOM. It proves the app boots, not that it looks
 * right - only a real browser can tell you that.
 */
import { mkdtempSync, readdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
    hidden: false, open: false, scrollHeight: 60,
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
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
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
  pathname: '/Dagboek/',
  protocol: 'https:',
  reload() {},
};

Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
    geolocation: {},
  },
  configurable: true, writable: true,
});

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.confirm = () => false;
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
globalThis.MediaRecorder = class { static isTypeSupported() { return true; } };
globalThis.AudioContext = class { createAnalyser() { return {}; } };
globalThis.createImageBitmap = async () => ({ width: 10, height: 10, close() {} });

/* ---------------- copy the real modules, stub the CDN ---------------- */

const SUPABASE_STUB = `export function createClient() {
  const q = { select:()=>q, eq:()=>q, ilike:()=>q, or:()=>q, not:()=>q, contains:()=>q,
    gte:()=>q, lte:()=>q, order:()=>q, limit:()=>q, insert:()=>q, upsert:()=>q, delete:()=>q,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: r => Promise.resolve({ data: [], error: null }).then(r) };
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signInWithOtp: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => {},
    },
    from: () => q,
    rpc: async () => ({ data: 0, error: null }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({}),
      createSignedUrl: async () => ({ data: null, error: 'stub' }),
    }) },
  };
}`;

const work = mkdtempSync(join(tmpdir(), 'dagboek-smoke-'));
try {
  for (const file of readdirSync(JS_DIR).filter(f => f.endsWith('.js'))) {
    copyFileSync(join(JS_DIR, file), join(work, file));
  }
  writeFileSync(join(work, 'package.json'), '{ "type": "module" }');
  writeFileSync(join(work, 'supabase-stub.js'), SUPABASE_STUB);

  const supaPath = join(work, 'supa.js');
  const patched = readFileSync(supaPath, 'utf8')
    .replace(/from 'https:\/\/esm\.sh\/@supabase\/supabase-js@\d+'/, "from './supabase-stub.js'");
  writeFileSync(supaPath, patched);

  const problems = [];
  process.on('unhandledRejection', e => problems.push(String(e?.stack || e)));
  process.on('uncaughtException', e => problems.push(String(e?.stack || e)));

  try {
    await import(pathToFileURL(join(work, 'app.js')).href);
  } catch (e) {
    problems.push(String(e?.stack || e));
  }

  await new Promise(r => setTimeout(r, 400)); // let boot()'s async tail finish

  if (problems.length) {
    console.log('SMOKE FAILED\n');
    for (const p of problems) console.log(p, '\n');
    process.exitCode = 1;
  } else {
    console.log('SMOKE PASSED - app.js boots with no runtime errors');
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
