#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: PSD Queenbeyan"
node scripts/run-checkin-site.js psd-queenbeyan
echo
read -p "Press Enter to close..."
