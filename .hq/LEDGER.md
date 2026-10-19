# Saboteur lane ledger (TestSprite Hackathon Season 4, Project track)

## Program facts (read live 2026-10-19 from https://www.testsprite.com/hackathon-s4)
- Project submissions close Oct 22 11:59 PM PT. Post in Discord #hackathon-submissions: PR link, live URL,
  TestSprite email + name, optional demo video.
- Required: public repo, README (app, live URL, what the suite covers), live public URL, suite built in the
  3.0 portal, GitHub App connected, at least one PR with a TestSprite comment or status check, tests passing.
- Scoring: 40 project quality, 40 tests that run themselves (coverage, assertion depth, scenario design, fires
  on every PR and holds the merge), 20 innovation, plus open engagement bonus.
- "A run that caught something first and went green after your fix is the best version."

## Account
- zkasuran, TestSprite zkasuran@gmail.com, workspace 517fb9d2-693e-50dc-bc21-ed604b032c75, Starter, 800 credits
  at start (400/mo). CLI 0.14.0, V3 routing. Key in ~/.testsprite/credentials (0600), never in the lane.
- FE rerun costs 0.5 credits, BE rerun 0.2.

## Rival scan (2026-10-19)
- Meta-tools on TestSprite: farhank15/meerkat (verdict-trust scoring), dadwritestech/thisisfine (locked
  promises, proves each check fails on HEAD), naufalfx805-source/agentpulse (dashboard), OkeyAmy/testsprite-watch
  (issue claimer bot). No repo found for mutation / sabotage / chaos against a TestSprite suite.
- thisisfine is closest in spirit (prove a check can fail). Our distinction: we measure the WHOLE generated
  suite against a catalog of realistic deployed faults and report a kill score per fault and per test.

## Design decisions
- Faults selected by a path prefix `/x/<fault-id>/` (robust to TestSprite env URL validation, survives in-app
  navigation because the router keeps the base). Query `?fault=` also accepted as a fallback.
- One TestSprite environment per fault, URL = live origin + `/x/<id>/`. Matrix = `test rerun --all --env <f>
  --no-auto-heal --wait --summary-file`. Auto-heal must be off or the agent rewrites tests to fit the bug.
- Stack: Vite + TS vanilla SPA, vitest, Vercel (git-connected so PRs get preview deploys for the GitHub App).
- Licence: SAND-1.0 for the entry (house rule: entries get SAND).

## Log
- 2026-10-19 05:20 IST: lane created, private repo zkasuran/saboteur.
PROJECT=4fa4606f-0595-4ceb-9cd2-c6731b13e1c9
