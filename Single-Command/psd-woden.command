#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: PSD Woden"
node scripts/run-checkin-site.js psd-woden
echo
read -p "Press Enter to close..."
