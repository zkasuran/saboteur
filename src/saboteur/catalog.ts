// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/**
 * The fault catalog. Each fault is one realistic regression a coding agent could ship, planted behind a
 * flag so the same deploy can run clean or broken. URLs carry the opaque code (`/x/m07/`), never the
 * name, so an AI tester exploring a sabotaged build cannot read the bug off the address bar.
 */

export type FaultArea = "pricing" | "cart" | "catalog" | "checkout" | "navigation";

export interface Fault {
  /** Opaque code used in URLs and TestSprite environment names. */
  readonly code: string;
  /** Stable machine id used in code (`isOn("promo-ignored")`). */
  readonly id: FaultId;
  readonly title: string;
  readonly area: FaultArea;
  /** What the user would see. */
  readonly symptom: string;
  /** The assertion a test needs to catch it. */
  readonly killedBy: string;
}

export const FAULT_IDS = [
  "subtotal-drops-cents",
  "promo-ignored",
  "badge-stale",
  "qty-plus-noop",
  "remove-wrong-item",
  "search-case-sensitive",
  "email-accepts-invalid",
  "free-shipping-boundary",
  "place-order-dead",
  "confirmation-wrong-total",
  "sold-out-addable",
  "cart-link-404",
  "cart-forgets",
  "sort-reversed",
] as const;

export type FaultId = (typeof FAULT_IDS)[number];

export const FAULTS: readonly Fault[] = [
  {
    code: "m01",
    id: "subtotal-drops-cents",
    title: "Subtotal drops the cents",
    area: "pricing",
    symptom: "Three mugs at $18.50 show a subtotal of $54.00 instead of $55.50.",
    killedBy: "An exact assertion on the cart subtotal for an item with a non-zero cents price.",
  },
  {
    code: "m02",
    id: "promo-ignored",
    title: "Promo code says applied, total unchanged",
    area: "pricing",
    symptom: "SAVE10 shows a green \"applied\" note but the discount line stays at $0.00.",
    killedBy: "Asserting the discount amount or the total after applying a code, not just the success message.",
  },
  {
    code: "m03",
    id: "badge-stale",
    title: "Cart badge never updates",
    area: "cart",
    symptom: "The header badge stays at 0 after adding items, although the cart page is right.",
    killedBy: "Asserting the header cart count right after Add to cart.",
  },
  {
    code: "m04",
    id: "qty-plus-noop",
    title: "Quantity plus button does nothing",
    area: "cart",
    symptom: "Clicking + on a cart line leaves the quantity where it was.",
    killedBy: "Incrementing a quantity in the cart and asserting the new quantity or line total.",
  },
  {
    code: "m05",
    id: "remove-wrong-item",
    title: "Remove deletes the wrong line",
    area: "cart",
    symptom: "Removing the second item in the cart removes the first one instead.",
    killedBy: "A cart with two different items, removing one, then asserting which item remains.",
  },
  {
    code: "m06",
    id: "search-case-sensitive",
    title: "Search became case-sensitive",
    area: "catalog",
    symptom: "Searching \"mug\" finds nothing; only \"Mug\" works.",
    killedBy: "Searching in lower case and asserting the matching product is listed.",
  },
  {
    code: "m07",
    id: "email-accepts-invalid",
    title: "Checkout accepts an invalid email",
    area: "checkout",
    symptom: "\"not-an-email\" passes validation and the order goes through.",
    killedBy: "A negative test: an invalid email must block the order with an error.",
  },
  {
    code: "m08",
    id: "free-shipping-boundary",
    title: "Free shipping off by one at $50.00",
    area: "pricing",
    symptom: "An order of exactly $50.00 is charged $6.00 shipping although $50.00 or more ships free.",
    killedBy: "A boundary test at exactly $50.00 (two stoneware bowls) asserting free shipping.",
  },
  {
    code: "m09",
    id: "place-order-dead",
    title: "Place order button does nothing",
    area: "checkout",
    symptom: "A valid form plus Place order leaves the shopper on the checkout page.",
    killedBy: "An end-to-end checkout asserting the confirmation page appears.",
  },
  {
    code: "m10",
    id: "confirmation-wrong-total",
    title: "Confirmation shows the wrong total",
    area: "checkout",
    symptom: "The thank-you page shows the subtotal, leaving out shipping and discount.",
    killedBy: "Asserting the amount on the confirmation page equals the cart total.",
  },
  {
    code: "m11",
    id: "sold-out-addable",
    title: "Sold-out item can be added",
    area: "catalog",
    symptom: "The sold-out tea cup set still has a working Add to cart button.",
    killedBy: "Asserting that a sold-out product cannot be added to the cart.",
  },
  {
    code: "m12",
    id: "cart-link-404",
    title: "Header cart link is broken",
    area: "navigation",
    symptom: "The Cart link in the store header leads to a not-found page.",
    killedBy: "Reaching the cart by clicking the header link, not by typing the URL.",
  },
  {
    code: "m13",
    id: "cart-forgets",
    title: "Cart is lost on reload",
    area: "cart",
    symptom: "Reloading the page empties the cart.",
    killedBy: "Adding an item, reloading, and asserting the cart still holds it.",
  },
  {
    code: "m14",
    id: "sort-reversed",
    title: "Sort by price runs backwards",
    area: "catalog",
    symptom: "\"Price: low to high\" lists the most expensive item first.",
    killedBy: "Sorting by price and asserting the order of the first items.",
  },
];

