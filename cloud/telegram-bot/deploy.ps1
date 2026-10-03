# One-time setup for the Telegram check-in menu bot. Run from the repo root in PowerShell:
#   powershell -ExecutionPolicy Bypass -File cloud/telegram-bot/deploy.ps1
# Creates the webhook secret + a dedicated service account, grants it the minimum it needs
# (read the 3 Telegram secrets, start Cloud Run Job executions), deploys the function,
# and points the bot's webhook at it. Safe to re-run.
$ErrorActionPreference = 'Continue'
$P = 'cbr-automation-510513'; $R = 'australia-southeast1'
$SA = "dimeo-bot@$P.iam.gserviceaccount.com"

# 1. Random webhook secret (Telegram sends it back on every call so strangers can't post here).
if (-not (gcloud.cmd secrets describe telegram-webhook-secret --project=$P 2>$null)) {
  $f = New-TemporaryFile
  node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" | Out-File -NoNewline -Encoding ascii $f
  gcloud.cmd secrets create telegram-webhook-secret "--data-file=$f" --project=$P
  Remove-Item $f
}

# 2. Service account + least-privilege grants.
gcloud.cmd iam service-accounts create dimeo-bot --display-name=DimeoTelegramBot --project=$P
foreach ($s in 'telegram-bot-token','telegram-chat-id','telegram-webhook-secret') {
  gcloud.cmd secrets add-iam-policy-binding $s --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project=$P
}
gcloud.cmd projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/run.developer --condition=None

# 3. Deploy (public URL is required for Telegram to call it; protected by the secret header + chat-id check).
gcloud.cmd functions deploy dimeo-telegram-bot --gen2 --region=$R --runtime=nodejs22 --source=cloud/telegram-bot `
  --entry-point=telegramBot --trigger-http --allow-unauthenticated --service-account=$SA `
  "--set-env-vars=GCP_PROJECT=$P,GCP_REGION=$R" `
  "--set-secrets=TELEGRAM_BOT_TOKEN=telegram-bot-token:latest,TELEGRAM_CHAT_ID=telegram-chat-id:latest,WEBHOOK_SECRET=telegram-webhook-secret:latest" `
  --memory=256Mi --max-instances=2 --quiet --project=$P

# 4. Point the Telegram webhook at the function.
$url = gcloud.cmd functions describe dimeo-telegram-bot --gen2 --region=$R --project=$P --format="value(serviceConfig.uri)"
$token = gcloud.cmd secrets versions access latest --secret=telegram-bot-token --project=$P
$secret = gcloud.cmd secrets versions access latest --secret=telegram-webhook-secret --project=$P
$body = @{ url = $url; secret_token = $secret; allowed_updates = @('message','callback_query') } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType 'application/json' -Body $body
$cmds = @{ commands = @(@{ command='sites'; description='Show all sites to check in' }, @{ command='help'; description='Show the site menu' }) } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setMyCommands" -ContentType 'application/json' -Body $cmds
Write-Host "Done. Open the bot in Telegram and send /sites"
