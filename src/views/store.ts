// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { cartBadgeCount, route, storeHeader, type Ctx } from "../app";
import {
  addToCart, applyPromo, canAdd, FREE_SHIPPING_FROM_CENTS, itemCount, listProducts, money, placeOrder, PRODUCTS, productBySlug, PROMO_PERCENT,
  removeLine, setQty, totals, validateCheckout, type CheckoutForm, type FieldErrors, type Product, type SortKey,
} from "../shop/shop";
import { loadOrders, newOrderId, ORDER_ID_RE, saveOrder } from "../shop/storage";
import { h, svg } from "../ui/dom";

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "Name: A to Z" },
];

function isSort(s: string | null): s is SortKey {
  return SORTS.some((o) => o.key === s);
}

/** Product art drawn from the product's hue: a vessel on a glazed tile. Presentation attributes only (CSP-safe). */
export function art(p: Product, size = 220): SVGElement {
  const shapes: Record<string, string> = {
    "speckled-mug": "M70 70h70v70a20 20 0 0 1-20 20H90a20 20 0 0 1-20-20z M140 88h12a14 14 0 0 1 0 28h-12",
    "pour-over-dripper": "M60 72h100l-30 56H90z M84 128h52v10H84z M70 150h80v8H70z",
    "stoneware-bowl": "M50 100h120a60 50 0 0 1-120 0z M88 150h44v8H88z",
    "bud-vase": "M100 50h20v28c22 10 26 30 26 50a36 36 0 0 1-72 0c0-20 4-40 26-50z",
    "serving-platter": "M40 112a70 26 0 1 0 140 0a70 26 0 1 0-140 0z M62 112a48 14 0 1 0 96 0a48 14 0 1 0-96 0z",
    "tea-cup-set": "M44 90h46v34a14 14 0 0 1-14 14H58a14 14 0 0 1-14-14z M130 90h46v34a14 14 0 0 1-14 14h-18a14 14 0 0 1-14-14z M40 150h140v8H40z",
    "spoon-rest": "M60 120a50 22 0 1 0 100 0a50 22 0 1 0-100 0z M100 118l60-40",
    planter: "M64 84h92l-12 70H76z M58 72h104v14H58z M70 156h80v6H70z",
  };
  const d = shapes[p.slug] ?? shapes.planter ?? "";
  return svg(
    "svg",
    { viewBox: "0 0 220 220", width: size, height: size, role: "img", "aria-label": p.name, class: "art" },
    svg("rect", { width: 220, height: 220, rx: 18, fill: `hsl(${p.hue} 45% 86%)` }),
    svg("circle", { cx: 176, cy: 44, r: 54, fill: `hsl(${p.hue} 50% 78%)` }),
    svg("path", { d, fill: `hsl(${p.hue} 32% 42%)`, stroke: `hsl(${p.hue} 40% 26%)`, "stroke-width": 3, "stroke-linejoin": "round" }),
  );
}

function updateBadge(ctx: Ctx): void {
  const n = cartBadgeCount(ctx, itemCount(ctx.cart()));
  document.querySelectorAll('[data-testid="cart-count"]').forEach((el) => (el.textContent = String(n)));
  document.querySelector('[data-testid="cart-link"]')?.setAttribute("aria-label", `Cart, ${n} items`);
}

function toast(region: HTMLElement, msg: string, kind: "ok" | "err" = "ok"): void {
  region.replaceChildren(h("div", { class: `toast toast-${kind}` }, msg));
}

function addButton(ctx: Ctx, p: Product, status: HTMLElement, qty: () => number = () => 1): HTMLElement {
  const enabled = canAdd(ctx.sab, p);
  const b = h("button", { class: "btn btn-primary btn-block", type: "button", disabled: !enabled, "data-testid": `add-${p.slug}` }, p.soldOut && !enabled ? "Sold out" : "Add to cart");
  b.addEventListener("click", () => {
    const r = addToCart(ctx.sab, ctx.cart(), p.slug, qty());
    if (!r.ok) {
      toast(status, r.reason === "max-qty" ? "You can add up to 20 of one item." : "That item cannot be added.", "err");
      return;
    }
    ctx.setCart(r.cart);
    updateBadge(ctx);
    toast(status, `Added ${p.name} to your cart.`);
  });
  return b;
}

