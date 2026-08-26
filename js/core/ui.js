// Shared UI machinery, taken from the planner and kept as it was: the spring
// engine, the icon set, the date strip, the time picker and the bottom sheet.
// Nothing here knows about tasks or diary entries.


export const $ = id => document.getElementById(id);

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}
export function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function pad(n) { return String(n).padStart(2, '0'); }

/* ===================== Spring engine ===================== */

export class Spring {
  constructor(value, { dampingRatio = 1, response = 0.3 } = {}) {
    this.value = value; this.velocity = 0; this.target = value;
    this.dampingRatio = dampingRatio; this.response = response; this.active = false;
  }
  set(target, velocity) { this.target = target; if (velocity !== undefined) this.velocity = velocity; this.active = true; }
  snap(value) { this.value = value; this.target = value; this.velocity = 0; this.active = false; }
  step(dt) {
    const omega = 2 * Math.PI / this.response;
    const k = omega * omega, c = 2 * this.dampingRatio * omega;
    const accel = -k * (this.value - this.target) - c * this.velocity;
    this.velocity += accel * dt; this.value += this.velocity * dt;
    if (Math.abs(this.value - this.target) < 0.01 && Math.abs(this.velocity) < 0.01) {
      this.value = this.target; this.velocity = 0; this.active = false;
    }
    return this.value;
  }
}

export const REDUCE_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function runSpring(spring, onUpdate, onDone) {
  if (REDUCE_MOTION) { spring.snap(spring.target); onUpdate(spring.value); if (onDone) onDone(); return; }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.032); last = now;
    spring.step(dt); onUpdate(spring.value);
    if (spring.active) requestAnimationFrame(frame); else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}
export function project(v, decel = 0.998) { return (v / 1000) * decel / (1 - decel); }
export function rubberband(overshoot, dimension, constant = 0.55) {
  const sign = overshoot < 0 ? -1 : 1, o = Math.abs(overshoot);
  return sign * (o * dimension * constant) / (dimension + constant * o);
}

/* ===================== Icons ===================== */

export const ICON_CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 9 17 20 6"></polyline></svg>';
export const ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>';
export const ICON_PLUS = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
export const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';
export const ICON_BOLT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M13 2 3 14h7l-1 8 11-14h-8l1-6z"/></svg>';
export const ICON_TODAY = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
export const ICON_WEEK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
export const ICON_GOALS = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h13l-3 4 3 4H5"/></svg>';
export const ICON_INBOX = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l1.5 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6l1.5-7z"/></svg>';
export const ICON_DIARY = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2z"/><path d="M9 7h6M9 11h6"/></svg>';
export const ICON_MIC = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';

/* ===================== Dates ===================== */

export function todayStr(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
export function parseDateStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDateStr(s); d.setDate(d.getDate() + n); return todayStr(d); }
export function dayNum(s) { return parseInt(s.split('-')[2], 10); }
export function monthStart(s) { const d = parseDateStr(s); return todayStr(new Date(d.getFullYear(), d.getMonth(), 1)); }
export function addMonths(s, n) { const d = parseDateStr(s); return todayStr(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
export function daysBetween(a, b) { return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000); }

// South African English: day-before-month dates, local weekday names.
const locale = () => 'en-ZA';
export function fmtDateFull(s) { return parseDateStr(s).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' }); }
export function fmtDateShort(s) { return parseDateStr(s).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }); }
export function fmtMonthDay(s) { return parseDateStr(s).toLocaleDateString(locale(), { month: 'short', day: 'numeric' }); }
export function fmtMonthYear(s) { return parseDateStr(s).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); }
export function dowAbbr(s) { return parseDateStr(s).toLocaleDateString(locale(), { weekday: 'short' }).slice(0, 3); }
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return h12 + ':' + pad(m) + ap;
}

/** Localised Mon..Sun initials and short names, derived rather than hard-coded. */
export function dowLabels(style = 'narrow') {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 1 + i); // 2024-01-01 was a Monday
    out.push(d.toLocaleDateString(locale(), { weekday: style }));
  }
  return out;
}

/* ===================== Date strip (month grid) ===================== */

const stripState = {};

export function dateStripWrapHtml(fieldId) { return `<div id="${fieldId}StripWrap"></div>`; }

