#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Weston PO"
node scripts/run-checkin-site.js weston
echo
read -p "Press Enter to close..."
