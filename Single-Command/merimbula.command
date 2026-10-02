#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Merimbula PO"
node scripts/run-checkin-site.js merimbula
echo
read -p "Press Enter to close..."
