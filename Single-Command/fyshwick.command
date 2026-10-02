#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Fyshwick PO"
node scripts/run-checkin-site.js fyshwick
echo
read -p "Press Enter to close..."
