#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Jindabyne"
node scripts/run-checkin-group.js jindabyne
echo
read -p "Press Enter to close..."
