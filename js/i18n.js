import { settings, saveSettings } from './config.js';

const STRINGS = {
  af: {
    'setup.intro': 'Eerste keer? Plak jou Supabase projek se URL en anon key hier in. Dit word net op hierdie toestel gestoor.',
    'setup.url': 'Supabase projek-URL',
    'setup.anon': 'Supabase anon key',
    'setup.save': 'Stoor en gaan voort',
    'setup.hint': 'Kry dit by supabase.com → jou projek → Settings → API.',

    'auth.intro': 'Net een keer op hierdie toestel. Daarna teken jy met jou PIN aan.',
    'auth.email': 'E-pos',
    'auth.password': 'Wagwoord',
    'auth.signin': 'Teken aan',
    'auth.create': 'Skep my rekening',
    'auth.toCreate': 'Eerste keer? Skep ’n rekening',
    'auth.toSignin': 'Ek het al ’n rekening',
    'auth.magic': 'Stuur eerder ’n skakel per e-pos',
    'auth.sent': 'Kyk in jou e-pos en klik die skakel. Jy kan hierdie bladsy oophou.',
    'auth.created': 'Bevestig jou e-pos, kom dan terug en teken aan.',
    'auth.needBoth': 'Vul jou e-pos en wagwoord in.',
    'auth.shortPw': 'Die wagwoord moet minstens 8 karakters wees.',
    'auth.changeProject': 'Verander Supabase projek',

    'pin.greet': 'Welkom terug, {name}',
    'pin.enter': 'Tik jou PIN',
    'pin.create': 'Kies ’n PIN vir hierdie toestel',
    'pin.confirm': 'Tik die PIN weer',
    'pin.tooShort': 'Ten minste 4 syfers - 6 is veiliger.',
    'pin.mismatch': 'Die twee PINs stem nie ooreen nie. Begin oor.',
    'pin.wrong': 'Verkeerde PIN. Nog {n} probeerslae oor.',
    'pin.locked': 'Te veel verkeerde probeerslae. Teken weer met jou e-pos aan.',
    'pin.forgot': 'PIN vergeet? Teken met e-pos aan',
    'pin.set': 'PIN gestoor',
    'pin.working': 'Besig…',
    'pin.noCrypto': 'Hierdie blaaier kan nie ’n PIN veilig stoor nie. Gebruik https.',

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
    'set.apikeyHint': 'Word met jou PIN geënkripteer en net in hierdie blaaier gestoor - nooit op GitHub of Supabase nie. Kry een by platform.openai.com.',
    'set.model': 'Spraak-model',
    'set.modelHint': 'gpt-4o-transcribe is die akkuraatste met aksente. whisper-1 is die goedkoopste.',
    'set.lang': 'Taal van jou stemnota',
    'set.langHint': 'Los op outo as jy Afrikaans en Engels deurmekaar praat - dit werk die beste vir code-switching.',
    'set.vocab': 'Woordelys',
    'set.vocabHint': 'Name van mense, plekke en woorde wat jy gereeld se, geskei met kommas. Dit help die model baie met jou aksent en eiename.',
    'set.save': 'Stoor instellings',
    'set.saved': 'Gestoor',
    'set.changePin': 'Verander PIN',
    'set.export': 'Laai alles af (JSON)',
    'set.signout': 'Teken uit',
  },

  en: {
    'setup.intro': 'First time? Paste your Supabase project URL and anon key. Stored on this device only.',
    'setup.url': 'Supabase project URL',
    'setup.anon': 'Supabase anon key',
    'setup.save': 'Save and continue',
    'setup.hint': 'Find these at supabase.com → your project → Settings → API.',

    'auth.intro': 'Once on this device only. After that you sign in with your PIN.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.signin': 'Sign in',
    'auth.create': 'Create my account',
    'auth.toCreate': 'First time? Create an account',
    'auth.toSignin': 'I already have an account',
    'auth.magic': 'Email me a link instead',
    'auth.sent': 'Check your email and click the link. You can leave this page open.',
    'auth.created': 'Confirm your email, then come back and sign in.',
    'auth.needBoth': 'Fill in your email and password.',
    'auth.shortPw': 'The password must be at least 8 characters.',
    'auth.changeProject': 'Change Supabase project',

    'pin.greet': 'Welcome back, {name}',
    'pin.enter': 'Enter your PIN',
    'pin.create': 'Choose a PIN for this device',
    'pin.confirm': 'Enter the PIN again',
    'pin.tooShort': 'At least 4 digits - 6 is safer.',
    'pin.mismatch': 'The two PINs do not match. Start again.',
    'pin.wrong': 'Wrong PIN. {n} tries left.',
    'pin.locked': 'Too many wrong tries. Sign in with your email again.',
    'pin.forgot': 'Forgot your PIN? Sign in by email',
    'pin.set': 'PIN saved',
    'pin.working': 'Working…',
    'pin.noCrypto': 'This browser cannot store a PIN safely. Use https.',

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
    'set.apikeyHint': 'Encrypted with your PIN and kept in this browser only - never on GitHub or Supabase. Get one at platform.openai.com.',
    'set.model': 'Speech model',
    'set.modelHint': 'gpt-4o-transcribe is the most accurate with accents. whisper-1 is the cheapest.',
    'set.lang': 'Language of your voice note',
    'set.langHint': 'Leave on auto if you mix Afrikaans and English - that works best for code-switching.',
    'set.vocab': 'Word list',
    'set.vocabHint': 'Names of people, places and words you use often, comma separated. This helps a lot with accents and proper nouns.',
    'set.save': 'Save settings',
    'set.saved': 'Saved',
    'set.changePin': 'Change PIN',
    'set.export': 'Download everything (JSON)',
    'set.signout': 'Sign out',
  },
};

export let lang = settings().lang === 'en' ? 'en' : 'af';

/** t('pin.wrong', { n: 3 }) fills the {n} placeholder. */
export function t(key, vars) {
  const s = STRINGS[lang][key] ?? STRINGS.af[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
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
