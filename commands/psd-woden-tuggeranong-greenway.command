#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: PSD Woden, PSD Tuggeranong & Greenway PO"
node scripts/run-checkin-group.js psd-woden-tuggeranong-greenway
echo
read -p "Press Enter to close..."
