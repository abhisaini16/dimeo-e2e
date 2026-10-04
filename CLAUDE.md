# Project notes for Claude Code

This repo is the Dimeo automation. **Read `HANDOFF.md` first**: it explains the three systems (Dimeo on Google Cloud, Command51 on the Raspberry Pi,
the Pi itself), the schedules, the deployment steps, and the mistakes already made.

Rules:
- Never put passwords, tokens, account emails or `checkin-sites.json` contents into the repo or into chat output (the repo is public).
- After a meaningful change, update `HANDOFF.md` (keep it accurate; it is the only thing a fresh session reads) and commit.
- Verify scheduling changes through the real path (`gcloud scheduler jobs run ...`) before saying they work.
- On Windows use `gcloud.cmd`; never pass JSON through PowerShell as a command-line argument.

## Shared memory (laptop chats + Pi-Admin + any new chat)
`HANDOFF.md` and this file are the ONE shared memory. Two Claude sessions can edit them (the laptop session and Pi-Admin on the Raspberry Pi,
which has a write deploy key for this repo), so:
1. `git pull --rebase` BEFORE you start and again before you edit the docs. Read `HANDOFF.md` first.
2. Keep edits small and focused, commit with a clear message, then `git push` straight away. Never force-push.
3. If a pull/rebase conflicts, keep BOTH sides' facts (merge by hand), never discard the other session's notes.
4. After any meaningful change to the systems, update `HANDOFF.md` in the same commit.
5. Pi-only things (the Command51 bot code, Pi settings) are described in `HANDOFF.md` but their code lives on the Pi; never commit secrets.
