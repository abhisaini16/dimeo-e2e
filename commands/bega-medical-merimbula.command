#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Bega Urgent Clinic & Merimbula PO"
node scripts/run-checkin-group.js bega-medical-merimbula
echo
read -p "Press Enter to close..."
