#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: BMD"
node scripts/run-checkin-group.js bmd
echo
read -p "Press Enter to close..."
