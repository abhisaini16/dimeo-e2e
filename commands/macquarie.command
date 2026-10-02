#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Macquarie"
node scripts/run-checkin-group.js macquarie
echo
read -p "Press Enter to close..."
