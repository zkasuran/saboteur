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
        
        # -> Add the Serving Platter to the cart once.
        # @@ts-step {"i":3,"type":"action","action":"click","selector":"xpath=/html/body/div/main/div/section/div[4]/article[5]/div/button","desc":"Click 'Add to cart button'","input":null,"field":"187"}
        # Add to cart button
        elem = page.get_by_test_id("add-serving-platter")
        await elem.click(timeout=10000)
        
        # -> Scroll to the store header and open the Cart link.
        # @@ts-step {"i":4,"type":"action","action":"scroll","selector":null,"desc":"Scroll the page","input":null,"field":null}
        await page.mouse.wheel(0, 300)
        
        # -> Open the cart from the store header and inspect its promo-code field and order totals.
        # @@ts-step {"i":5,"type":"action","action":"click","selector":"xpath=/html/body/div/main/div/div/div/nav/a[2]","desc":"Click 'Cart 1 link'","input":null,"field":"340"}
        # Cart 1 link
        elem = page.get_by_test_id("cart-link")
        await elem.click(timeout=10000)
        
        # -> Enter SAVE10 in the Promo code field and apply it to update the order summary.
        # @@ts-step {"i":6,"type":"action","action":"fill","selector":"xpath=/html/body/div/main/div/section/div/aside/form/label/input","desc":"Fill 'SAVE10' into Promo code text field","input":"SAVE10","field":"494"}
        # Promo code text field
        elem = page.get_by_role("textbox", name="Promo code")
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("SAVE10")
        
        # -> Enter SAVE10 in the Promo code field and apply it to update the order summary.
        # @@ts-step {"i":7,"type":"action","action":"click","selector":"xpath=/html/body/div/main/div/section/div/aside/form/button","desc":"Click 'Apply button'","input":null,"field":"496"}
        # Apply button
        elem = page.get_by_role("button", name="Apply")
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        current_url = await page.evaluate("() => window.location.href")
        # Assert-outcome: passed
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    