function shop(ctx: Ctx): HTMLElement {
  const params = new URLSearchParams(window.location.search);
  let query = (params.get("q") ?? "").slice(0, 64);
  const sortParam = params.get("sort");
  let sort: SortKey = isSort(sortParam) ? sortParam : "featured";
  const status = h("div", { class: "toast-region", role: "status", "aria-live": "polite" });
  const grid = h("div", { class: "grid products", "data-testid": "product-grid" });
  const count = h("p", { class: "muted small", "aria-live": "polite" });

  const paint = () => {
    const list = listProducts(ctx.sab, query, sort);
    count.textContent = `${list.length} of ${PRODUCTS.length} products`;
    if (list.length === 0) {
      grid.replaceChildren(h("div", { class: "empty" }, h("h3", {}, "No products match"), h("p", { class: "muted" }, `Nothing matches "${query.trim()}". Try another word.`)));
      return;
    }
    grid.replaceChildren(
      ...list.map((p) =>
        h(
          "article",
          { class: "card product", "data-testid": `product-${p.slug}` },
          h("a", { href: ctx.link(`/shop/${p.slug}`), class: "product-art", "aria-label": `View ${p.name}` }, art(p)),
          h(
            "div",
            { class: "product-body" },
            h("h3", { class: "product-name" }, h("a", { href: ctx.link(`/shop/${p.slug}`) }, p.name)),
            h("p", { class: "price", "data-testid": "price" }, money(p.priceCents), p.soldOut ? h("span", { class: "pill pill-muted" }, "Sold out") : null),
            addButton(ctx, p, status),
          ),
        ),
      ),
    );
  };
  const syncUrl = () => {
    const u = new URL(window.location.href);
    if (query) u.searchParams.set("q", query);
    else u.searchParams.delete("q");
    if (sort !== "featured") u.searchParams.set("sort", sort);
    else u.searchParams.delete("sort");
    history.replaceState(null, "", u.pathname + u.search);
  };

  const search = h("input", { type: "search", id: "search", class: "input", placeholder: "Search mugs, bowls, vases", value: query, maxlength: 64, autocomplete: "off", "data-focus": "search" });
  search.addEventListener("input", () => {
    query = search.value;
    syncUrl();
    paint();
  });
  const select = h("select", { id: "sort", class: "input", "data-focus": "sort" }, ...SORTS.map((o) => h("option", { value: o.key, selected: o.key === sort }, o.label)));
  select.addEventListener("change", () => {
    sort = isSort(select.value) ? select.value : "featured";
    syncUrl();
    paint();
  });
  paint();

  return h(
    "div",
    {},
    storeHeader(ctx),
    h(
      "section",
      { class: "section container" },
      h("div", { class: "store-hero" }, h("div", {}, h("h1", {}, "Handmade stoneware"), h("p", { class: "lead" }, `Small-batch pieces from one studio. Free shipping on orders of ${money(FREE_SHIPPING_FROM_CENTS)} or more.`))),
      h(
        "div",
        { class: "toolbar" },
        h("label", { class: "field grow" }, h("span", { class: "label" }, "Search"), search),
        h("label", { class: "field" }, h("span", { class: "label" }, "Sort"), select),
      ),
      count,
      status,
      grid,
    ),
  );
}

