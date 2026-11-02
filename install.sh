#!/usr/bin/env sh
set -eu
major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 24 ]; then echo "Node.js >= 24 required"; exit 1; fi
npm install --no-audit --no-fund
[ -f .env ] || cp .env.example .env
echo "Weft installed."
echo "Next: node --experimental-strip-types src/cli.ts --demo"
