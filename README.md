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

### Required: turn email confirmation off

The app signs you in with a **username and a PIN** — there is no mailbox behind
it, so a confirmation email would never arrive and you would never get in.

**Authentication → Sign In / Providers → Email** → turn **"Confirm email"** OFF.

### After your own account exists: shut the door

This is a diary for one person, so once you have created your account, stop
anyone else registering on your project:

**Authentication → Sign In / Providers → Email** → turn **"Allow new users to
sign up"** OFF.

Your account keeps working. Nobody can create a second one. Turn it back on for
a minute if you ever need a second account.

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
   [js/config.js](js/config.js), so it goes straight to the lock screen.
2. **First time only:** tap **New account**, type a username, then your PIN
   twice. That is the whole signup.
3. On any other device: type the same username and PIN once, and that device
   remembers you — after that it is just the PIN.
4. Go to **⚙ Settings**, paste your OpenAI key, and add a **word list**:
   names of people, farms, towns, brands you say often, comma separated.
   This is the single biggest accuracy win for proper nouns and a strong accent.
5. Press the big red button, talk, press it again. The text appears and saves itself.

---

## How the username + PIN login works

You type a name and a PIN. No email, no password, no confirmation link.

Supabase still needs a real account underneath, so the browser builds one for
you. Your PIN and username go through PBKDF2 (300 000 rounds, SHA-256) and come
out as 64 bytes, split in half:

| bytes | becomes |
|---|---|
| 0–31 | base64 → the 44-character password Supabase actually stores |
| 32–63 | an AES-256 key that never leaves the device |

So Supabase never receives your PIN — only a high-entropy string derived from
it. If their database ever leaked, the attacker gets a hash of *that*, not a
hash of a 6-digit number. The account's email is `<username>@dagboek.local`,
a reserved domain that can never route mail anywhere.

The device-side half of the key encrypts your **OpenAI API key** at rest, and
also encrypts a small check-word so a returning PIN can be verified offline —
opening the app on a device you have already used needs no network at all.

Eight wrong tries wipes the local lock and makes you type your name again.
**Your diary is never touched by this** — entries live in Supabase, so a wiped
device loses nothing.

**What a PIN can and cannot do.** Someone who knows your username can try PINs
against the login endpoint. That is slow and rate-limited, but not impossible.
**Use 6 digits rather than 4** — the difference between 10 000 and 1 000 000
guesses, and one extra second for you.

Change it any time under **⚙ Settings → Change PIN**; that updates both halves,
Supabase side and device side.

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
