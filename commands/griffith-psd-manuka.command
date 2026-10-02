#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: Griffith PO & PSD Manuka Dental"
node scripts/run-checkin-group.js griffith-psd-manuka
echo
read -p "Press Enter to close..."
