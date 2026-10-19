import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
# Removing one cart line keeps the other
# Hand-written for Saboteur (testsprite/plans/m05-remove-right-line.json). Opens the environment URL, so a replay
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

        await page.goto("VAR_{url}")
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


        await add("bud-vase")
        await add("planter")
        await open_cart()
        await page.get_by_role("button", name="Remove Planter").click()
        await expect(page.get_by_test_id("line-bud-vase")).to_be_visible()
        await expect(page.get_by_test_id("line-planter")).to_have_count(0)
        await expect(page.get_by_test_id("subtotal")).to_have_text("$14.75")

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