const BY_CODE = new Map(FAULTS.map((f) => [f.code, f]));
const BY_ID = new Map(FAULTS.map((f) => [f.id, f]));

export function faultByCode(code: string): Fault | undefined {
  return BY_CODE.get(code);
}

export function faultById(id: string): Fault | undefined {
  return BY_ID.get(id as FaultId);
}

/** Fault codes are exactly `m` plus two digits. Anything else is rejected before a lookup. */
const CODE_RE = /^m\d{2}$/;
const PREFIX_RE = /^\/x\/([^/]{1,8})(?=\/|$)/;

export interface Located {
  /** The active fault, or null for a clean build. */
  readonly fault: Fault | null;
  /** Path prefix to keep on every in-app link ("" or "/x/m07"). */
  readonly base: string;
  /** The route path with the prefix removed, always starting with "/". */
  readonly path: string;
  /** True when the URL asked for a fault code we do not know. */
  readonly unknownCode: boolean;
}

/** Resolve the active fault and the route from a pathname and query string. Pure, so it is unit-tested. */
export function locate(pathname: string, search = ""): Located {
  const raw = pathname.length > 2048 ? pathname.slice(0, 2048) : pathname;
  const m = PREFIX_RE.exec(raw);
  if (m) {
    const code = (m[1] ?? "").toLowerCase();
    const fault = CODE_RE.test(code) ? (faultByCode(code) ?? null) : null;
    const rest = raw.slice(m[0].length) || "/";
    return { fault, base: fault ? `/x/${code}` : "", path: normalisePath(rest), unknownCode: fault === null };
  }
  const q = new URLSearchParams(search).get("fault");
  if (q !== null) {
    const code = q.trim().toLowerCase();
    const fault = CODE_RE.test(code) ? (faultByCode(code) ?? null) : null;
    return { fault, base: fault ? `/x/${code}` : "", path: normalisePath(raw), unknownCode: fault === null };
  }
  return { fault: null, base: "", path: normalisePath(raw), unknownCode: false };
}

function normalisePath(p: string): string {
  let out = p.startsWith("/") ? p : `/${p}`;
  out = out.replace(/\/{2,}/g, "/");
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/** The runtime switch. The app calls `isOn("promo-ignored")` at the exact line the bug lives on. */
export class Saboteur {
  constructor(private readonly active: Fault | null) {}
  isOn(id: FaultId): boolean {
    return this.active?.id === id;
  }
  get fault(): Fault | null {
    return this.active;
  }
}
