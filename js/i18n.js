import { settings, saveSettings } from './config.js';

// Every visible string, Afrikaans first. The planner half was written in
// English originally; those lines are translated here rather than left
// half-and-half, so the AF/EN button switches the whole app.

const STRINGS = {
  af: {
    /* ---------- tabs and headers ---------- */
    'tab.today': 'Vandag',
    'tab.calendar': 'Kalender',
    'tab.diary': 'Dagboek',
    'tab.goals': 'Doelwitte',
    'tab.inbox': 'Inbox',
    'sub.goals': 'Dinge met ’n sperdatum',
    'sub.inbox': 'Nog nie geskeduleer nie',

    /* ---------- sections ---------- */
    'sec.ongoing': 'Aan die gang',
    'sec.tasks': 'Take',
    'sec.active': 'Aktief',
    'sec.completed': 'Klaar',
    'sec.unscheduled': 'Ongeskeduleer',

    'empty.today': 'Niks op jou bord vandag nie. Druk + om iets by te voeg.',
    'empty.day': 'Niks beplan nie.',
    'empty.goals': 'Nog geen doelwitte nie — druk + en kies “Doelwit”.',
    'empty.inbox': 'Niks wag nie — vang enigiets hier sonder om te besluit wanneer.',

    /* ---------- tasks ---------- */
    'ctx.all': 'Alles',
    'chip.goal': 'doelwit',
    'swipe.complete': 'Klaar',
    'swipe.delete': 'Vee uit',
    'confirm.tapAgain': 'Druk weer om uit te vee',
    'aria.toggleDone': 'Merk klaar',
    'aria.delete': 'Vee uit',
    'aria.goalDone': 'Merk doelwit klaar',

    'rep.once': 'Een keer',
    'rep.daily': 'daagliks',
    'rep.weekly': 'weekliks',
    'rep.weekdays': 'weeksdae',
    'rep.everyDow': 'elke {dow}',

    'time.today': 'vandag',
    'time.daysAgo': '{n}d gelede',

    'ongoing.meta': 'Begin {started} · laas geraak {touched}',
    'ongoing.log': 'Teken vandag aan',
    'ongoing.finish': 'Klaar',

    /* ---------- goals ---------- */
    'goal.comingUp': 'Doelwitte kom nader',
    'goal.overdue': '{n}d oor tyd',
    'goal.dueToday': 'Vandag due',
    'goal.daysLeft': '{n}d oor',
    'goal.tasksDone': '{done}/{total} take klaar',
    'goal.addTask': '+ Voeg ’n taak hierheen by',
    'goal.taskPh': 'Taak se naam, dan Enter',

    /* ---------- calendar and search ---------- */
    'search.ph': 'Soek take, projekte, doelwitte…',
    'search.results': '{n} resultate vir “{q}”',
    'search.none': 'Niks gevind nie.',
    'kind.task': 'Taak',
    'kind.ongoing': 'Aan die gang',
    'kind.goal': 'Doelwit',
    'meta.noDate': 'Geen datum',
    'meta.finished': 'Klaar',
    'meta.done': 'Klaar',
    'meta.started': 'Begin {d}',
    'meta.due': 'Due {d}',
    'legend.diary': 'Dagboek',
    'day.writeDiary': '✎ Skryf ’n dagboekinskrywing vir hierdie dag',
    'day.openDiary': '✎ Maak hierdie dag se dagboek oop',

    /* ---------- buttons ---------- */
    'btn.close': 'Maak toe',
    'btn.cancel': 'Kanselleer',
    'btn.add': 'Voeg by',
    'btn.save': 'Stoor',
    'btn.delete': 'Vee uit',
    'btn.today': 'Vandag',
    'btn.tomorrow': 'Môre',
    'btn.noDate': 'Geen datum',

    /* ---------- capture sheet ---------- */
    'cap.title': 'Nuwe item',
    'cap.ph': 'Wat moet gedoen word?',
    'cap.where': 'Waar gaan dit heen?',
    'cap.today': '☀️ Vandag',
    'cap.week': '📅 Hierdie week',
    'cap.ongoing': '⚡ Aan die gang',
    'cap.goal': '🚩 Doelwit',
    'cap.inbox': '📥 Inbox',
    'cap.diary': '📔 Dagboek',
    'cap.area': '🏷️',
    'cap.noArea': 'Geen area',
    'cap.repeat': '🔁',
    'cap.addTime': '🕐 Tyd',
    'cap.flag': '🚩 Vlag',
    'cap.ongoingNote': 'Begin vandag. Teken vordering aan vanaf die Vandag-skerm tot jy dit klaar merk.',
    'cap.inboxNote': 'Geen datum — bly in die Inbox tot jy dit skeduleer.',
    'cap.diaryNote': 'Maak vandag se dagboek oop en sit hierdie teks by die gekose onderwerp.',
    'cap.pickFirst': 'Kies eers waarheen dit gaan.',

    /* ---------- editor ---------- */
    'edit.task': 'Wysig taak',
    'edit.goal': 'Wysig doelwit',
    'edit.ongoing': 'Wysig projek',
    'edit.notesPh': 'Meer detail of verduideliking…',
    'edit.deadline': 'Sperdatum',
    'edit.started': 'Begin',
    'edit.touched': 'Laas geraak',
    'edit.date': 'Datum',
    'edit.time': 'Tyd',
    'edit.repeats': 'Herhaal',
    'edit.context': 'Area',
    'edit.flagged': 'Gevlag',

    'planner.saveFail': 'Kon nie nou stoor nie — probeer weer met die volgende verandering.',

    /* ---------- diary ---------- */
    'rec.idle': 'Neem ’n stemnota op',
    'rec.for': 'Opneem vir: {topic}',
    'rec.into': 'Teks gaan na “{topic}”',
    'rec.recording': 'Besig om op te neem…',
    'rec.transcribe': 'Skryf om na teks',
    'rec.discard': 'Gooi weg',
    'rec.working': 'Besig om te luister en te skryf…',
    'rec.noKey': 'Geen OpenAI sleutel nie — sit dit in Instellings.',
    'rec.noMic': 'Kon nie by die mikrofoon kom nie. Gee toestemming in die blaaier.',

    'topic.all': 'Alle onderwerpe',
    'entry.location': 'Plek',
    'entry.getLocation': 'Gebruik my plek',
    'entry.locating': 'Soek jou plek…',
    'entry.locFail': 'Kon nie jou plek kry nie.',
    'entry.tags': 'Etikette',
    'entry.tagPh': 'Tik ’n etiket en druk Enter…',
    'entry.media': 'Fotos en video',
    'entry.addPhotos': '+ Fotos',
    'entry.addVideo': '+ Video',
    'entry.save': 'Stoor inskrywing',
    'entry.saving': 'Besig om te stoor…',
    'entry.saved': 'Gestoor',
    'entry.delete': 'Vee hierdie inskrywing uit',
    'entry.deleteConfirm': 'Vee die hele inskrywing vir hierdie dag uit?',
    'entry.tooBig': 'Te groot ({size}).',
    'entry.wayTooBig': 'Te groot ({size}). Selfs in stukke is dit te veel — hou dit onder 600 MB.',
    'entry.bigVideo': 'Groot video ({size}) — dit word in {n} stukke gestoor en weer heel gemaak wanneer jy dit speel.',
    'entry.uploading': 'Laai op… stuk {i} van {n}',
    'entry.joining': 'Video word saamgevoeg… deel {i} van {n}',
    'entry.noPoster': 'Kon nie ’n voorskou uit die video kry nie — dit werk nog steeds.',

    'list.search': 'Soek in jou dagboek…',
    'list.nothing': 'Niks gevind nie.',

    /* ---------- lock ---------- */
    'pin.greet': 'Welkom terug, {name}',
    'pin.greetNew': 'Kies ’n naam en ’n PIN. Dis al.',
    'pin.firstTime': 'Eerste keer? Druk “Nuwe rekening” hieronder.',
    'pin.namePh': 'Gebruikersnaam',
    'pin.enter': 'Tik jou PIN',
    'pin.create': 'Kies ’n PIN',
    'pin.confirm': 'Tik die PIN weer',
    'pin.signin': 'Tik jou naam en PIN',
    'pin.tooShort': 'Ten minste 4 syfers — 6 is veiliger.',
    'pin.needName': 'Tik ’n gebruikersnaam in.',
    'pin.mismatch': 'Die twee PINs stem nie ooreen nie. Begin oor.',
    'pin.wrong': 'Verkeerde naam of PIN. Nog {n} probeerslae oor.',
    'pin.wrongNet': 'Verkeerde naam of PIN.',
    'pin.noAccount': 'Geen rekening met daardie naam en PIN nie. Druk “Nuwe rekening” hieronder.',
    'pin.locked': 'Te veel verkeerde probeerslae. Begin oor.',
    'pin.taken': 'Daardie naam is reeds gebruik. Kies ’n ander een.',
    'pin.toCreate': 'Nuwe rekening',
    'pin.switchUser': 'Ander naam',
    'pin.set': 'PIN gestoor',
    'pin.working': 'Besig…',
    'pin.signup': 'Besig om jou rekening te skep…',
    'pin.noCrypto': 'Hierdie blaaier kan nie ’n PIN veilig stoor nie. Gebruik https.',
    'pin.signupOff': 'Nuwe rekeninge is afgeskakel in Supabase.',

    /* ---------- settings ---------- */
    'set.title': 'Instellings',
    'set.username': 'Gebruikersnaam',
    'set.usernameHint': 'Jou naam is net ’n etiket — verander dit vrylik. Jou aanmelding, jou PIN en jou data bly presies soos hulle is.',
    'set.rename': 'Verander naam',
    'set.apikey': 'OpenAI sleutel',
    'set.apikeyHint': 'Word met jou PIN geënkripteer en net in hierdie blaaier gestoor — nooit op GitHub of Supabase nie.',
    'set.model': 'Spraak-model',
    'set.lang': 'Taal van stemnota',
    'set.auto': 'Outo (AF + EN)',
    'set.vocab': 'Woordelys',
    'set.vocabHint': 'Name van mense, plekke en woorde wat jy gereeld sê, geskei met kommas. Dit help die model baie met jou aksent en eiename.',
    'set.changePin': 'Verander PIN',
    'set.export': 'Laai alles af',
    'set.signout': 'Teken uit',
    'set.saved': 'Gestoor',

    'rename.same': 'Dis reeds jou naam.',
    'rename.done': 'Naam verander na {name}',
    'rename.taken': 'Daardie naam is reeds gebruik.',
    'rename.failed': 'Kon nie die naam verander nie. ({msg})',
    'rename.needsMigration': 'Loop eers migrasie 004 in Supabase se SQL Editor.',
  },

  en: {
    /* ---------- tabs and headers ---------- */
    'tab.today': 'Today',
    'tab.calendar': 'Calendar',
    'tab.diary': 'Diary',
    'tab.goals': 'Goals',
    'tab.inbox': 'Inbox',
    'sub.goals': 'Things with a deadline',
    'sub.inbox': 'Not scheduled yet',

    /* ---------- sections ---------- */
    'sec.ongoing': 'Ongoing',
    'sec.tasks': 'Tasks',
    'sec.active': 'Active',
    'sec.completed': 'Completed',
    'sec.unscheduled': 'Unscheduled',

    'empty.today': 'Nothing on your plate today. Tap + to add something.',
    'empty.day': 'Nothing planned.',
    'empty.goals': 'No goals yet — tap + and choose “Goal”.',
    'empty.inbox': 'Nothing waiting — capture anything here without deciding when.',

    /* ---------- tasks ---------- */
    'ctx.all': 'All',
    'chip.goal': 'goal',
    'swipe.complete': 'Complete',
    'swipe.delete': 'Delete',
    'confirm.tapAgain': 'Tap again to delete',
    'aria.toggleDone': 'Toggle done',
    'aria.delete': 'Delete',
    'aria.goalDone': 'Mark goal done',

    'rep.once': 'Once',
    'rep.daily': 'daily',
    'rep.weekly': 'weekly',
    'rep.weekdays': 'weekdays',
    'rep.everyDow': 'every {dow}',

    'time.today': 'today',
    'time.daysAgo': '{n}d ago',

    'ongoing.meta': 'Started {started} · last touched {touched}',
    'ongoing.log': 'Log today',
    'ongoing.finish': 'Finish',

    /* ---------- goals ---------- */
    'goal.comingUp': 'Goals coming up',
    'goal.overdue': '{n}d overdue',
    'goal.dueToday': 'Due today',
    'goal.daysLeft': '{n}d left',
    'goal.tasksDone': '{done}/{total} tasks done',
    'goal.addTask': '+ Add a task toward this',
    'goal.taskPh': 'Task title, then Enter',

    /* ---------- calendar and search ---------- */
    'search.ph': 'Search tasks, projects, goals…',
    'search.results': '{n} results for “{q}”',
    'search.none': 'No matches.',
    'kind.task': 'Task',
    'kind.ongoing': 'Ongoing',
    'kind.goal': 'Goal',
    'meta.noDate': 'No date',
    'meta.finished': 'Finished',
    'meta.done': 'Done',
    'meta.started': 'Started {d}',
    'meta.due': 'Due {d}',
    'legend.diary': 'Diary',
    'day.writeDiary': '✎ Write a diary entry for this day',
    'day.openDiary': '✎ Open this day in the diary',

    /* ---------- buttons ---------- */
    'btn.close': 'Close',
    'btn.cancel': 'Cancel',
    'btn.add': 'Add',
    'btn.save': 'Save',
    'btn.delete': 'Delete',
    'btn.today': 'Today',
    'btn.tomorrow': 'Tomorrow',
    'btn.noDate': 'No date',

    /* ---------- capture sheet ---------- */
    'cap.title': 'New item',
    'cap.ph': 'What needs doing?',
    'cap.where': 'Where does this go?',
    'cap.today': '☀️ Today',
    'cap.week': '📅 This week',
    'cap.ongoing': '⚡ Ongoing',
    'cap.goal': '🚩 Goal',
    'cap.inbox': '📥 Inbox',
    'cap.diary': '📔 Diary',
    'cap.area': '🏷️',
    'cap.noArea': 'No area',
    'cap.repeat': '🔁',
    'cap.addTime': '🕐 Time',
    'cap.flag': '🚩 Flag',
    'cap.ongoingNote': 'Starts today. Log progress from the Today screen until you mark it finished.',
    'cap.inboxNote': 'No date — sits in the Inbox until you schedule it.',
    'cap.diaryNote': 'Opens today’s diary and drops this text under the topic you pick.',
    'cap.pickFirst': 'Pick where this goes first.',

    /* ---------- editor ---------- */
    'edit.task': 'Edit task',
    'edit.goal': 'Edit goal',
    'edit.ongoing': 'Edit project',
    'edit.notesPh': 'More detail or explanation…',
    'edit.deadline': 'Deadline',
    'edit.started': 'Started',
    'edit.touched': 'Last touched',
    'edit.date': 'Date',
    'edit.time': 'Time',
    'edit.repeats': 'Repeats',
    'edit.context': 'Area',
    'edit.flagged': 'Flagged',

    'planner.saveFail': 'Could not save just now — will retry on the next change.',

    /* ---------- diary ---------- */
    'rec.idle': 'Record a voice note',
    'rec.for': 'Recording for: {topic}',
    'rec.into': 'Text goes to “{topic}”',
    'rec.recording': 'Recording…',
    'rec.transcribe': 'Turn into text',
    'rec.discard': 'Discard',
    'rec.working': 'Listening and writing…',
    'rec.noKey': 'No OpenAI key yet — add it in Settings.',
    'rec.noMic': 'Could not reach the microphone. Allow it in your browser.',

    'topic.all': 'All topics',
    'entry.location': 'Location',
    'entry.getLocation': 'Use my location',
    'entry.locating': 'Finding your location…',
    'entry.locFail': 'Could not get your location.',
    'entry.tags': 'Tags',
    'entry.tagPh': 'Type a tag and press Enter…',
    'entry.media': 'Photos and video',
    'entry.addPhotos': '+ Photos',
    'entry.addVideo': '+ Video',
    'entry.save': 'Save entry',
    'entry.saving': 'Saving…',
    'entry.saved': 'Saved',
    'entry.delete': 'Delete this entry',
    'entry.deleteConfirm': 'Delete the whole entry for this day?',
    'entry.tooBig': 'Too big ({size}).',
    'entry.wayTooBig': 'Too big ({size}). Even in parts that is too much — keep it under 600 MB.',
    'entry.bigVideo': 'Large video ({size}) — stored in {n} parts and rejoined when you play it.',
    'entry.uploading': 'Uploading… part {i} of {n}',
    'entry.joining': 'Joining video… part {i} of {n}',
    'entry.noPoster': 'Could not get a preview frame from that video — it still works.',

    'list.search': 'Search your diary…',
    'list.nothing': 'Nothing found.',

    /* ---------- lock ---------- */
    'pin.greet': 'Welcome back, {name}',
    'pin.greetNew': 'Pick a name and a PIN. That is all.',
    'pin.firstTime': 'First time? Press “New account” below.',
    'pin.namePh': 'Username',
    'pin.enter': 'Enter your PIN',
    'pin.create': 'Choose a PIN',
    'pin.confirm': 'Enter the PIN again',
    'pin.signin': 'Enter your name and PIN',
    'pin.tooShort': 'At least 4 digits — 6 is safer.',
    'pin.needName': 'Enter a username.',
    'pin.mismatch': 'The two PINs do not match. Start again.',
    'pin.wrong': 'Wrong name or PIN. {n} tries left.',
    'pin.wrongNet': 'Wrong name or PIN.',
    'pin.noAccount': 'No account with that name and PIN. Press “New account” below.',
    'pin.locked': 'Too many wrong tries. Start again.',
    'pin.taken': 'That name is already taken. Pick another.',
    'pin.toCreate': 'New account',
    'pin.switchUser': 'Different name',
    'pin.set': 'PIN saved',
    'pin.working': 'Working…',
    'pin.signup': 'Creating your account…',
    'pin.noCrypto': 'This browser cannot store a PIN safely. Use https.',
    'pin.signupOff': 'New accounts are disabled in Supabase.',

    /* ---------- settings ---------- */
    'set.title': 'Settings',
    'set.username': 'Username',
    'set.usernameHint': 'Your name is just a label — change it freely. Your login, your PIN and your data stay exactly as they are.',
    'set.rename': 'Change name',
    'set.apikey': 'OpenAI key',
    'set.apikeyHint': 'Encrypted with your PIN and kept in this browser only — never on GitHub or Supabase.',
    'set.model': 'Speech model',
    'set.lang': 'Voice note language',
    'set.auto': 'Auto (AF + EN)',
    'set.vocab': 'Word list',
    'set.vocabHint': 'Names of people, places and words you use often, comma separated. This helps a lot with accents and proper nouns.',
    'set.changePin': 'Change PIN',
    'set.export': 'Download everything',
    'set.signout': 'Sign out',
    'set.saved': 'Saved',

    'rename.same': 'That is already your name.',
    'rename.done': 'Name changed to {name}',
    'rename.taken': 'That name is already taken.',
    'rename.failed': 'Could not change the name. ({msg})',
    'rename.needsMigration': 'Run migration 004 in the Supabase SQL editor first.',
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
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}

/** Long date, e.g. "Dinsdag, 18 Augustus 2026". */
export function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(lang === 'af' ? 'af-ZA' : 'en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
