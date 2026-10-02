#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Phillip PO"
node scripts/run-checkin-site.js phillip
echo
read -p "Press Enter to close..."
