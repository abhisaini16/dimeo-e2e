#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Belconnen PO"
node scripts/run-checkin-site.js belconnen
echo
read -p "Press Enter to close..."
