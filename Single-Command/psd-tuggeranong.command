#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: PSD Tuggeranong"
node scripts/run-checkin-site.js psd-tuggeranong
echo
read -p "Press Enter to close..."