function dateStripInnerHtml(fieldId, selected, cursorMonth, today) {
  const first = parseDateStr(cursorMonth);
  const month = first.getMonth();
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = addDays(cursorMonth, -firstDow);
  const lastDate = new Date(first.getFullYear(), month + 1, 0);
  const lastDow = (lastDate.getDay() + 6) % 7;
  const gridEnd = addDays(todayStr(lastDate), 6 - lastDow);
  const weeks = Math.round((daysBetween(gridStart, gridEnd) + 1) / 7);

  let cells = '';
  let cursor = gridStart;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const inMonth = parseDateStr(cursor).getMonth() === month;
      const isSel = cursor === selected;
      const isT = cursor === today;
      cells += `<button class="ds-cell ${inMonth ? '' : 'outmonth'}" data-dsday="${cursor}" type="button">
        <span class="ds-num ${isSel ? 'selected' : ''} ${isT && !isSel ? 'is-today' : ''}">${dayNum(cursor)}</span>
      </button>`;
      cursor = addDays(cursor, 1);
    }
  }

  return `<div class="date-strip" id="${fieldId}Strip">
      <div class="ds-header">
        <span class="ds-month">${fmtMonthYear(cursorMonth)}</span>
        <div class="ds-nav">
          <button class="ds-nav-btn" data-dsprev type="button" aria-label="Previous">&lsaquo;</button>
          <button class="ds-nav-btn" data-dsnext type="button" aria-label="Next">&rsaquo;</button>
        </div>
      </div>
      <div class="ds-dow-row">${dowLabels('narrow').map(d => `<div class="ds-dow-label">${d}</div>`).join('')}</div>
      <div class="ds-grid">${cells}</div>
    </div>`;
}

export function wireDateStrip(fieldId, initialSelected, today) {
  const wrap = $(fieldId + 'StripWrap');
  if (!wrap) return;
  stripState[fieldId] = initialSelected || '';
  let cursor = monthStart(initialSelected || today);

  function render() {
    wrap.innerHTML = dateStripInnerHtml(fieldId, stripState[fieldId], cursor, today);
    wrap.querySelectorAll('[data-dsday]').forEach(b => b.addEventListener('click', e => {
      stripState[fieldId] = e.currentTarget.getAttribute('data-dsday');
      render();
    }));
    const prev = wrap.querySelector('[data-dsprev]');
    const next = wrap.querySelector('[data-dsnext]');
    if (prev) prev.addEventListener('click', () => { cursor = addMonths(cursor, -1); render(); });
    if (next) next.addEventListener('click', () => { cursor = addMonths(cursor, 1); render(); });
  }
  render();
}
export function getDateStripValue(fieldId) { return stripState[fieldId] || ''; }

/* ===================== Time picker ===================== */

export function timePickerContainerHtml(fieldId, timeStr, addLabel) {
  return `<span id="${fieldId}Container">${timeStr
    ? timePickerSelectsHtml(fieldId, timeStr)
    : timePickerButtonHtml(addLabel)}</span>`;
}
function timePickerButtonHtml(addLabel) {
  return `<button class="qo-pill" data-tpadd type="button">${escapeHtml(addLabel || 'Add time')}</button>`;
}
function timePickerSelectsHtml(fieldId, timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const steps = [0, 15, 30, 45];
  const rounded = steps.reduce((best, s) => (Math.abs(s - mm) < Math.abs(best - mm) ? s : best), 0);
  const hourOpts = Array.from({ length: 24 }, (_, i) => i)
    .map(h => `<option value="${h}" ${h === hh ? 'selected' : ''}>${pad(h)}</option>`).join('');
  const minOpts = steps.map(m => `<option value="${m}" ${m === rounded ? 'selected' : ''}>${pad(m)}</option>`).join('');
  return `<span class="time-picker">
    <select class="tp-select" id="${fieldId}_h">${hourOpts}</select>
    <span class="tp-colon">:</span>
    <select class="tp-select" id="${fieldId}_m">${minOpts}</select>
    <button class="tp-clear" data-tpclear type="button" aria-label="Clear">&times;</button>
  </span>`;
}
export function wireTimePicker(fieldId, addLabel) {
  const container = $(fieldId + 'Container');
  if (!container) return;
  function rerender(timeStr) {
    container.innerHTML = timeStr ? timePickerSelectsHtml(fieldId, timeStr) : timePickerButtonHtml(addLabel);
    bind();
  }
  function bind() {
    const add = container.querySelector('[data-tpadd]');
    if (add) add.addEventListener('click', () => rerender('09:00'));
    const clear = container.querySelector('[data-tpclear]');
    if (clear) clear.addEventListener('click', () => rerender(''));
  }
  bind();
}
export function getTimePickerValue(fieldId) {
  const h = $(fieldId + '_h');
  if (!h) return '';
  return pad(parseInt(h.value, 10)) + ':' + pad(parseInt($(fieldId + '_m').value, 10));
}

/* ===================== Bottom sheet ===================== */

export function sheetEl() { return $('sheet'); }

function sheetScale(el) {
  const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
  return m ? parseFloat(m[1]) : 0.92;
}

