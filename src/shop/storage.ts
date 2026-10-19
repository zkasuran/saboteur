// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/** Browser storage is user-editable, so everything read back is parsed defensively and re-validated. */
import type { Saboteur } from "../saboteur/catalog";
import { EMPTY_CART, MAX_LINES, MAX_QTY, PROMO_CODE, productBySlug, type Cart, type Line, type Order } from "./shop";

const CART_KEY = "kiln.cart.v1";
const ORDER_KEY = "kiln.orders.v1";
const MAX_RAW = 8 * 1024;
const MAX_ORDERS = 10;
export const ORDER_ID_RE = /^KLN-[A-Z0-9]{6}$/;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function safeParse(raw: string | null): unknown {
  if (raw === null || raw.length > MAX_RAW) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keep only lines naming a real product with a sane integer quantity; merge duplicates. */
export function sanitiseCart(v: unknown): Cart {
  if (!isRecord(v) || !Array.isArray(v.lines)) return EMPTY_CART;
  const merged = new Map<string, number>();
  for (const l of v.lines.slice(0, MAX_LINES * 2)) {
    if (!isRecord(l) || typeof l.slug !== "string" || typeof l.qty !== "number") continue;
    if (!Number.isInteger(l.qty) || l.qty < 1 || !productBySlug(l.slug)) continue;
    merged.set(l.slug, Math.min(MAX_QTY, (merged.get(l.slug) ?? 0) + l.qty));
  }
  const lines: Line[] = [...merged].slice(0, MAX_LINES).map(([slug, qty]) => ({ slug, qty }));
  return { lines, promo: v.promo === PROMO_CODE ? PROMO_CODE : null };
}

export function loadCart(sab: Saboteur, kv: KV | null): Cart {
  if (!kv || sab.isOn("cart-forgets")) return EMPTY_CART;
  return sanitiseCart(safeParse(read(kv, CART_KEY)));
}

export function saveCart(sab: Saboteur, kv: KV | null, cart: Cart): void {
  if (!kv || sab.isOn("cart-forgets")) return;
  write(kv, CART_KEY, JSON.stringify(cart));
}

function isOrder(v: unknown): v is Order {
  if (!isRecord(v) || typeof v.id !== "string" || !ORDER_ID_RE.test(v.id)) return false;
  if (typeof v.name !== "string" || typeof v.email !== "string" || v.name.length > 200 || v.email.length > 200) return false;
  if (typeof v.shownTotal !== "number" || !Number.isInteger(v.shownTotal)) return false;
  if (!isRecord(v.totals) || !Array.isArray(v.lines)) return false;
  const t = v.totals;
  return ["subtotal", "discount", "shipping", "total"].every((k) => typeof t[k] === "number" && Number.isInteger(t[k]));
}

export function loadOrders(kv: KV | null): Order[] {
  if (!kv) return [];
  const v = safeParse(read(kv, ORDER_KEY));
  if (!Array.isArray(v)) return [];
  return v.filter(isOrder).slice(0, MAX_ORDERS).map((o) => ({ ...o, lines: sanitiseCart({ lines: o.lines }).lines }));
}

export function saveOrder(kv: KV | null, order: Order): void {
  if (!kv) return;
  const next = [order, ...loadOrders(kv).filter((o) => o.id !== order.id)].slice(0, MAX_ORDERS);
  write(kv, ORDER_KEY, JSON.stringify(next));
}

export function newOrderId(rand: (n: number) => Uint8Array): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = rand(6);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `KLN-${s}`;
}

function read(kv: KV, k: string): string | null {
  try {
    return kv.getItem(k);
  } catch {
    return null;
  }
}

function write(kv: KV, k: string, v: string): void {
  try {
    kv.setItem(k, v);
  } catch {
    /* quota or private mode: the cart still works for this page view */
  }
}
