#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Belconnen, Kingston Gallagher & QBE"
node scripts/run-checkin-group.js belconnen-gallagher-qbe
echo
read -p "Press Enter to close..."
