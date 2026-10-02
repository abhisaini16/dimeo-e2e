#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running batch check-in/out: PSD Manuka, PSD Tuggeranong, PSD Woden, PSD Queenbeyan, QBE, Suncorp Phillip, Bega Medical Urgent, Kingston Gallagher"
node scripts/run-checkin-final.js
echo
read -p "Press Enter to close..."
