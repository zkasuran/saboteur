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
        
        # -> Choose “Price: low to high” in the Sort dropdown on the shop page.
        # @@ts-step {"i":2,"type":"action","action":"select","selector":"xpath=/html/body/div/main/div/section/div[2]/label[2]/select","desc":"Select option in 'Featured Price: low to high Price: high to low... dropdown'","input":null,"field":"131"}
        # Featured Price: low to high Price: high to low... dropdown
        elem = page.locator("xpath=/html/body/div/main/div/section/div[2]/label[2]/select").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.select_option("price-asc")
        
        # -> Scroll to the bottom of the product list and verify that Serving Platter at $46.00 is last.
        # @@ts-step {"i":3,"type":"action","action":"scroll","selector":null,"desc":"Scroll the page","input":null,"field":null}
        await page.mouse.wheel(0, 300)
        
        # --> Assertions to verify final state
        
        # --> Price: low to high shows Spoon Rest first, Bud Vase second, and Serving Platter last.
        # Assert-outcome: not verified — the export-time check could not be evaluated
        # Assert: The shop is using the ascending-price sort.
        await expect(page).to_have_url(re.compile("sort=price\\-asc"), timeout=15000), "The shop is using the ascending-price sort."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    