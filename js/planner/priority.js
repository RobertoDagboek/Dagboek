// The Eisenhower matrix.
//
// Two questions - is it urgent, is it important - give four quadrants. Stored
// as 1-4 in the order the matrix is read, so sorting is a plain ascending sort
// and no lookup sits between the number and the meaning.

export const QUADRANTS = [
  { value: 1, key: 'do',       label: 'Do',       hint: 'urgent & important',     colour: 'var(--sys-green)' },
  { value: 2, key: 'schedule', label: 'Schedule', hint: 'important, not urgent',  colour: 'var(--sys-teal)' },
  { value: 3, key: 'delegate', label: 'Delegate', hint: 'urgent, not important',  colour: 'var(--sys-orange)' },
  { value: 4, key: 'delete',   label: 'Drop',     hint: 'neither',                colour: 'var(--sys-gray)' },
];

/** Anything unset is Schedule - important enough to keep, not on fire. */
export const DEFAULT_QUADRANT = 2;

export function quadrant(value) {
  return QUADRANTS.find(q => q.value === (Number(value) || DEFAULT_QUADRANT)) ?? QUADRANTS[1];
}

export function isUrgent(value) { const v = Number(value) || DEFAULT_QUADRANT; return v === 1 || v === 3; }
export function isImportant(value) { const v = Number(value) || DEFAULT_QUADRANT; return v === 1 || v === 2; }

/**
 * The small 2x2 key shown above the list, so the labels mean something.
 * Laid out the way the matrix is normally drawn: important along the top row,
 * urgent down the left column.
 */
export function matrixKeyHtml() {
  const cell = q => `<div class="mx-cell" style="--q:${q.colour}">
      <span class="mx-label">${q.label}</span>
      <span class="mx-hint">${q.hint}</span>
    </div>`;
  return `<div class="matrix-key">
      <div class="mx-head"><span></span><span>Urgent</span><span>Not urgent</span></div>
      <div class="mx-row">
        <span class="mx-side">Important</span>
        ${cell(QUADRANTS[0])}${cell(QUADRANTS[1])}
      </div>
      <div class="mx-row">
        <span class="mx-side">Not</span>
        ${cell(QUADRANTS[2])}${cell(QUADRANTS[3])}
      </div>
    </div>`;
}
