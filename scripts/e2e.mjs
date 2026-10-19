// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/**
 * Drives the built site the way a judge would: every route in both themes at 390 and 1360 wide with zero
 * console errors, zero CSP violations and no sideways scroll, then the store flows on the clean build and
 * on sabotaged builds. BASE defaults to a local `vite preview`; point it at the live deploy to check that.
 *
 *   node scripts/e2e.mjs                       # builds nothing; expects dist/ (verify.sh builds first)
 *   BASE=https://saboteur.example node scripts/e2e.mjs --shots /tmp/shots
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const shotsIdx = process.argv.indexOf("--shots");
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
let BASE = process.env.BASE?.replace(/\/$/, "");
let server = null;

if (!BASE) {
  BASE = "http://127.0.0.1:4173";
  server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
}

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
  process.stdout.write(`${ok ? "ok  " : "FAIL"} ${msg}\n`);
};

const ROUTES = ["/", "/how", "/faults", "/report", "/docs", "/method", "/shop", "/shop/speckled-mug", "/cart", "/checkout", "/nope", "/x/m99/shop", "/x/m03/shop"];
const browser = await chromium.launch();

async function newPage(theme, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

try {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 1360]) {
      const { ctx, page, errors } = await newPage(theme, width);
      for (const r of ROUTES) {
        await page.goto(BASE + r, { waitUntil: "networkidle" });
        await page.waitForTimeout(150);
        const t = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(t === theme, `${theme} ${width} ${r}: theme applied`);
        check(overflow <= 0, `${theme} ${width} ${r}: no sideways scroll (${overflow}px)`);
        if (SHOTS && ["/", "/report", "/shop", "/faults", "/cart"].includes(r)) {
          await page.screenshot({ path: `${SHOTS}/${theme}-${width}${r.replace(/\//g, "_") || "_home"}.png`, fullPage: width > 400 ? false : false });
        }
      }
      check(errors.length === 0, `${theme} ${width}: zero console errors and CSP violations${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
      await ctx.close();
    }
  }

  // ---- store flows ----
  const flow = async (prefix) => {
    const { ctx, page, errors } = await newPage("light", 1360);
    const out = {};
    await page.goto(`${BASE}${prefix}/shop`, { waitUntil: "networkidle" });
    for (let i = 0; i < 3; i++) await page.click('[data-testid="add-speckled-mug"]');
    out.badge = await page.textContent('[data-testid="cart-count"]');
    out.soldOutDisabled = await page.isDisabled('[data-testid="add-tea-cup-set"]');
    await page.fill("#search", "mug");
    out.searchHits = await page.locator('article[data-testid^="product-"]').count();
    await page.fill("#search", "");
    await page.selectOption("#sort", "price-asc");
    out.firstSorted = await page.locator('article[data-testid^="product-"] .product-name').first().textContent();
    await page.click('[data-testid="cart-link"]');
    await page.waitForTimeout(100);
    out.cartPath = new URL(page.url()).pathname;
    out.onCart = (await page.locator("h1").first().textContent())?.trim();
    if (out.onCart !== "Your cart") await page.goto(`${BASE}${prefix}/cart`, { waitUntil: "networkidle" });
    out.subtotal = await page.textContent('[data-testid="subtotal"]');
    await page.reload({ waitUntil: "networkidle" });
    out.afterReload = (await page.locator("h1").first().textContent())?.trim();
    if (out.afterReload !== "Your cart") {
      await page.goto(`${BASE}${prefix}/shop`, { waitUntil: "networkidle" });
      for (let i = 0; i < 3; i++) await page.click('[data-testid="add-speckled-mug"]');
      await page.click('[data-testid="cart-link"]');
    }
    await page.fill("#promo", "SAVE10");
    await page.click(".promo button");
    out.promoMsg = await page.textContent('[data-testid="promo-message"]');
    out.discount = await page.textContent('[data-testid="discount"]');
    out.total = await page.textContent('[data-testid="total"]');
    await page.click('.summary a.btn-primary');
    await page.fill("#f-name", "Ada Lovelace");
    await page.fill("#f-email", "not-an-email");
    await page.fill("#f-address", "12 Analytical St");
    await page.fill("#f-postcode", "SW1A 1AA");
    await page.click('button:has-text("Place order")');
    await page.waitForTimeout(150);
    out.invalidEmailBlocked = new URL(page.url()).pathname.endsWith("/checkout");
    if (out.invalidEmailBlocked) {
      out.emailError = await page.textContent("#e-email");
      await page.fill("#f-email", "ada@example.com");
      await page.click('button:has-text("Place order")');
      await page.waitForTimeout(150);
    }
    out.placed = /\/order\/KLN-/.test(page.url());
    out.orderTotal = out.placed ? await page.textContent('[data-testid="order-total"]') : null;
    out.receipt = out.placed ? [await page.textContent('[data-testid="receipt-subtotal"]'), await page.textContent('[data-testid="receipt-discount"]'), await page.textContent('[data-testid="receipt-shipping"]')].join(" ") : null;
    out.errors = errors;
    await ctx.close();
    return out;
  };

  const clean = await flow("");
  check(clean.badge === "3", `clean: badge shows 3 (${clean.badge})`);
  check(clean.soldOutDisabled, "clean: sold-out button disabled");
  check(clean.searchHits === 1, `clean: lower-case search finds the mug (${clean.searchHits})`);
  check(clean.firstSorted === "Spoon Rest", `clean: cheapest first (${clean.firstSorted})`);
  check(clean.cartPath === "/cart" && clean.onCart === "Your cart", `clean: header link opens the cart (${clean.cartPath})`);
  check(clean.subtotal === "$55.50", `clean: subtotal $55.50 (${clean.subtotal})`);
  check(clean.afterReload === "Your cart", "clean: cart survives reload");
  check(clean.discount === "-$5.55" && clean.total === "$49.95", `clean: promo discount -$5.55, total $49.95 (${clean.discount}, ${clean.total})`);
  check(clean.invalidEmailBlocked && /valid email/.test(clean.emailError ?? ""), "clean: invalid email blocked with an error");
  check(clean.placed && clean.orderTotal === "$49.95", `clean: order placed, confirmation total $49.95 (${clean.orderTotal})`);
  check(clean.receipt === "$55.50 -$5.55 Free", `clean: receipt itemises subtotal, discount, shipping (${clean.receipt})`);
  check(clean.errors.length === 0, "clean flow: zero console errors");

  const expectations = {
    m01: (o) => o.subtotal === "$54.00",
    m02: (o) => /applied/.test(o.promoMsg ?? "") && o.discount === "$0.00",
    m03: (o) => o.badge === "0",
    m06: (o) => o.searchHits === 0,
    m07: (o) => !o.invalidEmailBlocked && o.placed,
    m09: (o) => !o.placed,
    m10: (o) => o.placed && o.orderTotal !== o.total,
    m11: (o) => o.soldOutDisabled === false,
    m12: (o) => o.cartPath === "/x/m12/bag",
    m13: (o) => o.afterReload !== "Your cart",
    m14: (o) => o.firstSorted === "Serving Platter",
  };
  for (const [code, ok] of Object.entries(expectations)) {
    const o = await flow(`/x/${code}`);
    check(ok(o), `${code}: the planted bug shows up in the browser`);
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  process.stdout.write(`\n${failures.length} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write("\nE2E GREEN\n");
