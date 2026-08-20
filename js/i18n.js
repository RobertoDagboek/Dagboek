import { settings, saveSettings } from './config.js';

const STRINGS = {
  af: {
    'setup.intro': 'Eerste keer? Plak jou Supabase projek se URL en anon key hier in. Dit word net op hierdie toestel gestoor.',
    'setup.url': 'Supabase projek-URL',
    'setup.anon': 'Supabase anon key',
    'setup.save': 'Stoor en gaan voort',
    'setup.hint': 'Kry dit by supabase.com → jou projek → Settings → API.',

    'pin.greet': 'Welkom terug, {name}',
    'pin.greetNew': 'Kies ’n naam en ’n PIN. Dis al.',
    'pin.namePh': 'Gebruikersnaam',
    'pin.enter': 'Tik jou PIN',
    'pin.create': 'Kies ’n PIN',
    'pin.confirm': 'Tik die PIN weer',
    'pin.signin': 'Tik jou naam en PIN',
    'pin.tooShort': 'Ten minste 4 syfers - 6 is veiliger.',
    'pin.needName': 'Tik ’n gebruikersnaam in.',
    'pin.mismatch': 'Die twee PINs stem nie ooreen nie. Begin oor.',
    'pin.wrong': 'Verkeerde naam of PIN. Nog {n} probeerslae oor.',
    'pin.wrongNet': 'Verkeerde naam of PIN.',
    'pin.noAccount': 'Geen rekening met daardie naam en PIN nie. Druk “Nuwe rekening” hieronder om een te skep.',
    'pin.firstTime': 'Eerste keer? Druk “Nuwe rekening” hieronder.',
    'pin.locked': 'Te veel verkeerde probeerslae. Begin oor.',
    'pin.taken': 'Daardie naam is reeds gebruik. Kies ’n ander een.',
    'pin.toCreate': 'Nuwe rekening',
    'pin.switchUser': 'Ander naam',
    'pin.set': 'PIN gestoor',
    'pin.working': 'Besig…',
    'pin.signup': 'Besig om jou rekening te skep…',
    'pin.noCrypto': 'Hierdie blaaier kan nie ’n PIN veilig stoor nie. Gebruik https.',
    'pin.signupOff': 'Nuwe rekeninge is afgeskakel in Supabase. Skakel "Allow new users to sign up" aan.',

    'nav.today': 'Vandag',
    'nav.entries': 'Inskrywings',

    'rec.idle': 'Neem ’n stemnota op',
    'rec.for': 'Opneem vir: {topic}',
    'rec.into': 'Teks gaan na “{topic}”',
    'topic.all': 'Alle onderwerpe',
    'entry.joining': 'Video word saamgevoeg… deel {i} van {n}',
    'entry.bigVideo': 'Groot video ({size}) - dit word in {n} stukke gestoor en weer heel gemaak wanneer jy dit speel.',
    'entry.wayTooBig': 'Te groot ({size}). Selfs in stukke is dit te veel - hou dit onder 600 MB.',
    'entry.uploading': 'Laai op… stuk {i} van {n}',
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
    'entry.media': 'Fotos en video',
    'entry.addPhotos': '+ Fotos',
    'entry.addVideo': '+ Video',
    'entry.tags': 'Etikette',
    'entry.tagPh': 'Tik ’n etiket en druk Enter…',
    'entry.tooBig': 'Te groot ({size}). Die maksimum is 50 MB per lêer.',
    'entry.noPoster': 'Kon nie ’n voorskou uit die video kry nie - dit werk nog steeds.',
    'entry.save': 'Stoor inskrywing',
    'entry.delete': 'Vee hierdie inskrywing uit',
    'entry.saved': 'Gestoor',
    'entry.saving': 'Besig om te stoor…',
    'entry.deleteConfirm': 'Vee die hele inskrywing vir hierdie dag uit?',
    'entry.locating': 'Soek jou plek…',
    'entry.locFail': 'Kon nie jou plek kry nie.',

    'list.search': 'Soek in jou dagboek…',
    'list.empty': 'Nog geen inskrywings nie. Begin vanaand met ’n stemnota.',
    'list.nothing': 'Niks gevind nie.',
    'list.noPhoto': 'geen fotos',
    'list.clear': 'Wis filters',
    'list.count': '{n} inskrywings',
    'list.count1': '1 inskrywing',

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

    'pin.greet': 'Welcome back, {name}',
    'pin.greetNew': 'Pick a name and a PIN. That is all.',
    'pin.namePh': 'Username',
    'pin.enter': 'Enter your PIN',
    'pin.create': 'Choose a PIN',
    'pin.confirm': 'Enter the PIN again',
    'pin.signin': 'Enter your name and PIN',
    'pin.tooShort': 'At least 4 digits - 6 is safer.',
    'pin.needName': 'Enter a username.',
    'pin.mismatch': 'The two PINs do not match. Start again.',
    'pin.wrong': 'Wrong name or PIN. {n} tries left.',
    'pin.wrongNet': 'Wrong name or PIN.',
    'pin.noAccount': 'No account with that name and PIN. Press “New account” below to create one.',
    'pin.firstTime': 'First time? Press “New account” below.',
    'pin.locked': 'Too many wrong tries. Start again.',
    'pin.taken': 'That name is already taken. Pick another.',
    'pin.toCreate': 'New account',
    'pin.switchUser': 'Different name',
    'pin.set': 'PIN saved',
    'pin.working': 'Working…',
    'pin.signup': 'Creating your account…',
    'pin.noCrypto': 'This browser cannot store a PIN safely. Use https.',
    'pin.signupOff': 'New accounts are disabled in Supabase. Turn "Allow new users to sign up" back on.',

    'nav.today': 'Today',
    'nav.entries': 'Entries',

    'rec.idle': 'Record a voice note',
    'rec.for': 'Recording for: {topic}',
    'rec.into': 'Text goes to “{topic}”',
    'topic.all': 'All topics',
    'entry.joining': 'Joining video… part {i} of {n}',
    'entry.bigVideo': 'Large video ({size}) - stored in {n} parts and rejoined when you play it.',
    'entry.wayTooBig': 'Too big ({size}). Even in parts that is too much - keep it under 600 MB.',
    'entry.uploading': 'Uploading… part {i} of {n}',
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
    'entry.media': 'Photos and video',
    'entry.addPhotos': '+ Photos',
    'entry.addVideo': '+ Video',
    'entry.tags': 'Tags',
    'entry.tagPh': 'Type a tag and press Enter…',
    'entry.tooBig': 'Too big ({size}). The limit is 50 MB per file.',
    'entry.noPoster': 'Could not get a preview frame from that video - it still works.',
    'entry.save': 'Save entry',
    'entry.delete': 'Delete this entry',
    'entry.saved': 'Saved',
    'entry.saving': 'Saving…',
    'entry.deleteConfirm': 'Delete the whole entry for this day?',
    'entry.locating': 'Finding your location…',
    'entry.locFail': 'Could not get your location.',

    'list.search': 'Search your diary…',
    'list.empty': 'No entries yet. Start tonight with a voice note.',
    'list.nothing': 'Nothing found.',
    'list.noPhoto': 'no photos',
    'list.clear': 'Clear filters',
    'list.count': '{n} entries',
    'list.count1': '1 entry',

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
