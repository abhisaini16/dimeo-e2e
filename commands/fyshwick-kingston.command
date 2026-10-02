#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Fyshwick & Kingston"
node scripts/run-checkin-group.js fyshwick-kingston
echo
read -p "Press Enter to close..."
