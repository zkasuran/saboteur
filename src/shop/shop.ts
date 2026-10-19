// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/**
 * Kiln, the demo store. Pure functions over integer cents, so every rule (and every planted fault) is
 * unit-tested without a browser. Each `sab.isOn(...)` marks the one line a fault changes.
 */
import type { Saboteur } from "../saboteur/catalog";

export interface Product {
  readonly slug: string;
  readonly name: string;
  readonly priceCents: number;
  readonly soldOut: boolean;
  readonly blurb: string;
  /** Hue for the generated product art. */
  readonly hue: number;
}

export const PRODUCTS: readonly Product[] = [
  { slug: "speckled-mug", name: "Speckled Mug", priceCents: 1850, soldOut: false, hue: 28, blurb: "Wheel-thrown stoneware mug, 350 ml, oatmeal glaze with iron speckle." },
  { slug: "pour-over-dripper", name: "Pour-Over Dripper", priceCents: 3200, soldOut: false, hue: 200, blurb: "Single-cup dripper with spiral ribs. Fits standard #2 filters." },
  { slug: "stoneware-bowl", name: "Stoneware Bowl", priceCents: 2500, soldOut: false, hue: 150, blurb: "Everyday bowl, 16 cm across, celadon inside and raw clay outside." },
  { slug: "bud-vase", name: "Bud Vase", priceCents: 1475, soldOut: false, hue: 330, blurb: "A narrow-neck vase for one stem, 12 cm tall." },
  { slug: "serving-platter", name: "Serving Platter", priceCents: 4600, soldOut: false, hue: 45, blurb: "Oval platter, 34 cm, with a wide rim for sharing plates." },
  { slug: "tea-cup-set", name: "Tea Cup Set", priceCents: 3800, soldOut: true, hue: 265, blurb: "Four handleless cups in a cedar box. Back in the next firing." },
  { slug: "spoon-rest", name: "Spoon Rest", priceCents: 925, soldOut: false, hue: 10, blurb: "Keeps the counter clean beside the stove. Dishwasher safe." },
  { slug: "planter", name: "Planter", priceCents: 2750, soldOut: false, hue: 95, blurb: "Planter with a drainage hole and saucer, 14 cm." },
];

export const SHIPPING_CENTS = 600;
export const FREE_SHIPPING_FROM_CENTS = 5000;
export const PROMO_CODE = "SAVE10";
export const PROMO_PERCENT = 10;
export const MAX_QTY = 20;
export const MAX_LINES = PRODUCTS.length;

export function productBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export interface Line {
  readonly slug: string;
  readonly qty: number;
}

export interface Cart {
  readonly lines: readonly Line[];
  readonly promo: string | null;
}

export const EMPTY_CART: Cart = { lines: [], promo: null };

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export function listProducts(sab: Saboteur, query: string, sort: SortKey): Product[] {
  const q = query.trim().slice(0, 64);
  let out = PRODUCTS.filter((p) =>
    q === "" ? true : sab.isOn("search-case-sensitive") ? p.name.includes(q) : p.name.toLowerCase().includes(q.toLowerCase()),
  );
  const byPrice = (a: Product, b: Product) => a.priceCents - b.priceCents;
  if (sort === "price-asc") out = [...out].sort(sab.isOn("sort-reversed") ? (a, b) => byPrice(b, a) : byPrice);
  else if (sort === "price-desc") out = [...out].sort((a, b) => byPrice(b, a));
  else if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export type AddResult = { ok: true; cart: Cart } | { ok: false; reason: "sold-out" | "unknown" | "max-qty" };

export function canAdd(sab: Saboteur, p: Product): boolean {
  return !p.soldOut || sab.isOn("sold-out-addable");
}

export function addToCart(sab: Saboteur, cart: Cart, slug: string, qty = 1): AddResult {
  const p = productBySlug(slug);
  if (!p) return { ok: false, reason: "unknown" };
  if (!canAdd(sab, p)) return { ok: false, reason: "sold-out" };
  const existing = cart.lines.find((l) => l.slug === slug);
  if (existing) {
    if (existing.qty + qty > MAX_QTY) return { ok: false, reason: "max-qty" };
    return { ok: true, cart: { ...cart, lines: cart.lines.map((l) => (l.slug === slug ? { slug, qty: l.qty + qty } : l)) } };
  }
  if (qty > MAX_QTY) return { ok: false, reason: "max-qty" };
  return { ok: true, cart: { ...cart, lines: [...cart.lines, { slug, qty }] } };
}

export function setQty(sab: Saboteur, cart: Cart, slug: string, qty: number, viaPlus = false): Cart {
  if (viaPlus && sab.isOn("qty-plus-noop")) return cart;
  const n = Math.max(0, Math.min(MAX_QTY, Math.trunc(qty)));
  if (n === 0) return removeLine(sab, cart, slug);
  return { ...cart, lines: cart.lines.map((l) => (l.slug === slug ? { slug, qty: n } : l)) };
}

export function removeLine(sab: Saboteur, cart: Cart, slug: string): Cart {
  if (sab.isOn("remove-wrong-item") && cart.lines.length > 1) {
    return { ...cart, lines: cart.lines.slice(1) };
  }
  return { ...cart, lines: cart.lines.filter((l) => l.slug !== slug) };
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0);
}

