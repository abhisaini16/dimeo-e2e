#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Mawson PO"
node scripts/run-checkin-site.js mawson
echo
read -p "Press Enter to close..."