function product(ctx: Ctx, params: Record<string, string>): HTMLElement {
  const p = productBySlug(params.slug ?? "");
  if (!p) {
    return h("div", {}, storeHeader(ctx), h("section", { class: "section container narrow center" }, h("h1", {}, "Product not found"), h("p", { class: "lead" }, "That item is not in the catalog."), h("a", { class: "btn btn-primary", href: ctx.link("/shop") }, "Back to the shop")));
  }
  const status = h("div", { class: "toast-region", role: "status", "aria-live": "polite" });
  const qty = h("input", { type: "number", id: "qty", class: "input qty-input", min: 1, max: 20, value: 1, inputmode: "numeric" });
  const readQty = () => {
    const n = Math.trunc(Number(qty.value));
    return Number.isFinite(n) && n >= 1 ? Math.min(20, n) : 1;
  };
  return h(
    "div",
    {},
    storeHeader(ctx),
    h(
      "section",
      { class: "section container" },
      h("p", { class: "crumbs" }, h("a", { href: ctx.link("/shop"), class: "ilink" }, "Shop"), " / ", p.name),
      h(
        "div",
        { class: "pdp" },
        h("div", { class: "pdp-art" }, art(p, 420)),
        h(
          "div",
          { class: "pdp-info" },
          h("h1", {}, p.name),
          h("p", { class: "price price-lg", "data-testid": "price" }, money(p.priceCents)),
          p.soldOut ? h("p", { class: "pill pill-muted" }, "Sold out") : null,
          h("p", { class: "lead" }, p.blurb),
          canAdd(ctx.sab, p) ? h("label", { class: "field qty-field" }, h("span", { class: "label" }, "Quantity"), qty) : null,
          addButton(ctx, p, status, readQty),
          status,
        ),
      ),
    ),
  );
}

function cartView(ctx: Ctx): HTMLElement {
  const c = ctx.cart();
  const t = totals(ctx.sab, c);
  if (c.lines.length === 0) {
    return h(
      "div",
      {},
      storeHeader(ctx),
      h("section", { class: "section container narrow center" }, h("h1", {}, "Your cart is empty"), h("p", { class: "lead" }, "Add something from the shop to get started."), h("a", { class: "btn btn-primary", href: ctx.link("/shop") }, "Browse the shop")),
    );
  }
  const promoMsg = h("p", { class: "small", role: "status", "aria-live": "polite", "data-testid": "promo-message" });
  if (c.promo) {
    promoMsg.className = "small ok";
    promoMsg.textContent = `Code ${c.promo} applied: ${PROMO_PERCENT}% off your items.`;
  }
  const promoInput = h("input", { id: "promo", class: "input", placeholder: "Promo code", maxlength: 20, autocomplete: "off", "data-focus": "promo" });
  const promoForm = h("form", { class: "promo", novalidate: true }, h("label", { class: "field grow" }, h("span", { class: "label" }, "Promo code"), promoInput), h("button", { class: "btn", type: "submit" }, "Apply"));
  promoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = applyPromo(ctx.cart(), promoInput.value);
    if (!r.ok) {
      promoMsg.className = "small err";
      promoMsg.textContent = "That code is not valid.";
      return;
    }
    ctx.setCart(r.cart);
    ctx.refresh();
  });

  const rows = c.lines.map((l) => {
    const p = productBySlug(l.slug);
    if (!p) return null;
    const minus = h("button", { class: "icon-btn qty-btn", type: "button", "aria-label": `Decrease ${p.name}`, "data-focus": `minus-${p.slug}` }, "−");
    const plus = h("button", { class: "icon-btn qty-btn", type: "button", "aria-label": `Increase ${p.name}`, "data-focus": `plus-${p.slug}` }, "+");
    const remove = h("button", { class: "link-btn", type: "button", "aria-label": `Remove ${p.name}` }, "Remove");
    minus.addEventListener("click", () => {
      ctx.setCart(setQty(ctx.sab, ctx.cart(), p.slug, l.qty - 1));
      ctx.refresh();
    });
    plus.addEventListener("click", () => {
      ctx.setCart(setQty(ctx.sab, ctx.cart(), p.slug, l.qty + 1, true));
      ctx.refresh();
    });
    remove.addEventListener("click", () => {
      ctx.setCart(removeLine(ctx.sab, ctx.cart(), p.slug));
      ctx.refresh();
    });
    return h(
      "li",
      { class: "line", "data-testid": `line-${p.slug}` },
      h("a", { href: ctx.link(`/shop/${p.slug}`), class: "line-art", "aria-hidden": "true", tabindex: "-1" }, art(p, 72)),
      h("div", { class: "line-main" }, h("a", { href: ctx.link(`/shop/${p.slug}`), class: "line-name" }, p.name), h("span", { class: "muted small" }, `${money(p.priceCents)} each`), remove),
      h("div", { class: "stepper", role: "group", "aria-label": `Quantity of ${p.name}` }, minus, h("span", { class: "qty", "data-testid": `qty-${p.slug}` }, String(l.qty)), plus),
      h("span", { class: "line-total" }, money(totals(ctx.sab, { lines: [l], promo: null }).subtotal)),
    );
  });

  return h(
    "div",
    {},
    storeHeader(ctx),
    h(
      "section",
      { class: "section container" },
      h("h1", {}, "Your cart"),
      h(
        "div",
        { class: "cart-layout" },
        h("ul", { class: "lines card" }, ...rows),
        h("aside", { class: "card summary" }, h("h2", { class: "h3" }, "Order summary"), summaryTable(t), promoForm, promoMsg, shippingNote(t.subtotal), h("a", { class: "btn btn-primary btn-block", href: ctx.link("/checkout") }, "Checkout")),
      ),
    ),
  );
}

