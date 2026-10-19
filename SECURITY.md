<!-- SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0 -->
# Security

Saboteur is a static site plus a local runner script. It has no server, no accounts and stores nothing about
visitors. The attack surface is what the browser reads (the URL, `localStorage`, `/report.json`) and what the
runner reads (CLI output and summary files).

| Attacker | Attack | Defence | Where | Test |
|---|---|---|---|---|
| Visitor | Crafted `/x/<code>/` or `?fault=` to run arbitrary code paths | Codes must match `^m\d{2}$` and exist in the catalog; anything else is a 404 view, never a lookup | `src/saboteur/catalog.ts` `locate` | `test/shop.test.ts` "unknown or hostile codes" |
| Visitor | Very long path | Path cut to 2048 chars before parsing | `locate` | "does not choke on a huge path" |
| Visitor | Edited `localStorage` cart (fake slugs, negative or fractional qty, 20 KB blob, broken JSON) | Size cap 8 KB, guarded `JSON.parse`, every line re-checked against the catalog, quantities capped at 20, duplicates merged | `src/shop/storage.ts` | "storage is hostile input", 500 random-byte rounds |
| Visitor | Edited stored order with HTML in the id or name | Order ids must match `^KLN-[A-Z0-9]{6}$`; all text rendered as text nodes | `storage.ts` `isOrder`, `src/ui/dom.ts` | "orders: validated" |
| Anyone who can change `report.json` | Script injection through test titles or notes | Full schema validation, length caps, id patterns; rendering never uses `innerHTML` | `src/report/matrix.ts` `parseReport`, `dom.ts` | `test/matrix.test.ts` rejects + 2,000 random structures |
| Anyone who can change `report.json` | A score that hides auto-heal | Runs with `autoHeal` other than `false` are rejected by the site and by the runner | `parseReport` | "rejects auto-heal runs" |
| Slow or hostile network | Report fetch hangs or is huge | 6 s `AbortController` timeout, 512 KB cap, designed error state | `src/report/load.ts` | e2e covers the empty state; timeout path not automated |
| Third-party script | XSS through injected scripts or styles | Build-time CSP: `default-src 'none'`, scripts `'self'` plus the theme script's sha256, `style-src 'self'`, `connect-src 'self'` | `vite.config.ts` | `verify.sh` greps the built CSP; e2e asserts zero CSP violations |
| Framing site | Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `vercel.json`, `public/_headers` | checked with `curl -I` on the live deploy |
| Runner operator | API key leaking into argv, logs or the repo | The runner never reads the key; the TestSprite CLI uses its own 0600 credential file. Child processes get argument arrays, never a shell string | `scripts/saboteur.ts` | code review; no test |
| Runner operator | Hostile `--project`, `--origin`, `--label` values | Strict patterns (`https` origin only, id charset, label slugged) before any call | `saboteur.ts` | manual (`envs --project 'bad id'` exits 2) |

## Known limits

- The planted faults are reachable by anyone who knows the `/x/` prefix. That is by design for a demo store;
  in a real app, ship the flags to preview deploys only.
- `report.json` is not signed. It is a published artifact of our own runs; every number links back to
  TestSprite run ids (`runIds`) that a judge can open in the portal.
- Timeout and offline states of the report loader are designed but not exercised by the automated e2e.
