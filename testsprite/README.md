# TestSprite test plans

Plan files for the tests added to the TestSprite project to kill the bugs the generated suite missed
(see the kill matrix at https://saboteur-cyan.vercel.app/report). Each file is one frontend test, created with:

```bash
testsprite test lint --plan-from-dir testsprite/plans
testsprite test create --plan-from testsprite/plans/<file>.json
```

| File | Kills |
|---|---|
| m01-subtotal-cents.json | m01 Subtotal drops the cents |
| m02-promo-discount.json | m02 Promo code says applied, total unchanged |
| m05-remove-right-line.json | m05 Remove deletes the wrong line |
| m07-invalid-email.json | m07 Checkout accepts an invalid email |
| m08-free-shipping-boundary.json | m08 Free shipping off by one at $50.00 |
| m10-confirmation-total.json | m10 Confirmation shows the wrong total |
| m11-sold-out.json | m11 Sold-out item can be added |
| m13-cart-survives-reload.json | m13 Cart is lost on reload |
| m14-sort-price-asc.json | m14 Sort by price runs backwards |

## Corrected generated test

`generated-place-order-updated-qty.json` replaces the plan of the generated test "Place an order from a cart with
updated quantity and shipping selection". It asked the browser to pick a shipping option, and Kiln has never had
one (one flat $6.00 rate, free from $50.00), so it failed on every correct build. The new plan keeps its intent and
asserts exact totals instead.

## Stored test code (`testsprite/code/`)

What TestSprite actually replays. Two problems found while running the second matrix made this necessary:

- **PR runs pinned the PR's preview URL into the code.** With auto-heal on, a PR-triggered run rewrote
  `page.goto("VAR_{url}")` into the absolute preview URL of that PR. Every later replay visited the old preview,
  whatever environment it was started against, so all 14 sabotaged builds scored identically.
- **Auto-heal weakened assertions.** After healing, "Confirmation charges the cart total" checked only that the
  words "Order placed" and "Receipt" appeared; every exact amount the plan asked for was gone.

`m*.py` are hand-written for the nine survivor tests (`scripts/write_tests.py`): they open `VAR_{url}` and assert
exact amounts on `data-testid` cells. Each was run locally against the clean build (passes) and its own sabotaged
build (fails) before upload. `generated/` is the generated suite after `scripts/repair_code.py`: navigation back
on `VAR_{url}`, plus four selector fixes for steps that could not pass on a correct build. Uploaded with
`testsprite test code put --expected-version`, which also stops auto-heal from rewriting them again.