export type PromoResult = { ok: true; cart: Cart } | { ok: false; reason: "invalid" };

export function applyPromo(cart: Cart, code: string): PromoResult {
  const c = code.trim().toUpperCase();
  if (c !== PROMO_CODE) return { ok: false, reason: "invalid" };
  return { ok: true, cart: { ...cart, promo: PROMO_CODE } };
}

export interface Totals {
  readonly subtotal: number;
  readonly discount: number;
  readonly shipping: number;
  readonly total: number;
}

export function totals(sab: Saboteur, cart: Cart): Totals {
  let subtotal = 0;
  for (const l of cart.lines) {
    const p = productBySlug(l.slug);
    if (!p) continue;
    const unit = sab.isOn("subtotal-drops-cents") ? Math.floor(p.priceCents / 100) * 100 : p.priceCents;
    subtotal += unit * l.qty;
  }
  const discount = cart.promo === PROMO_CODE && !sab.isOn("promo-ignored") ? Math.round((subtotal * PROMO_PERCENT) / 100) : 0;
  const free = sab.isOn("free-shipping-boundary") ? subtotal > FREE_SHIPPING_FROM_CENTS : subtotal >= FREE_SHIPPING_FROM_CENTS;
  const shipping = subtotal === 0 || free ? 0 : SHIPPING_CENTS;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface CheckoutForm {
  readonly name: string;
  readonly email: string;
  readonly address: string;
  readonly postcode: string;
}

export type FieldErrors = Partial<Record<keyof CheckoutForm, string>>;

export const FIELD_MAX = 120;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
const POSTCODE_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

export function validateCheckout(sab: Saboteur, f: CheckoutForm): FieldErrors {
  const e: FieldErrors = {};
  const name = f.name.trim();
  const email = f.email.trim();
  if (name.length < 2) e.name = "Enter your full name.";
  else if (name.length > FIELD_MAX) e.name = "That name is too long.";
  if (email === "") e.email = "Enter your email address.";
  else if (!sab.isOn("email-accepts-invalid") && !EMAIL_RE.test(email)) e.email = "Enter a valid email address, like you@example.com.";
  if (f.address.trim().length < 5) e.address = "Enter a street address.";
  else if (f.address.length > FIELD_MAX) e.address = "That address is too long.";
  if (!POSTCODE_RE.test(f.postcode.trim())) e.postcode = "Enter a postal code (3 to 10 letters or digits).";
  return e;
}

export interface Order {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly lines: readonly Line[];
  readonly totals: Totals;
  /** The amount printed on the confirmation page. */
  readonly shownTotal: number;
}

export function placeOrder(sab: Saboteur, cart: Cart, form: CheckoutForm, id: string): Order {
  const t = totals(sab, cart);
  return {
    id,
    name: form.name.trim(),
    email: form.email.trim(),
    lines: cart.lines,
    totals: t,
    shownTotal: sab.isOn("confirmation-wrong-total") ? t.subtotal : t.total,
  };
}
