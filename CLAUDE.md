# Project notes for Claude Code

This repo is the Dimeo automation. **Read `HANDOFF.md` first**: it explains the three systems (Dimeo on Google Cloud, Command51 on the Raspberry Pi,
the Pi itself), the schedules, the deployment steps, and the mistakes already made.

Rules:
- Never put passwords, tokens, account emails or `checkin-sites.json` contents into the repo or into chat output (the repo is public).
- After a meaningful change, update `HANDOFF.md` (keep it accurate; it is the only thing a fresh session reads) and commit.
- Verify scheduling changes through the real path (`gcloud scheduler jobs run ...`) before saying they work.
- On Windows use `gcloud.cmd`; never pass JSON through PowerShell as a command-line argument.
