#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Narooma PO"
node scripts/run-checkin-group.js narooma
echo
read -p "Press Enter to close..."
