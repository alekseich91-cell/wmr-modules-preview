#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --check app.js
node --check model.js
node --test tests/*.test.mjs
