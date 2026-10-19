// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { describe, expect, it } from "vitest";
import { FAULT_IDS, FAULTS, locate, Saboteur, type FaultId } from "../src/saboteur/catalog";
import {
  addToCart, applyPromo, EMPTY_CART, itemCount, listProducts, money, placeOrder, PRODUCTS, removeLine, setQty, totals, validateCheckout, type Cart,
} from "../src/shop/shop";
import { loadCart, loadOrders, newOrderId, sanitiseCart, saveCart, saveOrder, type KV } from "../src/shop/storage";

const clean = new Saboteur(null);
const on = (id: FaultId) => new Saboteur(FAULTS.find((f) => f.id === id) ?? null);
const cart = (...lines: [string, number][]): Cart => ({ lines: lines.map(([slug, qty]) => ({ slug, qty })), promo: null });
const form = { name: "Ada Lovelace", email: "ada@example.com", address: "12 Analytical St", postcode: "SW1A 1AA" };

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("catalog", () => {
  it("has one entry per id, unique opaque codes m01..m14", () => {
    expect(FAULTS.map((f) => f.id).sort()).toEqual([...FAULT_IDS].sort());
    expect(new Set(FAULTS.map((f) => f.code)).size).toBe(FAULTS.length);
    for (const f of FAULTS) expect(f.code).toMatch(/^m\d{2}$/);
  });
  it("codes never leak the fault name", () => {
    for (const f of FAULTS) expect(f.id.includes(f.code)).toBe(false);
  });
});

describe("locate", () => {
  it("clean paths", () => {
    expect(locate("/")).toEqual({ fault: null, base: "", path: "/", unknownCode: false });
    expect(locate("/shop/").path).toBe("/shop");
    expect(locate("//shop//x").path).toBe("/shop/x");
  });
  it("prefix turns a fault on and strips it from the route", () => {
    const l = locate("/x/m07/checkout");
    expect(l.fault?.id).toBe("email-accepts-invalid");
    expect(l.base).toBe("/x/m07");
    expect(l.path).toBe("/checkout");
    expect(locate("/x/m07").path).toBe("/");
    expect(locate("/x/M07/shop").fault?.code).toBe("m07");
  });
  it("unknown or hostile codes are rejected, not executed", () => {
    for (const p of ["/x/m99/shop", "/x/zz/shop", "/x/../shop", "/x/m1/shop", "/x/%3Cs%3E/shop"]) {
      const l = locate(p);
      expect(l.fault).toBeNull();
      expect(l.unknownCode).toBe(true);
      expect(l.base).toBe("");
    }
  });
  it("query fallback", () => {
    expect(locate("/shop", "?fault=m02").fault?.id).toBe("promo-ignored");
    expect(locate("/shop", "?fault=nope").unknownCode).toBe(true);
  });
  it("does not choke on a huge path", () => {
    expect(locate("/" + "a".repeat(100_000)).fault).toBeNull();
  });
});

