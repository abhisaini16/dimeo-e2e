# Handoff: how this whole system works (read this first)

## ⚠️ DIMEO AUTOMATION IS CURRENTLY PAUSED (since 2026-10-09, owner's explicit instruction: "Stop the auto bot DIMEO... no more auto
check in and out"). All 5 Cloud Scheduler jobs (`dimeo-planner`, `dimeo-planner-retry`, `dimeo-plan-message`, `dimeo-daily-batch`,
`dimeo-bega-medical`) are PAUSED, and the `dimeo-actions` Cloud Tasks queue is PAUSED too (so even already-queued same-day tasks
won't fire). Nothing was deleted — this is fully reversible. **Do not resume it without the owner asking.** To resume: `gcloud
scheduler jobs resume <job> --location=australia-southeast1` for each of the 5, then `gcloud tasks queues resume dimeo-actions
--location=australia-southeast1`.

For: any new Claude Code session (laptop chat or the Pi-Admin session on the Raspberry Pi) picking this project up cold.
Last updated: 2026-10-05. **Secrets are never in this repo** (public). Logins live in `tests/data/checkin-sites.json`
(gitignored; also Secret Manager `checkin-sites` on Google Cloud) and, for the Command51 bot, `~/command51-scan/accounts.json` on the Pi.

There are THREE separate systems. Don't confuse them.

## 1. Dimeo check-ins: Google Cloud (this repo)
Playwright scripts log in to the Dimeo cleaner portal (`portal.dimeo.com.au`) and check cleaners in/out at 19 dedicated sites plus a daily batch
(Canberra-GPO counts as one site but has two independent accounts/people checking in — see below).
- **Where it runs:** Google Cloud project `cbr-automation-510513`, region `australia-southeast1`. One Cloud Run Job `dimeo-checkin`
  (image `.../dimeo/checkin:latest`, built from the root `Dockerfile`; it copies `scripts/` and `commands/cloud/`).
- **Scheduling (Cloud Scheduler, Australia/Sydney, so no DST hacks):**
  - `dimeo-planner` 00:05 daily and `dimeo-planner-retry` 03:00: `commands/cloud/planner.js` computes today's random times and creates one
    Cloud Task per check-in/check-out in queue `dimeo-actions`; each task starts the job `now-<site>-<action>` 45s early. Silent unless it fails.
  - `dimeo-plan-message` **7:00am daily**: sends the day's plan to Telegram (12-hour clock, includes the 6pm batch and Bega-Medical).
  - `dimeo-daily-batch` 6:00pm Mon-Fri (`scripts/run-checkin-final.js`): sites in order with a 5-min gap; PSD sites Mon/Wed/Fri only;
    Kingston-Gallagher, QBE, Suncorp-Phillip are check-in only; PSD-Manuka is held until 6:45pm (shares a login with Griffith).
  - `dimeo-bega-medical` 10:00pm Mon-Fri, check-in only.
- **Per-site windows** are in `scripts/lib/<site>-schedule.js` (deterministic hash of the date). Check-in windows are 10-15 min wide on 5-minute marks.
  Mon-Fri only: yass (5:00-5:15pm), cooma (5:45-6:00pm), macquarie, bega-po, merimbula, griffith, narooma, mawson, phillip, mitchell, dickson (6:00-6:10pm).
  Weekday + Saturday: queenbeyan, kingston, fyshwick, belconnen (6:15-6:30pm, same window both day-types since 2026-10-08), weston, greenway.
  No Sunday shifts.
  **Canberra GPO has two people, two separate site IDs, same physical site:** `city-post` (Kinley, existing) and `city-post-rajat`
  (Rajat, added 2026-10-08, `rajatahuja57@gmail.com`). Both check in independently 6:15-6:30pm, check out ~2.5-2.75h later — different
  schedule-lib hash salts (`lib/city-post-schedule.js` / `lib/city-post-rajat-schedule.js`) keep their random times from landing on the
  same minute. They are NOT a shared login (two different accounts), so none of the `RANDOM_GAP_ACCOUNTS`/`sequenceAccountBlocks()`
  machinery applies — only the default 3-min `GLOBAL_GAP` keeps them from colliding, same as any two unrelated actions.
  Public holidays are NOT special-cased: the script runs and the portal answers "No active shift today".
- **Clash rules in the planner:** same login never within 10 min of itself (incl. batch/Bega slots); any two actions >= 3 min apart.
  **Five shared-login groups get a wider, randomised 25-37 min gap instead** (`RANDOM_GAP_ACCOUNTS`/`accountGap()` in `planner.js`, owner's
  request 2026-10-08, superseding an earlier flat 20-min version the same day): `sainishikha005@gmail.com` (Mitchell/Greenway/Phillip),
  `aashuahlawat2@gmail.com` (Kingston/Macquarie/Dickson), `aus362@gmail.com` (Weston/Mawson/Griffith), `abhiaus980@gmail.com`
  (Fyshwick/Queenbeyan), `tzangpo363@gmail.com` (Belconnen, currently solo). The 25-37 value is picked deterministically per
  (date, account, site, action) via a hash, same pattern as the per-site schedule libs, so it varies day to day and action to action
  without being literally random (re-running the planner the same day is still idempotent). Everyone else keeps the default 10 min.
  `resolve()` enforces the gap between every pair of same-account actions regardless of action type, which is a superset of "N min after
  a checkout before the next site's check-in." Planner clash-resolution spaces each group automatically on *future* days — verified with
  `--dry` and a real `dimeo-planner` trigger each time this changed.

  **A plain pairwise gap is NOT enough — whole sessions must not overlap either (fixed 2026-10-08).** Owner caught a real case: Greenway
  (Shikha login) was checked in 7:48-8:51pm, but Phillip (same login) checked in at 8:20pm — 32 min after Greenway's *checkin*, which
  satisfied the pairwise gap, but Phillip's session started while Greenway's was still open. `sequenceAccountBlocks()` now orders each
  `RANDOM_GAP_ACCOUNTS` login's sites by original checkin time and pushes each one's whole checkin->checkout session forward (as a
  unit, preserving its own duration) until it starts at or after the previous site's checkout + the 25-37 min gap. Runs before the
  generic `resolve()` pass, which still handles cross-account/global spacing on top. Verified with `--dry` for a weekday and Saturday:
  every site's session now starts strictly after the previous same-login site's session ends.

  **Gotcha: fixing TODAY's queue after a login or gap-rule change is genuinely hard — don't do it ad hoc.** Changing a login or the gap
  rule mid-day does NOT fix tasks already queued by the morning's planner run; those are frozen at creation. The safe procedure, learned
  the hard way on 2026-10-08:
  1. Deploy the code/credential change first (rebuild+redeploy if `planner.js` changed; just a new Secret Manager version if only
     `checkin-sites.json` changed).
  2. Compute the exact CORRECT plan for today: patch the `if (DRY) { lines.push(...) }` line in a scratch copy of `planner.js` to print
     `${e.site}-${e.action}-${e.dateKey...}-${hhmm(e.time)}` (the literal task name), then run `node cloud/planner.js --dry --date=<today>`
     from a directory laid out like the container (`scripts/`, `cloud/`, `tests/` as siblings — a plain `cd commands/cloud && node planner.js`
     breaks its relative requires).
  3. List the real queue (`gcloud tasks list --queue=dimeo-actions --location=australia-southeast1`) and diff the two **exact name** lists
     (`comm -23`/`comm -13` on sorted files) — don't eyeball it or compare by clock time, the margin for a transcription slip is too high
     once more than 2-3 sites are affected.
  4. Delete every real task that ISN'T in the expected list (stale/duplicate). Leave everything that already matches exactly alone.
  5. Re-trigger `gcloud scheduler jobs run dimeo-planner --location=australia-southeast1` once, then re-list and diff again — a single
     retrigger can still cascade a shift onto an untouched site (see below), so always re-verify, don't assume one pass is enough.
  **Why ad hoc fixes fail:** `resolve()` recomputes the WHOLE day from scratch every run, so widening one gap can shift a DIFFERENT site's
  placement too (even one you didn't touch) via the chained push-forward logic — and since that other site's old task was never deleted,
  you get a stale duplicate you didn't expect. This compounded across several re-triggers on 2026-10-08 into ~15 stray duplicate tasks
  across unrelated sites (yass, cooma, city-post, queenbeyan, griffith) that only a full name-exact diff caught.
  **Gotcha: a "✅ already exists" (409) from `enqueue()` can actually mean "rejected — name reuse blocked", not "correctly scheduled".**
  Cloud Tasks won't reuse a task name for ~1h after it was deleted, and that rejection ALSO surfaces as HTTP 409 — indistinguishable in
  the code from a real duplicate. If a fresh computation happens to reuse a name you deleted earlier the same session (plausible: the
  randomised gap can land back on a value you'd already tried), the planner logs `☑️` (looks fine) but **nothing is actually scheduled**.
  Caught this 2026-10-08 only via the exact-name diff above (two tasks silently missing from the real queue despite a clean-looking
  planner run; then FIVE more on a second round of the same fix-cycle a bit later the same day, as yet more recomputed names landed back
  on ones deleted earlier). **This will keep happening within any ~1h window where you repeatedly delete+recompute the same site's
  tasks** — budget for a second verification pass, not just one. Fix: create that one task manually with a different name, same payload:
  `gcloud tasks create-http-task <site>-<action>-<dateKey>-<hhmm>-b --queue=dimeo-actions --location=australia-southeast1 --url="https://run.googleapis.com/v2/projects/cbr-automation-510513/locations/australia-southeast1/jobs/dimeo-checkin:run" --method=POST --header="Content-Type: application/json" --body-content='{"overrides":{"containerOverrides":[{"args":["now-<site>-<action>"]}]}}' --oauth-service-account-email=dimeo-scheduler@cbr-automation-510513.iam.gserviceaccount.com --schedule-time=<ISO time, resolved time minus 45s>`
  (if `-b` is ALSO blocked because it too was tried earlier, use `-b2`, etc.). After creating manually, re-run the exact-name diff
  (ignoring any `-b`/`-b2` suffix) to confirm every expected site+action+time actually exists under some name.
- **Telegram:** bot `@Dimeo_checkin_CBR_bot` (token in Secret Manager `telegram-bot-token`, chat id `telegram-chat-id`). Results via `scripts/lib/notify.js`.
  Menu bot (tap a site to check in+out now) = Cloud Function `dimeo-telegram-bot` (`commands/cloud/telegram-bot/`).
- **Budget:** Cloud Billing budget A$20 -> alerts at A$5/10/15/20 to Telegram (function `dimeo-budget-guard`). The A$12 hard cap exists but is OFF
  (`CAP_ENABLED=false`); turning it on needs a billing-admin grant for its service account.
- **GitHub Actions** workflows are manual-only (cron removed). GitHub's scheduler was unreliable.

### Gotchas that already bit us (don't repeat)
- **`abhiaus980@gmail.com`'s real Dimeo password is `Abhi@0010`, NOT `Abhisaini@0010`.** When this email was assigned to Fyshwick+Queenbeyan
  on 2026-10-08, the owner pasted the wrong password (mixing it up with the other new accounts, which genuinely do use `Abhisaini@0010`).
  Both sites' check-ins silently failed for hours (`LOGIN FAILED ... /login/password/` — the portal rejects the password and bounces back
  to the same page, no exception thrown) until caught via a login retest and fixed. If a login-group fails consistently right after being
  set up, retest with a plain `gcloud run jobs execute ... --args="now-<site>-<action>" --wait` for a second site on the same login before
  assuming it's a one-off glitch — a `LOGIN FAILED` on two different sites under one login means the password itself is wrong, not the site.
- **Never pass JSON as an argument through PowerShell to gcloud** (it strips the double quotes -> HTTP 400). Use `--message-body-from-file`
  (done in `commands/cloud/deploy-scheduler.js`). This silently broke the planner for a night.
- Cloud Tasks task names can't be reused for ~1h after deletion: names include the HHMM (`site-action-date-HHMM`).
- Daylight-saving days: use wall-clock `new Date(y,m,d,h,m,s)` arithmetic, not ms offsets from midnight.
- `pkill -f`/`pgrep -f` patterns that match the ssh command's own text kill the session. Use `[c]laude` style patterns or PIDs.
- Deploy: `gcloud builds submit --tag <image> --region australia-southeast1 .` then `gcloud run jobs update dimeo-checkin --image=<image> --region=...`,
  then `node commands/cloud/deploy-scheduler.js` (creates/updates/prunes Scheduler jobs). On Windows call `gcloud.cmd`.
- **`tests/data/sites.json` edits need a rebuild+redeploy, not just a git push.** It's `COPY`'d into the Docker image at build time
  (Dockerfile), unlike `tests/data/checkin-sites.json` which is pulled from Secret Manager `checkin-sites` fresh at container
  start (that one *does* update live just by pushing a new secret version — the job mounts `latest`). Bit us 2026-10-05/06:
  fixed Griffith-PO's wrong address in git, but the running job kept failing on the stale baked-in address until the image
  was rebuilt. Also: a site's shift-list status label (e.g. "Checked in") is not reliable live state — trust the script's
  actual check-in/check-out result, not the card label.
- Verify a change by triggering the real path: `gcloud scheduler jobs run dimeo-planner --location=australia-southeast1`, then list the tasks.

## 2. Command51 QR scans: Raspberry Pi (code lives ONLY on the Pi, not in git)
`~/command51-scan/` on the Pi: Telegram bot `@Command51_checkin_CBR_bot` (anyone with the link can use it; tap a site button -> scan recorded, popup on the Pi screen,
audit log `~/pi-popup/activity.log`). 13 sites (jobs in `jobs.json`, per-site logins in `accounts.json`, chmod 600). Daily planner
(`planner.js`, `schedule.json`): El Jannah daily 11:01-11:58pm, Next Generation daily 9:00-9:15pm, Lilly Pilly + Lilly Pilly Monash Mon-Fri 6:15-7:00pm,
Rashays Fri/Sat/Sun 9:00pm-11:58pm, Linen Services Wednesday 5-7pm. Plan sent to Telegram at 7am. The planner checks the real clock every 20s
(the Pi has no battery clock; after a reboot it waits for NTP). Service: `systemctl --user status command51-bot`.

## 3. The Raspberry Pi 5 itself
Hostname `cbr-pi`, user `cbr-pi`, Debian 13, Sydney time, microSD, Wi-Fi. Passwordless sudo is ON (owner's choice).
- **Remote access:** `ssh pi` from the owner's laptop works from any network (Tailscale; Tailscale IP is in `~/.ssh/config`). Screen: Raspberry Pi Connect
  (connect.raspberrypi.com -> cbr-pi -> Screen sharing / Remote shell). A forced virtual display (`video=HDMI-A-2:1920x1080@60D` in `/boot/firmware/cmdline.txt`) keeps the desktop alive with no monitor.
- **Pi-Admin:** an always-on Claude Code session (systemd user service `claude-pi-admin`, tmux socket `claude`, folder `~/pi-admin`, full authority, no prompts,
  continues the last conversation on restart). Visible in the Claude mobile app as "Pi-Admin". Notes it must keep: `~/pi-admin/context/{STATE.md,LOG.md,history/}`.
- **Pi-Admin link after a reboot:** a resumed session (`--continue`) can lose its Remote Control link ("Remote Control disconnected"). `~/bin/claude-rc-watch.sh`
  (started by the service) opens the live `/remote-control` menu ~25s after start and re-enables it, then sends the link to Telegram. Don't judge state from
  tmux scrollback: a resumed chat replays old lines (including old "remote-control is active"). The live menu is the only trustworthy signal.
- **Google Cloud access from the Pi (so Pi-Admin can maintain the Dimeo cloud side too):** `gcloud` is installed and signed in as the service account
  `pi-admin-deployer@cbr-automation-510513.iam.gserviceaccount.com` (key file `~/.config/gcloud-keys/pi-admin-deployer.json`, chmod 600). On the owner's explicit
  instruction (2026-10-05) it holds **roles/owner on the project** plus Secret Manager admin, on top of Cloud Build / Run / Scheduler / Tasks / Artifact Registry roles.
  That means it can change IAM, read and write every secret, delete resources and unlink billing: treat it with care, back up before destructive changes, and ask the owner
  before anything that spends money, touches billing, or changes who has access. Revoke by deleting the key or the account in Google Cloud IAM.
  `~/dimeo-e2e/tests/data/checkin-sites.json` on the Pi is the pulled credentials file (gitignored, chmod 600; refresh from Secret Manager `checkin-sites`).
  gcloud is slow on the Pi (several seconds per call): run long sequences in the background writing to a file, since SSH can drop mid-command.
- **Pi notifications** use a separate bot `@piadmin_cbr_bot` (online-after-boot message, Pi-Admin link, problem/resolved alerts every 5 min via `pi-health.timer`).
- The Dimeo repo is also cloned at `~/dimeo-e2e` (`git pull` to get the latest of this file).
- **GitHub access from the Pi:** deploy key `~/.ssh/github_dimeo` (read-write, this repo only; GitHub shows it as "Pi-Admin (cbr-pi)"), remote is SSH.
  Pi-Admin and the laptop session share this repo as their memory (rules in `CLAUDE.md`). The laptop has `gh` logged in as the repo owner (revoke at github.com/settings/applications).

## Owner preferences
- Telegram times in the normal 12-hour clock. Pi screen = Raspberry Pi Connect, always. Command51 bot is for its own operations only; Pi things use the Pi-Admin bot.
- Jindabyne and BMD are out of scope. Change the weak passwords is an OPEN item (they were shared in chat); A$12 hard cap is still off.

## Open items
- Watch the first full day of real runs (first real scheduled check-in: 2026-10-05 ~5:01pm). No automatic retry exists for Dimeo check-ins yet.
- Back up the Pi-only code (`~/command51-scan`, `~/pi-popup`) to a private repo; nothing of it is in git.
- Disable Tailscale key expiry for the Pi (admin console), turn on 2-step verification on Tailscale/Claude/Raspberry Pi accounts.
