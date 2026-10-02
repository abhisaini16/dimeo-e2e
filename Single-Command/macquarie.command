#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Macquarie PO"
node scripts/run-checkin-site.js macquarie
echo
read -p "Press Enter to close..."
