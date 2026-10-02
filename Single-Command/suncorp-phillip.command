#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Suncorp Phillip"
node scripts/run-checkin-site.js suncorp-phillip
echo
read -p "Press Enter to close..."
