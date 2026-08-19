# Dagboek

A personal diary web app. Record a short voice note at the end of the day, it turns
into text automatically. Add photos and a location. Everything is yours and private.

- **Speech → text** with OpenAI (`gpt-4o-transcribe`), tuned for **Afrikaans + English
  mixed in the same sentence** and a South African accent.
- **Photos** get resized in the browser before upload, and GPS from the photo's EXIF
  fills in the day's location automatically.
- **Location** from your phone/PC, with a readable place name.
- **AF / EN** toggle for the whole interface.
- Installable on your phone (PWA), works offline for reading.
- **No build step.** Plain HTML + ES modules — push it to GitHub, it runs.

---

## 1. Set up Supabase (5 minutes)

1. Go to [supabase.com](https://supabase.com), sign up (free), create a project.
   Pick a region close to you — `eu-west` or `ap-southeast` are the closest to SA.
2. Open **SQL Editor** → **New query**, paste the whole of
   [supabase/schema.sql](supabase/schema.sql), and click **Run**.
   That creates the tables, the private storage bucket, and the security rules
   that make sure only you can read your own diary.
3. Open **Project Settings → API** and copy two things:
   - **Project URL** (`https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long `eyJ...` string)

The anon key is safe to put in a public repo — the row-level security rules from
step 2 are what protect your data.

### Important: allow your site to sign in

**Authentication → URL Configuration**, set:

- **Site URL**: `https://robertodagboek.github.io/Dagboek/`
- **Redirect URLs**: add
  - `https://robertodagboek.github.io/Dagboek/`
  - `http://localhost:8080/` (only if you ever test on the PC)

If you skip this, the email sign-in link will bounce you to the wrong place.

### After your own account exists: shut the door

This is a diary for one person, so once you have signed up, stop anyone else
being able to register on your project:

**Authentication → Sign In / Providers → Email** → turn **"Allow new users to
sign up"** OFF.

Your account keeps working. Nobody can create a second one. Since RLS already
stops one user reading another's rows this is belt-and-braces, but on a project
with exactly one legitimate user there is no reason to leave signup open.

---

## 2. Get an OpenAI key

1. [platform.openai.com](https://platform.openai.com) → **API keys** → create one.
2. Add a few dollars of credit. Transcription costs roughly **$0.006 per minute**
   with `gpt-4o-mini-transcribe` — a 2-minute note every night is about
   **$0.35 a month**.
3. You paste this key into the app's **Settings** screen. It is stored in your
   browser's localStorage on that device only — it is never sent to GitHub or
   Supabase, and never written into these files.

> Because it lives in the browser, anyone who can use your unlocked device can
> read that key. On a shared PC, rather leave it out and only add it on your phone.

---

## 3. Put it on GitHub

`git` is not installed on this machine yet. Two options:

**Option A — no git needed:**
1. On github.com create a new repository called `dagboek` (public or private —
   GitHub Pages works with private repos on paid plans; use public if you are on
   the free plan, that is fine because no secrets live in these files).
2. Click **Add file → Upload files**, drag in *everything* from this folder
   (including the `js`, `css`, `icons`, `supabase` folders), and commit.

**Option B — with git:** install it from [git-scm.com](https://git-scm.com/download/win), then:

```powershell
git init
git add .
git commit -m "Dagboek"
git branch -M main
git remote add origin https://github.com/<your-username>/dagboek.git
git push -u origin main
```

Then: repo → **Settings → Pages** → *Source: Deploy from a branch* →
Branch `main`, folder `/ (root)` → **Save**.

Your app appears at `https://<your-username>.github.io/dagboek/` after a minute or two.

---

## 4. First run

1. Open the site. The Supabase URL and anon key are already baked into
   [js/config.js](js/config.js), so it goes straight to sign-in.
2. **First time only:** click *First time? Create an account*, enter your email
   and a proper password, confirm the email that arrives, then sign in.
3. **Set a PIN.** This is what you use every day from then on — see below.
4. Go to **⚙ Settings**, paste your OpenAI key, and add a **word list**:
   names of people, farms, towns, brands you say often, comma separated.
   This is the single biggest accuracy win for proper nouns and a strong accent.
5. Press the big red button, talk, press it again. The text appears and saves itself.

---

## How the PIN works

Two different locks, doing two different jobs:

| | |
|---|---|
| **Email + password** | The real account. Proves to Supabase that you are you. Typed **once per device**, then the session refreshes itself indefinitely. |
| **PIN** | The daily lock. Typed every time you open the app. |

The PIN is never stored anywhere, not even as a hash. It is stretched through
PBKDF2 (300 000 rounds, SHA-256) into an AES-256 key, and that key encrypts a
known check-word. Right PIN → the check-word decrypts. Wrong PIN → AES-GCM
refuses outright. That same derived key encrypts your **OpenAI API key** on the
device, so it is no longer sitting in plain text in browser storage.

Eight wrong tries wipes the PIN and the encrypted key from that device and
forces a full email sign-in. **Your diary is never touched by this** — the
entries live in Supabase, so a wiped device loses nothing.

**Be honest about what a PIN can and cannot do.** It stops someone who picks up
your unlocked phone. It does not stop someone who copies this browser's storage
off the device and grinds through the combinations offline — 300 000 rounds
makes that slow, not impossible. **Use 6 digits rather than 4**; it is a
thousand times more work for an attacker and one extra second for you.

Forgot it? *Forgot your PIN? Sign in by email* on the lock screen, or
**⚙ Settings → Change PIN** while you are already in.

---

## Testing on your own PC first

You need a local web server (opening `index.html` directly will not work — ES
modules and the microphone both need `http://localhost`):

```powershell
npx serve -l 8080 .
```

Then open <http://localhost:8080>.

---

## Getting the best results in Afrikaans + English

The app sends a steering prompt with every recording, in
[js/transcribe.js](js/transcribe.js). It tells the model that the speaker is a
South African mixing Afrikaans and English in one sentence, and gives an example
sentence in exactly that style. Two settings matter:

| Setting | Advice |
|---|---|
| **Language** | Leave on **auto**. Forcing `af` or `en` is what breaks code-switching — a forced language makes the model translate the other half instead of writing it down. |
| **Word list** | Add every name you say regularly. This is fed to the model as a hint and fixes most accent-related mis-hearings of proper nouns. |
| **Model** | `gpt-4o-transcribe` is the most accurate on accents. `whisper-1` is cheapest. Try both on the same note and keep what reads better. |

Record somewhere quiet-ish and hold the phone at normal talking distance — the
recorder already uses noise suppression and auto gain.

---

## Where things live

```
index.html            layout of all three screens
css/styles.css        light + dark theme
js/config.js          device settings + the PIN lock and encrypted key storage
js/crypto.js          PBKDF2 + AES-GCM behind the PIN
js/i18n.js            Afrikaans + English interface text
js/supa.js            Supabase client, auth, entries, photos, file storage
js/recorder.js        microphone recording + level meter
js/transcribe.js      OpenAI call and the code-switching steering prompt
js/geo.js             GPS + place name lookup
js/exif.js            reads GPS and capture date out of photos
js/photos.js          downscale and re-encode before upload
js/app.js             glue: screens, saving, rendering
supabase/schema.sql   database tables, security rules, storage bucket
sw.js                 offline cache
```

## Costs

| | |
|---|---|
| GitHub Pages | free |
| Supabase free tier | 500MB database, 1GB file storage, plenty for years of a diary |
| OpenAI transcription | ~$0.006/minute (~R0.11) |
| Place-name lookup | free, no key |
