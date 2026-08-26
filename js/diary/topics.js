// The fixed shape of a day's entry.
//
// Change a label here and it changes everywhere - editor, search filter and
// export - because nothing else hard-codes these strings. Change an `id` and
// you orphan whatever was already written under the old id, so rename labels
// freely but leave ids alone.

export const TOPICS = [
  { id: 'werk', label: 'Work' },
  { id: 'buite', label: 'Outside of work' },
  { id: 'projekte', label: 'What I am working on' },
  { id: 'gevoel', label: 'How I feel' },
  { id: 'gedagtes', label: 'On my mind lately' },
  { id: 'vordering', label: 'Personal progress' },
  { id: 'ander', label: 'Anything else' },
];

export function topicLabel(id) {
  return TOPICS.find(t => t.id === id)?.label ?? id;
}

/** Sections object -> one readable block of text, for export and the old `text` column. */
export function sectionsToText(sections) {
  return TOPICS
    .filter(t => (sections?.[t.id] || '').trim())
    .map(t => `## ${topicLabel(t.id)}\n${sections[t.id].trim()}`)
    .join('\n\n');
}

export function isEmpty(sections) {
  return !TOPICS.some(t => (sections?.[t.id] || '').trim());
}
