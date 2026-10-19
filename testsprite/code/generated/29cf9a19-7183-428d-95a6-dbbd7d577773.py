import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Navigate to https://saboteur-git-demo-ship-a-bug-zkasuran1.vercel.app/shop","input":"https://saboteur-git-demo-ship-a-bug-zkasuran1.vercel.app/shop","field":null}
        await page.goto("VAR_{url}")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Search the catalog for “mug” using the Search field.
        # @@ts-step {"i":2,"type":"action","action":"fill","selector":"xpath=/html/body/div/main/div/section/div[2]/label/input","desc":"Fill 'mug' into Search mugs, bowls, vases search field","input":"mug","field":"130"}
        # Search mugs, bowls, vases search field
        elem = page.get_by_role("searchbox", name="Search")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("mug")
        
        # --> Assertions to verify final state
        
        # --> Only the matching Speckled Mug is shown in the filtered catalog.
        # Assert-outcome: not verified — the export-time check could not be evaluated
        # Assert: The filtered catalog should show one product card.
        await expect(page.locator("xpath=/html/body/div/main/div/section/div[4]/article/a")).to_have_count(1, timeout=15000), "The filtered catalog should show one product card."
        # Assert-outcome: not verified — the export-time check could not be evaluated
        # Assert: The matching product should be the Speckled Mug.
        await expect(page.get_by_test_id("product-speckled-mug").get_by_role("heading").nth(0)).to_contain_text("Speckled Mug", timeout=15000), "The matching product should be the Speckled Mug."
        
        # --> The filtered result is displayed as a product card in the catalog.
        await page.get_by_role("link", name="View Speckled Mug").nth(0).scroll_into_view_if_needed()
        # Assert-outcome: not verified — the export-time check could not be evaluated
        # Assert: The filtered product card should be visible.
        await expect(page.get_by_role("link", name="View Speckled Mug").nth(0)).to_be_visible(timeout=15000), "The filtered product card should be visible."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    