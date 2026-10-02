#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: PSD Manuka Dental"
node scripts/run-checkin-site.js psd-manuka
echo
read -p "Press Enter to close..."
