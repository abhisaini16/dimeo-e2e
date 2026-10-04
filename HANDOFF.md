# Handoff: how this whole system works (read this first)

For: any new Claude Code session (laptop chat or the Pi-Admin session on the Raspberry Pi) picking this project up cold.
Last updated: 2026-10-05. **Secrets are never in this repo** (public). Logins live in `tests/data/checkin-sites.json`
(gitignored; also Secret Manager `checkin-sites` on Google Cloud) and, for the Command51 bot, `~/command51-scan/accounts.json` on the Pi.

There are THREE separate systems. Don't confuse them.

## 1. Dimeo check-ins: Google Cloud (this repo)
Playwright scripts log in to the Dimeo cleaner portal (`portal.dimeo.com.au`) and check cleaners in/out at 17 dedicated sites plus a daily batch.
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
  Mon-Fri only: yass (5:00-5:15pm), cooma (5:45-6:00pm), macquarie, bega-po, merimbula, griffith, narooma, mawson, phillip, mitchell.
  Weekday + Saturday: queenbeyan, kingston, fyshwick, belconnen, weston, greenway, city-post (Canberra GPO). No Sunday shifts.
  Public holidays are NOT special-cased: the script runs and the portal answers "No active shift today".
- **Clash rules in the planner:** same login never within 10 min of itself (incl. batch/Bega slots); any two actions >= 3 min apart.
- **Telegram:** bot `@Dimeo_checkin_CBR_bot` (token in Secret Manager `telegram-bot-token`, chat id `telegram-chat-id`). Results via `scripts/lib/notify.js`.
  Menu bot (tap a site to check in+out now) = Cloud Function `dimeo-telegram-bot` (`commands/cloud/telegram-bot/`).
- **Budget:** Cloud Billing budget A$20 -> alerts at A$5/10/15/20 to Telegram (function `dimeo-budget-guard`). The A$12 hard cap exists but is OFF
  (`CAP_ENABLED=false`); turning it on needs a billing-admin grant for its service account.
- **GitHub Actions** workflows are manual-only (cron removed). GitHub's scheduler was unreliable.

### Gotchas that already bit us (don't repeat)
- **Never pass JSON as an argument through PowerShell to gcloud** (it strips the double quotes -> HTTP 400). Use `--message-body-from-file`
  (done in `commands/cloud/deploy-scheduler.js`). This silently broke the planner for a night.
- Cloud Tasks task names can't be reused for ~1h after deletion: names include the HHMM (`site-action-date-HHMM`).
- Daylight-saving days: use wall-clock `new Date(y,m,d,h,m,s)` arithmetic, not ms offsets from midnight.
- `pkill -f`/`pgrep -f` patterns that match the ssh command's own text kill the session. Use `[c]laude` style patterns or PIDs.
- Deploy: `gcloud builds submit --tag <image> --region australia-southeast1 .` then `gcloud run jobs update dimeo-checkin --image=<image> --region=...`,
  then `node commands/cloud/deploy-scheduler.js` (creates/updates/prunes Scheduler jobs). On Windows call `gcloud.cmd`.
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
