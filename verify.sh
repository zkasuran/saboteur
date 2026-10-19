#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
# The release gate. Every step must be green; nothing is skipped silently.
set -euo pipefail
cd "$(dirname "$0")"
step() { printf '\n== %s\n' "$*"; }
step "install (lockfile exact)";          npm ci --no-audit --no-fund
step "typecheck (strict, no unused)";     npx tsc -p .
step "unit + adversarial tests";          npx vitest run
step "runner self-check";                 node scripts/saboteur.ts help
step "report.json validates";             node -e 'import("./src/report/matrix.ts").then(m=>{const r=m.parseReport(JSON.parse(require("fs").readFileSync("public/report.json","utf8")));if(!r.ok){console.error(r.error);process.exit(1)}console.log("runs:",r.value.runs.length)})'
step "production build (CSP injected)";   npx vite build
grep -q 'Content-Security-Policy' dist/index.html
step "end to end in headless Chrome";     node scripts/e2e.mjs
step "supply chain: npm audit";           npm audit --audit-level=low
printf '\nALL GREEN\n'
