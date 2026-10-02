#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Kingston PO"
node scripts/run-checkin-site.js kingston
echo
read -p "Press Enter to close..."
