#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Bega PO"
node scripts/run-checkin-group.js bega-po
echo
read -p "Press Enter to close..."