function shippingNote(subtotal: number): HTMLElement {
  const left = FREE_SHIPPING_FROM_CENTS - subtotal;
  return h("p", { class: "muted small" }, left > 0 ? `Add ${money(left)} more for free shipping.` : "Your order ships free.");
}

function summaryTable(t: ReturnType<typeof totals>): HTMLElement {
  const row = (k: string, v: string, id: string, strong = false) => h("div", { class: `sum-row${strong ? " sum-total" : ""}` }, h("dt", {}, k), h("dd", { "data-testid": id }, v));
  return h(
    "dl",
    { class: "sum" },
    row("Subtotal", money(t.subtotal), "subtotal"),
    row("Discount", t.discount > 0 ? `-${money(t.discount)}` : money(0), "discount"),
    row("Shipping", t.shipping === 0 ? "Free" : money(t.shipping), "shipping"),
    row("Total", money(t.total), "total", true),
  );
}

const FIELDS: readonly { key: keyof CheckoutForm; label: string; type: string; auto: string }[] = [
  { key: "name", label: "Full name", type: "text", auto: "name" },
  { key: "email", label: "Email", type: "email", auto: "email" },
  { key: "address", label: "Street address", type: "text", auto: "street-address" },
  { key: "postcode", label: "Postal code", type: "text", auto: "postal-code" },
];

