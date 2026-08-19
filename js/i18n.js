import { settings, saveSettings } from './config.js';

const STRINGS = {
  af: {
    'setup.intro': 'Eerste keer? Plak jou Supabase projek se URL en anon key hier in. Dit word net op hierdie toestel gestoor.',
    'setup.url': 'Supabase projek-URL',
    'setup.anon': 'Supabase anon key',
    'setup.save': 'Stoor en gaan voort',
    'setup.hint': 'Kry dit by supabase.com → jou projek → Settings → API.',

    'auth.intro': 'Tik jou e-pos in. Ons stuur ’n aanmeld-skakel - geen wagwoord nodig nie.',
    'auth.email': 'E-pos',
    'auth.send': 'Stuur aanmeld-skakel',
    'auth.sent': 'Kyk in jou e-pos en klik die skakel. Jy kan hierdie bladsy oophou.',
    'auth.changeProject': 'Verander Supabase projek',

    'nav.today': 'Vandag',
    'nav.entries': 'Inskrywings',

    'rec.idle': 'Neem ’n stemnota op',
    'rec.recording': 'Besig om op te neem…',
    'rec.done': 'Opname klaar',
    'rec.transcribe': 'Skryf om na teks',
    'rec.discard': 'Gooi opname weg',
    'rec.working': 'Besig om te luister en te skryf…',
    'rec.noKey': 'Geen OpenAI sleutel nie - sit dit in Instellings.',
    'rec.noMic': 'Kon nie by die mikrofoon kom nie. Gee toestemming in die blaaier.',

    'entry.text': 'Inskrywing',
    'entry.location': 'Plek',
    'entry.getLocation': 'Gebruik my plek',
    'entry.photos': 'Fotos',
    'entry.addPhotos': '+ Voeg fotos by',
    'entry.save': 'Stoor inskrywing',
    'entry.delete': 'Vee hierdie inskrywing uit',
    'entry.saved': 'Gestoor',
    'entry.saving': 'Besig om te stoor…',
    'entry.deleteConfirm': 'Vee die hele inskrywing vir hierdie dag uit?',
    'entry.locating': 'Soek jou plek…',
    'entry.locFail': 'Kon nie jou plek kry nie.',

    'list.search': 'Soek in jou dagboek…',
    'list.empty': 'Nog geen inskrywings nie. Begin vanaand met ’n stemnota.',
    'list.noPhoto': 'geen fotos',

    'set.apikey': 'OpenAI API sleutel',
    'set.apikeyHint': 'Word net in hierdie blaaier gestoor, nooit op GitHub of Supabase nie. Kry een by platform.openai.com.',
    'set.model': 'Spraak-model',
    'set.modelHint': 'gpt-4o-transcribe is die akkuraatste met aksente. whisper-1 is die goedkoopste.',
    'set.lang': 'Taal van jou stemnota',
    'set.langHint': 'Los op outo as jy Afrikaans en Engels deurmekaar praat - dit werk die beste vir code-switching.',
    'set.vocab': 'Woordelys',
    'set.vocabHint': 'Name van mense, plekke en woorde wat jy gereeld se, geskei met kommas. Dit help die model baie met jou aksent en eiename.',
    'set.save': 'Stoor instellings',
    'set.saved': 'Gestoor',
    'set.export': 'Laai alles af (JSON)',
    'set.signout': 'Teken uit',
  },

  en: {
    'setup.intro': 'First time? Paste your Supabase project URL and anon key. Stored on this device only.',
    'setup.url': 'Supabase project URL',
    'setup.anon': 'Supabase anon key',
    'setup.save': 'Save and continue',
    'setup.hint': 'Find these at supabase.com → your project → Settings → API.',

    'auth.intro': 'Enter your email. We send a sign-in link - no password needed.',
    'auth.email': 'Email',
    'auth.send': 'Send sign-in link',
    'auth.sent': 'Check your email and click the link. You can leave this page open.',
    'auth.changeProject': 'Change Supabase project',

    'nav.today': 'Today',
    'nav.entries': 'Entries',

    'rec.idle': 'Record a voice note',
    'rec.recording': 'Recording…',
    'rec.done': 'Recording ready',
    'rec.transcribe': 'Turn into text',
    'rec.discard': 'Discard recording',
    'rec.working': 'Listening and writing…',
    'rec.noKey': 'No OpenAI key yet - add it in Settings.',
    'rec.noMic': 'Could not reach the microphone. Allow it in your browser.',

    'entry.text': 'Entry',
    'entry.location': 'Location',
    'entry.getLocation': 'Use my location',
    'entry.photos': 'Photos',
    'entry.addPhotos': '+ Add photos',
    'entry.save': 'Save entry',
    'entry.delete': 'Delete this entry',
    'entry.saved': 'Saved',
    'entry.saving': 'Saving…',
    'entry.deleteConfirm': 'Delete the whole entry for this day?',
    'entry.locating': 'Finding your location…',
    'entry.locFail': 'Could not get your location.',

    'list.search': 'Search your diary…',
    'list.empty': 'No entries yet. Start tonight with a voice note.',
    'list.noPhoto': 'no photos',

    'set.apikey': 'OpenAI API key',
    'set.apikeyHint': 'Stored in this browser only, never on GitHub or Supabase. Get one at platform.openai.com.',
    'set.model': 'Speech model',
    'set.modelHint': 'gpt-4o-transcribe is the most accurate with accents. whisper-1 is the cheapest.',
    'set.lang': 'Language of your voice note',
    'set.langHint': 'Leave on auto if you mix Afrikaans and English - that works best for code-switching.',
    'set.vocab': 'Word list',
    'set.vocabHint': 'Names of people, places and words you use often, comma separated. This helps a lot with accents and proper nouns.',
    'set.save': 'Save settings',
    'set.saved': 'Saved',
    'set.export': 'Download everything (JSON)',
    'set.signout': 'Sign out',
  },
};

export let lang = settings().lang === 'en' ? 'en' : 'af';

export function t(key) {
  return STRINGS[lang][key] ?? STRINGS.af[key] ?? key;
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'af';
  saveSettings({ lang });
  document.documentElement.lang = lang;
  applyI18n();
}

export function toggleLang() {
  setLang(lang === 'af' ? 'en' : 'af');
  return lang;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  const btn = document.getElementById('lang-toggle');
  if (btn) btn.textContent = lang.toUpperCase();
}

/** Locale-aware long date, e.g. "Dinsdag, 18 Augustus 2026". */
export function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(lang === 'af' ? 'af-ZA' : 'en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
