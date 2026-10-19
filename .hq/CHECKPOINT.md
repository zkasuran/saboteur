# CHECKPOINT (Saboteur)

Updated 2026-10-19 05:50 IST.

## Done
- Site live: https://saboteur-cyan.vercel.app (Vercel zkasuran1/saboteur, git-connected to zkasuran/saboteur,
  ssoProtection null so PR previews are public). Repo PRIVATE.
- `./verify.sh` ALL GREEN locally: tsc strict, 41 vitest, runner self-check, report validates, build with CSP,
  e2e (13 routes x 2 themes x 390/1360, zero console/CSP errors, clean flow + 11 fault flows), npm audit 0.
- Live e2e GREEN (`BASE=https://saboteur-cyan.vercel.app node scripts/e2e.mjs`).
- TestSprite project created: 4fa4606f-0595-4ceb-9cd2-c6731b13e1c9 ("Saboteur · Kiln demo store"),
  URL https://saboteur-cyan.vercel.app/shop, test-id attr data-testid.

## In progress
- `testsprite test plan generate --project 4fa4606f-... --idempotency-key sab-plan-gen-1` running in background,
  log `runs/plan-generate.log`. Re-running the same command resumes (stages are not recharged).

## Next
1. `testsprite test plan accept --project <id>` then first fresh `test run --all --wait` (baseline, creates
   replayable code). Check credits (`testsprite usage`).
2. `node scripts/saboteur.ts envs --project <id> --origin https://saboteur-cyan.vercel.app`
3. `node scripts/saboteur.ts run --project <id> --label "Generated suite"` then `report`.
4. Survivors -> branch adds tests (portal or `test create --plan-from`) + PR; GitHub App PR trigger blocking.
5. README (needs real matrix numbers + screenshots), flip public, Discord packet in submit/.
