#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Weston PO & Queenbeyan PO"
node scripts/run-checkin-group.js weston-queenbeyan
echo
read -p "Press Enter to close..."
