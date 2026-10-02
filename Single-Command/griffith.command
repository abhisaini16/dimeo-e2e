#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Griffith PO"
node scripts/run-checkin-site.js griffith
echo
read -p "Press Enter to close..."
