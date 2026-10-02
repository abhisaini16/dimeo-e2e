#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Cooma PO"
node scripts/run-checkin-site.js cooma
echo
read -p "Press Enter to close..."
