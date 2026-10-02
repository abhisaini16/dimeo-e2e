#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Queenbeyan PO"
node scripts/run-checkin-site.js queenbeyan
echo
read -p "Press Enter to close..."