function checkout(ctx: Ctx): HTMLElement {
  const c = ctx.cart();
  if (c.lines.length === 0) {
    return h("div", {}, storeHeader(ctx), h("section", { class: "section container narrow center" }, h("h1", {}, "Nothing to check out"), h("p", { class: "lead" }, "Your cart is empty."), h("a", { class: "btn btn-primary", href: ctx.link("/shop") }, "Browse the shop")));
  }
  const t = totals(ctx.sab, c);
  const inputs = new Map<keyof CheckoutForm, HTMLInputElement>();
  const errors = new Map<keyof CheckoutForm, HTMLElement>();
  const formAlert = h("div", { class: "form-alert", role: "alert" });
  const fields = FIELDS.map((f) => {
    const input = h("input", { id: `f-${f.key}`, name: f.key, type: f.type === "email" ? "text" : f.type, inputmode: f.type === "email" ? "email" : null, class: "input", autocomplete: f.auto, maxlength: 120, "aria-describedby": `e-${f.key}` });
    const err = h("p", { class: "field-error", id: `e-${f.key}` });
    inputs.set(f.key, input);
    errors.set(f.key, err);
    return h("label", { class: "field" }, h("span", { class: "label" }, f.label), input, err);
  });
  const form = h("form", { class: "card checkout-form", novalidate: true, "aria-label": "Shipping details" }, h("h2", { class: "h3" }, "Shipping details"), formAlert, ...fields, h("button", { class: "btn btn-primary btn-block", type: "submit" }, `Place order · ${money(t.total)}`));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (ctx.sab.isOn("place-order-dead")) return;
    const data: CheckoutForm = { name: inputs.get("name")?.value ?? "", email: inputs.get("email")?.value ?? "", address: inputs.get("address")?.value ?? "", postcode: inputs.get("postcode")?.value ?? "" };
    const errs: FieldErrors = validateCheckout(ctx.sab, data);
    let first: HTMLInputElement | undefined;
    for (const f of FIELDS) {
      const msg = errs[f.key];
      const input = inputs.get(f.key);
      errors.get(f.key)!.textContent = msg ?? "";
      input?.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = input;
    }
    if (first) {
      formAlert.textContent = "Please fix the highlighted fields.";
      first.focus();
      return;
    }
    const order = placeOrder(ctx.sab, ctx.cart(), data, newOrderId((n) => crypto.getRandomValues(new Uint8Array(n))));
    saveOrder(ctx.kv, order);
    ctx.setCart({ lines: [], promo: null });
    ctx.go(`/order/${order.id}`);
  });
  return h(
    "div",
    {},
    storeHeader(ctx),
    h(
      "section",
      { class: "section container" },
      h("h1", {}, "Checkout"),
      h("div", { class: "cart-layout" }, form, h("aside", { class: "card summary" }, h("h2", { class: "h3" }, "Your order"), h("ul", { class: "mini-lines" }, ...c.lines.map((l) => h("li", {}, h("span", {}, `${productBySlug(l.slug)?.name ?? l.slug} × ${l.qty}`)))), summaryTable(t))),
    ),
  );
}

function order(ctx: Ctx, params: Record<string, string>): HTMLElement {
  const id = params.id ?? "";
  const o = ORDER_ID_RE.test(id) ? loadOrders(ctx.kv).find((x) => x.id === id) : undefined;
  if (!o) {
    return h("div", {}, storeHeader(ctx), h("section", { class: "section container narrow center" }, h("h1", {}, "Order not found"), h("p", { class: "lead" }, "We could not find that order on this device."), h("a", { class: "btn btn-primary", href: ctx.link("/shop") }, "Back to the shop")));
  }
  return h(
    "div",
    {},
    storeHeader(ctx),
    h(
      "section",
      { class: "section container narrow" },
      h("div", { class: "card confirm" }, h("p", { class: "eyebrow ok" }, "Order placed"), h("h1", {}, `Thank you, ${o.name}`), h("p", { class: "lead" }, `Order ${o.id}. A receipt would go to ${o.email}; this is a demo store, so nothing is charged or sent.`),
        h("ul", { class: "mini-lines" }, ...o.lines.map((l) => h("li", {}, `${productBySlug(l.slug)?.name ?? l.slug} × ${l.qty}`))),
        h("h2", { class: "h3" }, "Receipt"),
        h(
          "dl",
          { class: "sum receipt", "data-testid": "receipt" },
          h("div", { class: "sum-row" }, h("dt", {}, "Subtotal"), h("dd", { "data-testid": "receipt-subtotal" }, money(o.totals.subtotal))),
          h("div", { class: "sum-row" }, h("dt", {}, "Discount"), h("dd", { "data-testid": "receipt-discount" }, o.totals.discount > 0 ? `-${money(o.totals.discount)}` : money(0))),
          h("div", { class: "sum-row" }, h("dt", {}, "Shipping"), h("dd", { "data-testid": "receipt-shipping" }, o.totals.shipping === 0 ? "Free" : money(o.totals.shipping))),
        ),
        h("p", { class: "confirm-total" }, "Total charged ", h("strong", { "data-testid": "order-total" }, money(o.shownTotal))),
        h("a", { class: "btn btn-primary", href: ctx.link("/shop") }, "Keep shopping"),
      ),
    ),
  );
}

route("/shop", "Shop", shop, true);
route("/shop/:slug", "Product", product, true);
route("/cart", "Cart", cartView, true);
route("/checkout", "Checkout", checkout, true);
route("/order/:id", "Order placed", order, true);