export function openSheet() {
  const scrim = $('scrim');
  const sheet = $('sheet');
  scrim.style.pointerEvents = 'auto';
  sheet.style.pointerEvents = 'auto';
  animateOpacity(scrim, 1, 220);
  animateOpacity(sheet, 1, 180);
  const s = new Spring(0.92, { dampingRatio: 0.84, response: 0.3 });
  s.set(1);
  runSpring(s, v => { sheet.style.transform = `translate(-50%, -50%) scale(${v})`; });
}

export function closeSheet() {
  const scrim = $('scrim');
  const sheet = $('sheet');
  const s = new Spring(sheetScale(sheet), { dampingRatio: 1, response: 0.22 });
  s.set(0.92);
  runSpring(s,
    v => { sheet.style.transform = `translate(-50%, -50%) scale(${v})`; },
    () => { scrim.style.pointerEvents = 'none'; sheet.style.pointerEvents = 'none'; });
  animateOpacity(scrim, 0, 180);
  animateOpacity(sheet, 0, 150);
}

/* ===================== Estimate picker ===================== */
// Min-max plus a unit, chosen from dropdowns rather than typed, so what lands
// in the data is always something the app can read back.

const UNITS = ['hour', 'day', 'week'];

export function estimatePickerContainerHtml(fieldId, estimateStr) {
  return `<span id="${fieldId}Container">${estimateStr
    ? estimateSelectsHtml(fieldId, estimateStr)
    : estimateButtonHtml()}</span>`;
}
function estimateButtonHtml() {
  return '<button class="qo-pill" data-estadd type="button">&#9201; Add estimate</button>';
}
function unitLabel(unit, count) {
  return count === 1 ? unit : unit + 's';
}
function estimateSelectsHtml(fieldId, estimateStr) {
  const m = /^(\d+)(?:\s*-\s*(\d+))?\s*(hour|day|week)/i.exec(estimateStr || '');
  const min = m ? Number(m[1]) : 1;
  const max = m && m[2] ? Number(m[2]) : min;
  const unit = m ? m[3].toLowerCase() : 'hour';
  const nums = Array.from({ length: 30 }, (_, i) => i + 1);
  const opts = sel => nums.map(n => `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`).join('');
  return `<span class="time-picker">
    <select class="tp-select" id="${fieldId}_min">${opts(min)}</select>
    <span class="tp-colon">&ndash;</span>
    <select class="tp-select" id="${fieldId}_max">${opts(max)}</select>
    <select class="tp-select" id="${fieldId}_unit">
      ${UNITS.map(u => `<option value="${u}" ${u === unit ? 'selected' : ''}>${u}s</option>`).join('')}
    </select>
    <button class="tp-clear" data-estclear type="button" aria-label="Clear estimate">&times;</button>
  </span>`;
}
export function wireEstimatePicker(fieldId) {
  const container = $(fieldId + 'Container');
  if (!container) return;
  function rerender(estimateStr) {
    container.innerHTML = estimateStr ? estimateSelectsHtml(fieldId, estimateStr) : estimateButtonHtml();
    bind();
  }
  function bind() {
    const add = container.querySelector('[data-estadd]');
    if (add) add.addEventListener('click', () => rerender('1 hour'));
    const clear = container.querySelector('[data-estclear]');
    if (clear) clear.addEventListener('click', () => rerender(''));
    // Keep the range the right way round without arguing with the user.
    const min = $(fieldId + '_min');
    const max = $(fieldId + '_max');
    if (min && max) {
      min.addEventListener('change', () => { if (+max.value < +min.value) max.value = min.value; });
      max.addEventListener('change', () => { if (+min.value > +max.value) min.value = max.value; });
    }
  }
  bind();
}
export function getEstimatePickerValue(fieldId) {
  const minSel = $(fieldId + '_min');
  if (!minSel) return '';
  const min = Number(minSel.value);
  const max = Number($(fieldId + '_max').value);
  const unit = $(fieldId + '_unit').value;
  return min === max ? `${min} ${unitLabel(unit, min)}` : `${min}-${max} ${unitLabel(unit, max)}`;
}
export function animateOpacity(el, target, ms) {
  if (REDUCE_MOTION) { el.style.opacity = target; return; }
  const start = parseFloat(el.style.opacity || 0);
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / ms);
    el.style.opacity = start + (target - start) * p;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ===================== Toast ===================== */

let toastTimer = null;
export function toast(msg) {
  if (!msg) return;
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ===================== Re-render signal ===================== */
// The screens ask for a redraw without importing the router, which would make
// a cycle. app.js listens for this.
export function refresh() { document.dispatchEvent(new CustomEvent('app:refresh')); }
