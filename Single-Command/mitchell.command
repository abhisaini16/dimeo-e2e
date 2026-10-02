#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Mitchell PO"
node scripts/run-checkin-site.js mitchell
echo
read -p "Press Enter to close..."
