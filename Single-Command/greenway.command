#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Greenway PO"
node scripts/run-checkin-site.js greenway
echo
read -p "Press Enter to close..."
