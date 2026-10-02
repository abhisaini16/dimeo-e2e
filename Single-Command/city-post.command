#!/bin/bash
cd "$(dirname "$0")/.."
echo "Running check-in/out: City Post (Canberra GPO)"
node scripts/run-checkin-site.js city-post
echo
read -p "Press Enter to close..."
