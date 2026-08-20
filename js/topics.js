// The fixed shape of a day's entry.
//
// Change a label here and it changes everywhere - editor, search filter and
// export - because nothing else hard-codes these strings. Change an `id` and
// you orphan whatever was already written under the old id, so rename labels
// freely but leave ids alone.

export const TOPICS = [
  { id: 'werk',      af: 'Werk',                  en: 'Work' },
  { id: 'buite',     af: 'Buite werk',            en: 'Outside of work' },
  { id: 'projekte',  af: 'Waaraan ek werk',       en: 'What I am working on' },
  { id: 'gevoel',    af: 'Hoe ek voel',           en: 'How I feel' },
  { id: 'gedagtes',  af: 'Wat ek deesdae dink',   en: 'On my mind lately' },
  { id: 'vordering', af: 'Persoonlike vordering', en: 'Personal progress' },
  { id: 'ander',     af: 'Ander',                 en: 'Anything else' },
];

export function topicLabel(id, lang) {
  const topic = TOPICS.find(t => t.id === id);
  if (!topic) return id;
  return lang === 'en' ? topic.en : topic.af;
}

/** Sections object -> one readable block of text, for export and the old `text` column. */
export function sectionsToText(sections, lang) {
  return TOPICS
    .filter(t => (sections?.[t.id] || '').trim())
    .map(t => `## ${topicLabel(t.id, lang)}\n${sections[t.id].trim()}`)
    .join('\n\n');
}

export function isEmpty(sections) {
  return !TOPICS.some(t => (sections?.[t.id] || '').trim());
}
