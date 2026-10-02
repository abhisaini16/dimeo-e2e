#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Kingston Gallagher"
node scripts/run-checkin-site.js kingston-gallagher
echo
read -p "Press Enter to close..."
