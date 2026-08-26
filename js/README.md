# Layout

Three folders, so the two codebases sit side by side and updates stay easy to
apply.

    js/
      app.js        boot, the PIN lock, the tab router. Glue only.
      planner/      your brother's app
      diary/        the diary
      core/         what both of them need

## planner/

`planner.js` is his code - Today, Calendar, Goals, Inbox, the swipe rows, the
sheets, the month grid. Same data shape, same sort rules, same gestures.

Two things differ from his original, and only two:

- **Storage.** His `window.storage.get/set` is not a browser API; on GitHub
  Pages it does not exist, so nothing he saved survived a reload. `tasks.js`
  puts the same array in Supabase instead, diffing so one edit sends one row.
- **Structure.** Split out of the single HTML file into a module.

Strings are plain English inline, exactly as he writes them, so a new version
of his file can be diffed and the changes pasted across with almost no
translation work. See `vendor/planner/README.md` for that routine.

## diary/

Everything he did not write: `diary.js` (the screen), plus `topics.js`,
`quotes.js`, `recorder.js`, `transcribe.js`, `photos.js`, `video.js`,
`exif.js`, `geo.js`.

`transcribe.js` holds an Afrikaans steering prompt. That is deliberate and must
stay Afrikaans - it is what makes the speech-to-text handle Afrikaans and
English mixed in one sentence. The interface is English; the speaker is not.

## core/

`ui.js` - the spring engine, icons, date and time pickers, bottom sheet, toast.
All of it originally his, lifted out because the diary uses it too.
`supa.js`, `config.js`, `crypto.js` - database, device settings, the PIN lock.

## Rules of thumb

- Something only the planner needs goes in `planner/`.
- Something only the diary needs goes in `diary/`.
- Anything both touch goes in `core/` - and think twice, because every item in
  `core/` is one more thing to check when his next version lands.
