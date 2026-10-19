#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
"""Repair stored TestSprite test code so a replay follows the environment URL.

PR-triggered runs with auto-heal rewrite `page.goto("VAR_{url}")` into the absolute URL of that PR's
preview deploy. Every later replay then visits the old preview, whatever environment it was started
with. This rewrites any absolute goto on a Vercel host of this project back to the environment URL,
keeping the path, and fixes a few selectors that cannot pass on a correct build.

usage: repair_code.py <in.py> <out.py>      prints the list of changes, exits 1 if nothing matched
"""
import re
import sys

HOST = r"https://saboteur(?:-[a-z0-9-]+)?(?:-zkasuran1)?\.vercel\.app"


def repair(code: str) -> tuple[str, list[str]]:
    notes: list[str] = []

    def goto(m: re.Match) -> str:
        path = m.group(1) or "/shop"
        notes.append(f"goto {m.group(0)[:70]} -> environment URL{'' if path == '/shop' else ' + ' + path}")
        if path == "/shop":
            return 'page.goto("VAR_{url}")'
        return f'page.goto("VAR_{{url}}".rsplit("/shop", 1)[0] + "{path}")'

    code = re.sub(r'page\.goto\("' + HOST + r'(/[A-Za-z0-9/_-]*)?"\)', goto, code)

    fixes = [
        # A <select> was driven with an empty value, which no option has.
        (r'\.select_option\(""\)', '.select_option("price-asc")', 'select_option("") -> "price-asc"'),
        # The quantity stepper was asserted as one text run ("− 3 +"); assert the quantity cell.
        (r'expect\(page\.locator\("#main"\)\.nth\(0\)\)\.to_contain_text\("\\u2212 (\d+) \+"',
         r'expect(page.locator("[data-testid^=qty-]").nth(0)).to_have_text("\1"', 'stepper text -> qty cell'),
        # A hidden item in the site's hover menu was used to reach the cart; use the store's Cart link.
        (r'page\.get_by_role\("menuitem", name="Cart[^"]*"\)', 'page.get_by_test_id("cart-link")', 'hover-menu item -> store cart link'),
        # Label and value live in separate <dt>/<dd>, so "Shipping $" never appears as one string.
        (r'expect\(page\.locator\("#main"\)\.nth\(0\)\)\.to_contain_text\("(Subtotal|Shipping|Total) \$"',
         lambda m: f'expect(page.get_by_test_id("{m.group(1).lower()}").nth(0)).to_contain_text("$"', 'label+value text -> summary cell'),
    ]
    for pat, rep, note in fixes:
        code, n = re.subn(pat, rep, code)
        if n:
            notes.append(f"{note} ({n}x)")

    # Clicking a disabled button waits forever; assert it is disabled instead.
    sold = re.compile(r'elem = page\.get_by_test_id\("add-tea-cup-set"\)\n(\s+)await elem\.click\(timeout=10000\)')
    code, n = sold.subn(r'elem = page.get_by_test_id("add-tea-cup-set")\n\1await expect(elem).to_be_disabled(timeout=10000)', code)
    if n:
        notes.append("click on disabled sold-out button -> assert disabled")
    return code, notes


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    out, notes = repair(open(src, encoding="utf-8").read())
    open(dst, "w", encoding="utf-8").write(out)
    for n in notes:
        print("  " + n)
    sys.exit(0 if notes else 1)
