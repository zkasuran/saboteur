#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
"""Write hand-authored TestSprite test code for the survivor-killing tests into testsprite/code/.

Every test opens the environment URL (`VAR_{url}`, which TestSprite substitutes per run), so a replay
against `/x/m07/shop` stays on that build. Assertions are exact amounts on data-testid cells, the
things the plan files in testsprite/plans/ ask for. Upload with `testsprite test code put`.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "testsprite" / "code"

HEAD = '''import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
# {title}
# Hand-written for Saboteur (testsprite/plans/{plan}.json). Opens the environment URL, so a replay
# against a sabotaged build (/x/mNN/shop) stays on that build.

async def run_test():
    pw = None
    browser = None
    context = None
    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(headless=True, args=["--window-size=1280,720", "--disable-dev-shm-usage", "--ipc=host", "--single-process"])
        context = await browser.new_context()
        context.set_default_timeout(15000)
        page = await context.new_page()

        await page.goto("VAR_{{url}}")
        await page.wait_for_selector('[data-testid="product-grid"]', timeout=15000)

        async def add(slug, times=1):
            for _ in range(times):
                await page.get_by_test_id("add-" + slug).click(timeout=10000)

        async def open_cart():
            await page.get_by_test_id("cart-link").click(timeout=10000)
            await expect(page.get_by_role("heading", name="Your cart")).to_be_visible()

        async def checkout(email="ada@example.com"):
            await page.locator(".summary").get_by_role("link", name="Checkout").click(timeout=10000)
            await page.locator("#f-name").fill("Ada Lovelace")
            await page.locator("#f-email").fill(email)
            await page.locator("#f-address").fill("12 Analytical St")
            await page.locator("#f-postcode").fill("SW1A 1AA")
            await page.get_by_role("button", name=re.compile("^Place order")).click(timeout=10000)

'''

TAIL = '''
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
'''

TESTS = {
    "m01-subtotal-cents": ("Cart subtotal keeps the cents", '''
        await add("speckled-mug", 3)
        await open_cart()
        await expect(page.get_by_test_id("qty-speckled-mug")).to_have_text("3")
        await expect(page.get_by_test_id("subtotal")).to_have_text("$55.50")
        await expect(page.get_by_test_id("shipping")).to_have_text("Free")
        await expect(page.get_by_test_id("total")).to_have_text("$55.50")
'''),
    "m02-promo-discount": ("Promo SAVE10 actually lowers the total", '''
        await add("serving-platter")
        await open_cart()
        await page.locator("#promo").fill("SAVE10")
        await page.get_by_role("button", name="Apply", exact=True).click()
        await expect(page.get_by_test_id("promo-message")).to_contain_text("SAVE10 applied")
        await expect(page.get_by_test_id("discount")).to_have_text("-$4.60")
        await expect(page.get_by_test_id("shipping")).to_have_text("$6.00")
        await expect(page.get_by_test_id("total")).to_have_text("$47.40")
'''),
    "m05-remove-right-line": ("Removing one cart line keeps the other", '''
        await add("bud-vase")
        await add("planter")
        await open_cart()
        await page.get_by_role("button", name="Remove Planter").click()
        await expect(page.get_by_test_id("line-bud-vase")).to_be_visible()
        await expect(page.get_by_test_id("line-planter")).to_have_count(0)
        await expect(page.get_by_test_id("subtotal")).to_have_text("$14.75")
'''),
    "m07-invalid-email": ("Checkout rejects an invalid email", '''
        await add("spoon-rest")
        await open_cart()
        await checkout(email="not-an-email")
        await expect(page).to_have_url(re.compile(r"/checkout$"))
        await expect(page.locator("#e-email")).to_contain_text("valid email")
        await expect(page.get_by_text("Order placed")).to_have_count(0)
'''),
    "m08-free-shipping-boundary": ("Free shipping starts at exactly $50.00", '''
        await add("stoneware-bowl", 2)
        await open_cart()
        await expect(page.get_by_test_id("subtotal")).to_have_text("$50.00")
        await expect(page.get_by_test_id("shipping")).to_have_text("Free")
        await expect(page.get_by_test_id("total")).to_have_text("$50.00")
        await page.get_by_role("button", name="Decrease Stoneware Bowl").click()
        await expect(page.get_by_test_id("shipping")).to_have_text("$6.00")
        await expect(page.get_by_test_id("total")).to_have_text("$31.00")
'''),
    "m10-confirmation-total": ("Confirmation charges the cart total", '''
        await add("speckled-mug")
        await open_cart()
        await page.locator("#promo").fill("SAVE10")
        await page.get_by_role("button", name="Apply", exact=True).click()
        await expect(page.get_by_test_id("total")).to_have_text("$22.65")
        await checkout()
        await expect(page.get_by_text("Order placed")).to_be_visible()
        await expect(page.get_by_test_id("receipt-subtotal")).to_have_text("$18.50")
        await expect(page.get_by_test_id("receipt-discount")).to_have_text("-$1.85")
        await expect(page.get_by_test_id("receipt-shipping")).to_have_text("$6.00")
        await expect(page.get_by_test_id("order-total")).to_have_text("$22.65")
'''),
    "m11-sold-out": ("A sold-out item cannot be added", '''
        btn = page.get_by_test_id("add-tea-cup-set")
        await expect(btn).to_have_text("Sold out")
        await expect(btn).to_be_disabled()
        await btn.click(force=True)
        await expect(page.get_by_test_id("cart-count")).to_have_text("0")
'''),
    "m13-cart-survives-reload": ("The cart survives a page reload", '''
        await add("planter", 2)
        await open_cart()
        await expect(page.get_by_test_id("qty-planter")).to_have_text("2")
        await page.reload()
        await expect(page.get_by_test_id("qty-planter")).to_have_text("2")
        await expect(page.get_by_test_id("subtotal")).to_have_text("$55.00")
'''),
    "m14-sort-price-asc": ("Sort by price puts the cheapest first", '''
        await page.locator("#sort").select_option("price-asc")
        names = page.locator('article[data-testid^="product-"] .product-name')
        await expect(names.first).to_have_text("Spoon Rest")
        await expect(names.nth(1)).to_have_text("Bud Vase")
        await expect(names.last).to_have_text("Serving Platter")
'''),
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for plan, (title, body) in TESTS.items():
        (OUT / f"{plan}.py").write_text(HEAD.format(title=title, plan=plan) + body + TAIL, encoding="utf-8")
        print(f"wrote testsprite/code/{plan}.py")