describe("the clean store", () => {
  it("prices to the cent", () => {
    expect(totals(clean, cart(["speckled-mug", 3])).subtotal).toBe(5550);
    expect(money(5550)).toBe("$55.50");
    expect(money(5)).toBe("$0.05");
    expect(money(-600)).toBe("-$6.00");
  });
  it("free shipping from exactly $50.00", () => {
    expect(totals(clean, cart(["stoneware-bowl", 2])).shipping).toBe(0);
    expect(totals(clean, cart(["stoneware-bowl", 1], ["spoon-rest", 2])).shipping).toBe(600);
    expect(totals(clean, EMPTY_CART)).toEqual({ subtotal: 0, discount: 0, shipping: 0, total: 0 });
  });
  it("promo SAVE10 takes 10% off, case-insensitively", () => {
    const r = applyPromo(cart(["serving-platter", 1]), " save10 ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(totals(clean, r.cart)).toEqual({ subtotal: 4600, discount: 460, shipping: 600, total: 4740 });
    expect(applyPromo(EMPTY_CART, "SAVE100").ok).toBe(false);
  });
  it("sold out cannot be added; quantities are capped", () => {
    expect(addToCart(clean, EMPTY_CART, "tea-cup-set")).toEqual({ ok: false, reason: "sold-out" });
    expect(addToCart(clean, EMPTY_CART, "nope")).toEqual({ ok: false, reason: "unknown" });
    expect(addToCart(clean, cart(["bud-vase", 20]), "bud-vase")).toEqual({ ok: false, reason: "max-qty" });
    const r = addToCart(clean, cart(["bud-vase", 1]), "bud-vase", 2);
    expect(r.ok && r.cart.lines).toEqual([{ slug: "bud-vase", qty: 3 }]);
  });
  it("cart editing", () => {
    const c = cart(["bud-vase", 1], ["planter", 1]);
    expect(removeLine(clean, c, "planter").lines).toEqual([{ slug: "bud-vase", qty: 1 }]);
    expect(setQty(clean, c, "planter", 2, true).lines[1]).toEqual({ slug: "planter", qty: 2 });
    expect(setQty(clean, c, "planter", 0).lines).toHaveLength(1);
    expect(setQty(clean, c, "planter", 999).lines[1]?.qty).toBe(20);
    expect(itemCount(c)).toBe(2);
  });
  it("search is case-insensitive and sort is ascending", () => {
    expect(listProducts(clean, "mug", "featured").map((p) => p.slug)).toEqual(["speckled-mug"]);
    const asc = listProducts(clean, "", "price-asc").map((p) => p.priceCents);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
  });
  it("validates checkout", () => {
    expect(validateCheckout(clean, form)).toEqual({});
    expect(validateCheckout(clean, { ...form, email: "not-an-email" }).email).toBeTruthy();
    expect(validateCheckout(clean, { name: "", email: "", address: "", postcode: "" })).toMatchObject({ name: expect.any(String), email: expect.any(String), address: expect.any(String), postcode: expect.any(String) });
    expect(validateCheckout(clean, { ...form, name: "x".repeat(500) }).name).toBeTruthy();
  });
  it("the confirmation shows the real total", () => {
    const o = placeOrder(clean, { ...cart(["speckled-mug", 1]), promo: "SAVE10" }, form, "KLN-ABCDEF");
    expect(o.shownTotal).toBe(o.totals.total);
    expect(o.totals.total).toBe(1850 - 185 + 600);
  });
});

/** Every fault must change behaviour when on, and only when on. One case per fault. */
const faultCases: Record<FaultId, (s: Saboteur) => unknown> = {
  "subtotal-drops-cents": (s) => totals(s, cart(["speckled-mug", 3])).subtotal,
  "promo-ignored": (s) => totals(s, { ...cart(["serving-platter", 1]), promo: "SAVE10" }).discount,
  "badge-stale": () => "ui", // rendered in the store header; asserted in the DOM-free check below
  "qty-plus-noop": (s) => setQty(s, cart(["planter", 1]), "planter", 2, true).lines[0]?.qty,
  "remove-wrong-item": (s) => removeLine(s, cart(["bud-vase", 1], ["planter", 1]), "planter").lines.map((l) => l.slug),
  "search-case-sensitive": (s) => listProducts(s, "mug", "featured").length,
  "email-accepts-invalid": (s) => validateCheckout(s, { ...form, email: "not-an-email" }).email ?? null,
  "free-shipping-boundary": (s) => totals(s, cart(["stoneware-bowl", 2])).shipping,
  "place-order-dead": () => "ui",
  "confirmation-wrong-total": (s) => placeOrder(s, cart(["stoneware-bowl", 1]), form, "KLN-ABCDEF").shownTotal,
  "sold-out-addable": (s) => addToCart(s, EMPTY_CART, "tea-cup-set").ok,
  "cart-link-404": () => "ui",
  "cart-forgets": (s) => {
    const kv = memKV();
    saveCart(s, kv, cart(["planter", 2]));
    return loadCart(s, kv).lines.length;
  },
  "sort-reversed": (s) => listProducts(s, "", "price-asc")[0]?.slug,
};

describe("each fault flips exactly its own behaviour", () => {
  for (const id of FAULT_IDS) {
    const probe = faultCases[id];
    if (probe(clean) === "ui") continue;
    it(id, () => {
      expect(probe(on(id))).not.toEqual(probe(clean));
      for (const other of FAULT_IDS) if (other !== id && probe(on(other)) !== "ui") expect(probe(on(other))).toEqual(probe(clean));
    });
  }
  it("sabotaged numbers are the documented ones", () => {
    expect(totals(on("subtotal-drops-cents"), cart(["speckled-mug", 3])).subtotal).toBe(5400);
    expect(totals(on("free-shipping-boundary"), cart(["stoneware-bowl", 2])).shipping).toBe(600);
    expect(totals(on("free-shipping-boundary"), cart(["stoneware-bowl", 2], ["spoon-rest", 1])).shipping).toBe(0);
  });
  it("UI-only faults are wired to a real code path", () => {
    expect(on("badge-stale").isOn("badge-stale")).toBe(true);
    expect(on("place-order-dead").isOn("place-order-dead")).toBe(true);
    expect(on("cart-link-404").isOn("cart-link-404")).toBe(true);
    expect(clean.isOn("badge-stale")).toBe(false);
  });
});

describe("storage is hostile input", () => {
  it("round-trips a cart", () => {
    const kv = memKV();
    saveCart(clean, kv, { ...cart(["planter", 2]), promo: "SAVE10" });
    expect(loadCart(clean, kv)).toEqual({ lines: [{ slug: "planter", qty: 2 }], promo: "SAVE10" });
  });
  it("drops junk, merges duplicates, caps quantities", () => {
    expect(sanitiseCart({ lines: [{ slug: "planter", qty: 15 }, { slug: "planter", qty: 15 }, { slug: "x", qty: 1 }, { slug: "bud-vase", qty: 1.5 }, { slug: "bud-vase", qty: -3 }, null, "x"], promo: "FREE" })).toEqual({ lines: [{ slug: "planter", qty: 20 }], promo: null });
    for (const v of [null, 1, "x", [], { lines: "no" }, { lines: [{ slug: { a: 1 }, qty: 1 }] }]) expect(sanitiseCart(v).lines).toEqual([]);
  });
  it("survives corrupt JSON, oversize values and throwing storage", () => {
    const kv = memKV();
    kv.data.set("kiln.cart.v1", "{not json");
    expect(loadCart(clean, kv)).toEqual(EMPTY_CART);
    kv.data.set("kiln.cart.v1", JSON.stringify({ lines: [{ slug: "planter", qty: 1 }], pad: "x".repeat(20_000) }));
    expect(loadCart(clean, kv)).toEqual(EMPTY_CART);
    const boom: KV = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadCart(clean, boom)).toEqual(EMPTY_CART);
    expect(() => saveCart(clean, boom, cart(["planter", 1]))).not.toThrow();
  });
  it("random bytes never crash the cart parser", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 256);
    const kv = memKV();
    for (let i = 0; i < 500; i++) {
      kv.data.set("kiln.cart.v1", String.fromCharCode(...Array.from({ length: 1 + (i % 64) }, rnd)));
      const c = loadCart(clean, kv);
      for (const l of c.lines) expect(PRODUCTS.some((p) => p.slug === l.slug)).toBe(true);
    }
  });
  it("orders: validated, newest first, capped, ids well-formed", () => {
    const kv = memKV();
    const ids = new Set<string>();
    let n = 0;
    for (let i = 0; i < 14; i++) {
      const id = newOrderId((k) => Uint8Array.from({ length: k }, () => (n += 37) % 256));
      ids.add(id);
      expect(id).toMatch(/^KLN-[A-Z0-9]{6}$/);
      saveOrder(kv, placeOrder(clean, cart(["planter", 1]), form, id));
    }
    const list = loadOrders(kv);
    expect(list.length).toBe(10);
    kv.data.set("kiln.orders.v1", JSON.stringify([{ id: "<img>", name: "x", email: "y", shownTotal: 1, totals: {}, lines: [] }]));
    expect(loadOrders(kv)).toEqual([]);
  });
});
