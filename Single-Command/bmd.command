#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: BMD"
node scripts/run-checkin-site.js bmd
echo
read -p "Press Enter to close..."
