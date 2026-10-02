#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Bega Urgent Clinic"
node scripts/run-checkin-site.js bega-medical
echo
read -p "Press Enter to close..."
