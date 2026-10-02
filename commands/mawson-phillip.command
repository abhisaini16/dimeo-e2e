#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Mawson & Phillip"
node scripts/run-checkin-group.js mawson-phillip
echo
read -p "Press Enter to close..."
