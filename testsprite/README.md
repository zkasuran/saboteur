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
