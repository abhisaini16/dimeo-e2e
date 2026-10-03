# Session Handoff — read this first

Written for: a new Claude Code session picking up this project on a different
machine. If you're Claude reading this cold, read the whole file before doing
anything — it explains decisions that aren't obvious from the code alone.

Last updated: 2026-10-03, ~10:55pm Sydney time, end of a long single session.
Repo is clean, everything described below is committed and pushed to `main`.

## What this repo is

Playwright-based automation that logs into the Dimeo cleaner portal
(`portal.dimeo.com.au`) and checks cleaners in/out for ~27 cleaning sites
around Canberra/NSW, running on GitHub Actions. The repo is **public** (for
unlimited free Actions minutes — see "Decisions already made" below for why
that's safe).

## Current automation status (27 sites total)

### Dedicated workflows (8 sites) — own randomized timing

| Site | Account | Schedule |
|---|---|---|
| Yass-PO | Anshikasaini888@gmail.com | Weekday 5:00-5:15am → checkout +70-90min |
| Cooma-PO | francismarshal1989@gmail.com | Weekday 5:47-6:02am → checkout +60-75min |
| Macquarie-PO | pdolkar9@gmail.com | Weekday 5:30-6:00pm → checkout +75-90min |
| Queenbeyan-PO | tandindorjibhutan12345@gmail.com | Weekday 6:00-6:34pm + Saturday 2:00-3:00pm → checkout +105-120min both |
| Kingston-PO | Wangchukugyen2022@gmail.com | Weekday 5:40-5:56pm + Saturday 5:35-6:00pm → checkout +140-160min both |
| Fyshwick-PO | Wangchukugyen2022@gmail.com | Weekday 9:20-9:30**pm** (crosses midnight) + Saturday 2:14-2:30pm → checkout +140-160min both |
| Belconnen-PO | wangmokardey666@gmail.com | Weekday 10:00-10:28pm (crosses midnight) + Saturday 2:00-3:00pm → checkout +105-120min both |
| Bega-Medical | Dhanesh.7n@gmail.com | Fixed 10:00pm daily (no randomization, own simple trigger) |

All of these: no Sunday shift. Each has `scripts/lib/<site>-schedule.js` (hash-of-date
randomization), `scripts/<site>-decide.js` (gate logic), `scripts/run-<site>-checkin.js`
/ `run-<site>-checkout.js`, and `.github/workflows/<site>-checkin.yml`.

### Sequenced daily batch (7 sites) — `daily-checkin.yml` / `run-checkin-final.js`

Fires once at ~6pm Sydney time daily. Runs in this **exact order**, with a
mandatory **5-minute gap before every single site**, even ones sharing a login
session (verified: 4 login groups, 6 gaps across 7 sites):

Kingston-Gallagher → QBE → PSD-Manuka → PSD-Woden → PSD-Tuggeranong →
PSD-Queenbeyan → Suncorp-Phillip

This was **reverted back to this exact curated list** after an earlier mistake
this session where it got expanded to cover every remaining site — the user
corrected that; **do not re-expand this list** without being told to.

### Left unautomated (12 sites) — manual-only via `.command` files

- **Known Saturday-workers still needing a dedicated workflow** (flagged by
  the user, not yet built — need to ask for their exact check-in windows the
  same way every other site's windows were specified): Greenway-PO
  (chenchopelzom167@gmail.com), Weston-PO (tandindorjibhutan12345@gmail.com),
  City Post / Canberra GPO (kwangdi25@gmail.com).
- **Mon-Fri, genuinely no automation needed beyond what exists**: Bega-PO,
  Merimbula-PO, BMD, Griffith-PO, Jindabyne, Narooma-PO, Mawson-PO,
  Phillip-PO, Mitchell-PO.

## Decisions already made this session (don't re-litigate without reason)

1. **Repo made public** for unlimited free Actions minutes. Verified safe:
   checked full git history, no credentials were ever committed (the real
   secrets file `tests/data/checkin-sites.json` is gitignored and was never
   tracked). Fixed two places that printed account emails into Actions logs
   (`checkin-runner.js`, `run-checkin-final.js`) before flipping to public,
   and deleted the old private-era Actions run history that had the leak.
2. **"Run everything 7 days a week, let the live portal decide" was tried and
   then partially reverted.** The *daily batch* got reverted to its original
   curated 8 (now 7, Bega-Medical moved out). But Yass/Cooma/etc.'s dedicated
   workflows keeping their weekday-only (or weekday+Saturday) gates was kept
   as the right design — don't confuse the two.
3. **A real bug was found and fixed**: `checkin-runner.js`'s page-state guard
   only accepted "Finished" or "Check In" text on a shift page, incorrectly
   rejecting an already-checked-in page (which shows "Check Out" instead) as
   "unexpected" — this blocked every checkout-mode run across every site
   until fixed (commit `df30f94`). Already fixed and verified live.
4. **5-minute inter-site gap**: `runGroup()` in `checkin-runner.js` now takes
   an `interSiteDelayMs` option; `run-checkin-final.js` applies it uniformly
   regardless of account/login-session boundaries, per explicit instruction
   that *every* site needs the gap, not just cross-account ones.

## Known reliability problem: GitHub Actions scheduling is not trustworthy for this

Confirmed **twice** this session, not a one-off:
- Fyshwick's first-ever scheduled checkout fired **4 hours late** (brand-new
  workflow registration delay).
- Two separate live-scheduler tests on an *already-existing, edited* Queenbeyan
  workflow (not brand new) **both failed to fire at all** within generous
  watch windows.

GitHub documents scheduled workflows as best-effort (can be delayed under
load, can be dropped entirely) — this is a structural mismatch for a system
whose entire design depends on firing within a ±20 minute window.

### Migration decision in progress (not yet done)

User is pursuing **two parallel paths**:

1. **Raspberry Pi** (physical hardware, buying tomorrow) — run the exact same
   Node/Playwright scripts unchanged via real OS-level cron/systemd. Lowest
   migration effort, ~$150-250 AUD one-time, near-$0 running cost. Discussed:
   Pi 4 or 5 (4GB), official power supply, USB SSD instead of microSD (more
   reliable for 24/7 writes), case with cooling. Buy from Core Electronics
   (online, Australian, fast to Canberra) or check Jaycar Fyshwick/Belconnen
   in person.
2. **Google Cloud Scheduler + Cloud Run** — more "correct" architecture,
   ~$2-3 AUD/month, genuinely more reliable (dedicated SLA-backed scheduler,
   native `Australia/Sydney` timezone support eliminates the whole
   DST-cron-pair hack this repo currently needs). Real migration effort:
   containerize the code (via `gcloud run deploy --source .` / Cloud Build —
   **no local Docker needed**), one Cloud Run HTTP service, one Cloud
   Scheduler job per site+action (not 2 or 4 like GitHub Actions needs),
   Secret Manager replacing the GitHub secret.

**Blocked mid-setup**: tried `brew install --cask google-cloud-sdk` on the
Mac, failed with `ENOSPC` — the Mac's main data volume
(`/System/Volumes/Data`) is at **434GB/460GB used, only ~500MB free**. Not a
Time Machine snapshot issue (checked, none found). User chose to switch to
their **Lenovo Legion Pro** to continue instead of freeing Mac disk space.

**If continuing the Cloud Scheduler path on a new machine**: nothing has been
created on Google Cloud yet — no account, no project, no billing attached.
Start from scratch: user needs to create a GCP account/project/billing first
(an agent/session can't do that part), then install `gcloud` CLI, then an
agent can take over the containerization/deployment work.

## Things a new session on a different machine will need to redo

- **`gh auth login`** — GitHub CLI auth is per-machine (uses the OS keychain).
  This session's auth (with `repo` + `workflow` scopes) won't exist on a new
  machine. Device-code flow: `gh auth login --hostname github.com
  --git-protocol https --web`, then `gh auth refresh -s workflow` if pushing
  workflow file changes is needed.
- **`tests/data/checkin-sites.json`** — gitignored, never committed, only
  exists locally on the Mac and as the GitHub Actions secret
  `CHECKIN_SITES_JSON`. A fresh clone on a new machine won't have this file.
  It's only needed locally for manual/local test runs; the live GitHub Actions
  workflows read from the secret directly, not from git, so automation is
  unaffected. If local manual runs are needed on the new machine, this file
  needs to be recreated (ask the user, or pull the secret value if they have
  it saved somewhere — GitHub secrets are write-only, can't be read back via
  API/CLI).
- **Google Cloud CLI / account** — nothing set up yet anywhere, see above.

## Quick orientation if you're picking this up cold

- `scripts/lib/checkin-runner.js` — the shared `runGroup()` function every
  single automation calls. Logs in, finds a shift, checks in/out. Read this
  first, it's the one piece of logic everything else depends on.
- `scripts/lib/<site>-schedule.js` — per-site hash-of-today's-date
  randomization, returns `{checkinTarget, checkoutTarget, delayMin, dayType}`
  or `null` if today has no shift for that site.
- `scripts/<site>-decide.js` — runs cheaply in CI before Playwright/npm
  install, decides if this particular cron tick should actually do anything.
- Every dedicated workflow fires **2 cron entries per DST state per
  action** (so weekday-only = 4 total, weekday+Saturday = 8 total) because
  GitHub Actions cron is UTC-only and can't natively express "5am Sydney
  time" across DST changes. This is exactly the complexity Google Cloud
  Scheduler would eliminate (see above).
- `tests/data/sites.json` (tracked in git, not secret) — site
  addresses/coordinates/managers, used for geofencing and address-match
  verification during check-in. Separate from the credentials file.
