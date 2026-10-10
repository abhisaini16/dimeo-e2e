# Handoff: how this whole system works (read this first)

## ✅ DIMEO AUTOMATION RESUMED 2026-10-10 (owner's explicit instruction, after being paused since 2026-10-09)
All 5 Cloud Scheduler jobs + the `dimeo-actions` queue are running again. Image was rebuilt/redeployed first to pick up the
`49af76a` login-success-check fix. **Gotcha found during this resume, read before ever pausing/resuming this queue again:**
resuming a paused Cloud Tasks queue does NOT just re-enable it for new tasks — it immediately fires every task still sitting
in it from before the pause, including ones dated for a day that's now in the past. ~19 stale same-day tasks all fired in
one ~60s burst. Most were harmless no-ops (yesterday's shift already `Finished`), but running ~19 Playwright browsers at once
in the single `dimeo-checkin` container caused real timeouts (`locator.click: Timeout 30000ms exceeded` on the login button)
for several sites that never even reached a login attempt — Weston, Fyshwick, Dickson and Belconnen's checkout all failed this
way. None of them had actually touched the portal (failed before login), so they were safe to just retry individually, one at
a time, straight after — all came back clean (`done`/`checked-in`/correctly `no-shift-today`). **Lesson: before resuming a
paused queue, list its contents first (`gcloud tasks list --queue=dimeo-actions --location=australia-southeast1`) and purge
anything stale, rather than resuming into whatever backlog built up.**

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
    Format (owner asked 2026-10-10): grouped by shared-login nickname, one `site: Xpm in -> Ypm out` line per site, sites
    within a group in chronological order — Shikha (Mitchell/Greenway/Phillip), Aashu (Macquarie/Kingston/Dickson), Aus
    (Griffith/Mawson/Weston), Abhi (Queenbeyan/Fyshwick), Tzangpo (Belconnen, solo), then a separate Canberra GPO section
    (Kinley/Rajat, independent accounts), then "Other sites" for everything else solo, then the daily batch/Bega-Medical
    fixed-time jobs, then a trailing line naming any site with no shift that day. See the grouping logic in `planner.js`'s
    `NOTIFY_ONLY` branch (`GROUP_LABELS`/`GROUP_ORDER`/`CANBERRA_GPO`).
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
- **Dimeo's post-login redirect changed from `/mobile/` to `/mobile/shifts/`** (found 2026-10-10, laptop session,
  via `qbe.command` reporting `LOGIN FAILED` despite Playwright actually landing on a real authenticated "My Cleans"
  page with real shift data — confirmed via a manual debug script before touching the real check, not detection/a
  block, just a URL change). `checkin-runner.js`'s login-success check only matched the exact old path
  (`/\/mobile\/?$/`), so every successful login was being misreported as a failure - this is the ONE shared check
  every site/command file/Cloud Run job goes through, so it broke everything equally. Fixed to `/\/mobile(\/|$)/`
  (accepts `/mobile` itself or any sub-path under it). Verified against both URL shapes plus the real `/login/`
  failure case, then re-ran `qbe.command` live and confirmed a real check-in succeeded end to end.
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
- **There's a separate on-demand tap-to-check-in Telegram bot** (`commands/cloud/telegram-bot/`, Cloud Function
  `dimeo-telegram-bot`, its own webhook/secret, service account `dimeo-bot`) — distinct from the scheduled automation
  above. Shows every site as a numbered/tappable list from its own `sites.json` (id+label only; real login still comes
  from `checkin-sites.json` via `manual-<site-id>` jobs) and triggers an immediate check-in+out through the same
  `dimeo-checkin` Job. **This list does NOT update itself when sites are added/moved/split in `checkin-sites.json`** —
  found stale 2026-10-10 (missing Dickson and Rajat's `city-post-rajat`, added earlier that same day). After any site
  addition/rename, also update `commands/cloud/telegram-bot/sites.json` and redeploy:
  `gcloud functions deploy dimeo-telegram-bot --gen2 --region=australia-southeast1 --runtime=nodejs22 --source=commands/cloud/telegram-bot --entry-point=telegramBot --trigger-http --allow-unauthenticated --service-account=dimeo-bot@cbr-automation-510513.iam.gserviceaccount.com --set-env-vars=GCP_PROJECT=cbr-automation-510513,GCP_REGION=australia-southeast1 --set-secrets=TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,TELEGRAM_CHAT_ID=telegram-chat-id:latest,WEBHOOK_SECRET=telegram-webhook-secret:latest --memory=256Mi --max-instances=2`
  (the webhook URL is stable across redeploys, no need to re-run `setWebhook`). See `deploy.ps1` in that folder for the
  full one-time setup (also creates the webhook secret + service account if missing).

## 2. Command51 QR scans: Google Cloud Run (moved off the Pi 2026-10-10)
**No longer runs on the Pi at all** — migrated to its own repo, `abhisaini16/command51-cloud` (private; site names/job
structure are business-sensitive, unlike this public repo). Same project (`cbr-automation-510513`) and same
Job+Scheduler+Tasks+webhook pattern as Dimeo above. Telegram bot `@Command51_checkin_CBR_bot` (anyone with the link can
use it; tap a site button -> scan recorded) now runs as a **webhook** Cloud Run Service (`command51-bot`), not the Pi's
old long-polling `bot.js` — the Pi had no public address so polling was the only option there; Cloud Run has one, so
webhook is strictly better (no always-on container). The on-screen popup confirmation (`pi-popup/popup.js`) does NOT
carry over — no display in the cloud — scans still get logged and reported to Telegram, just without the local window.
13 sites, 6 auto-scheduled (El Jannah daily 11:01-11:58pm, Next Generation daily 9:00-9:15pm, Lilly Pilly + Monash
Mon-Fri 6:15-7:00pm, Rashays Fri/Sat/Sun 9:00pm-11:58pm, Linen Services Wednesday 5-7pm), rest manual tap-only. Full
architecture, gotchas (Playwright/image version pinning, the `run.invoker` vs `run.developer` vs
`iam.serviceAccountUser` IAM traps, the webhook shared-secret, the Pi's broken IPv6 route to Telegram) are in that
repo's own `README.md` — read it there, don't re-derive from memory. The Pi's old `~/command51-scan/` code is left in
place for reference only; its systemd service (`command51-bot`) is stopped+disabled and must NOT be restarted (Telegram
delivers to only one of polling/webhook at a time, so it would silently receive nothing anyway).

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
- **2026-10-10: the Pi overheated and the owner had to shut it down manually — no alert fired first.** `pi-health.sh` only alerted at
  a hard 80°C, with no earlier warning tier, and (worse) had NO record that survives a reboot: `~/.pi-health.state` just gets
  overwritten each run, and journald here defaults to volatile storage (wiped on every boot) — so by the time the Pi was back up,
  there was zero forensic evidence of what actually happened leading up to the shutdown. Fixed both gaps: added a 70°C "getting
  warm" early-warning tier (alongside the existing 80°C hard alert) in `pi-health.sh`, added an always-append log
  `~/.pi-temp.log` (timestamp + temp + throttle flags, every 5 min, capped at 20k lines) that survives a reboot, and switched
  journald to `Storage=persistent` in `/etc/systemd/journald.conf` so `journalctl -b -1` works after a reboot too. **If this
  happens again, check `~/.pi-temp.log` and `journalctl -b -1` first** instead of concluding there's no evidence.
  Note: the no-battery-clock quirk (see above) also means journald's OWN timestamps for a boot are wrong until NTP catches up —
  `dmesg -T` (not `journalctl -k -b`) gives the corrected/true time for early boot messages.
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
