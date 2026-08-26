# The planner - original builds

Drop each version your brother sends in here, unchanged, named by version:

    vendor/planner/planner.html        <- the current one
    vendor/planner/planner_next.html   <- the next one, when it arrives

Then extract it so the code can be diffed like normal source:

    node tools/planner-extract.mjs vendor/planner/planner_10.html

## Why bother

The planner was not copied into this app file-for-file. It was split into
modules (`js/planner.js`, `js/ui.js`), its strings were routed through i18n so
the AF/EN button works, and its storage layer was replaced - it used
`window.storage`, which does not exist in a browser, so nothing it saved
survived a reload.

That means a new version from him cannot simply overwrite anything. What we
need instead is a precise list of *what he changed*, which is what these files
give us:

    git diff --no-index \
      vendor/planner/extracted/planner_9 \
      vendor/planner/extracted/planner_10

Without a copy of the previous original sitting here, that diff is impossible
and the only option is re-reading his whole file and guessing what moved.

## What to ask him for

Three habits make this close to free:

1. **Send the whole file**, not snippets or screenshots.
2. **Keep the storage calls where they are** - `loadAll()` and `saveTasks()`.
   He already does this, and it is the single reason the swap to Supabase was
   clean. As long as everything goes through those two, the seam holds.
3. **Keep user-facing text together** if he is willing - a `const STRINGS`
   object at the top rather than English inline in the markup. That is the part
   that costs the most to re-translate on every update.

None of these are required. They just turn an afternoon into ten minutes.
