// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { locate, Saboteur, type Fault } from "./saboteur/catalog";
import { EMPTY_CART, itemCount, type Cart } from "./shop/shop";
import { loadCart, saveCart, type KV } from "./shop/storage";
import { h, icon, type Child } from "./ui/dom";

export const REPO_URL = "https://github.com/zkasuran/saboteur";

export interface Ctx {
  readonly sab: Saboteur;
  readonly base: string;
  readonly path: string;
  readonly hash: string;
  readonly kv: KV | null;
  /** Build an in-app href that keeps the active fault prefix. */
  link(path: string): string;
  go(path: string): void;
  cart(): Cart;
  setCart(c: Cart): void;
  /** Re-render the current route (after state changes). */
  refresh(): void;
}

export type View = (ctx: Ctx, params: Record<string, string>) => HTMLElement;

interface Route {
  readonly pattern: RegExp;
  readonly keys: readonly string[];
  readonly view: View;
  readonly title: string;
  readonly store?: boolean;
}

const routes: Route[] = [];

export function route(path: string, title: string, view: View, store = false): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" + path.replace(/:([a-z]+)/g, (_m, k: string) => {
      keys.push(k);
      return "([A-Za-z0-9-]{1,40})";
    }) + "$",
  );
  routes.push({ pattern, keys, view, title, store });
}

interface MenuItem {
  readonly label: string;
  readonly href: string;
  readonly desc: string;
  readonly external?: boolean;
}

const MENU: readonly { label: string; items: readonly MenuItem[] }[] = [
  {
    label: "Product",
    items: [
      { label: "Overview", href: "/", desc: "What Saboteur does, in one screen" },
      { label: "How it works", href: "/how", desc: "Flag, environments, replay, score" },
      { label: "Fault catalog", href: "/faults", desc: "The 14 bugs we plant, and how to kill each" },
    ],
  },
  {
    label: "Demo store",
    items: [
      { label: "Shop", href: "/shop", desc: "Kiln, the store under test" },
      { label: "Cart", href: "/cart", desc: "Quantities, promo code, shipping" },
      { label: "Checkout", href: "/checkout", desc: "Form validation and the order" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Kill matrix", href: "/report", desc: "Every fault against every test" },
      { label: "Survivors", href: "/report#survivors", desc: "The bugs the suite missed" },
      { label: "Methodology", href: "/method", desc: "How a kill is counted" },
      { label: "Limits", href: "/method#limits", desc: "What this does not prove" },
    ],
  },
  {
    label: "Developers",
    items: [
      { label: "Quick start", href: "/docs", desc: "Add flags to your own app" },
      { label: "Runner CLI", href: "/docs#runner", desc: "Run the matrix with the TestSprite CLI" },
      { label: "Report format", href: "/docs#format", desc: "saboteur.report/1" },
      { label: "Source on GitHub", href: REPO_URL, desc: "The code, the gate, the PRs", external: true },
    ],
  },
];

function storage(): KV | null {
  try {
    const s = window.localStorage;
    const probe = "__sab_probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const REVEAL_KEY = "saboteur.reveal";

export function start(root: HTMLElement): void {
  const kv = storage();
  let current: { fault: Fault | null } = { fault: null };
  let cart: Cart = EMPTY_CART;
  let lastFaultCode: string | null | undefined;

  const render = () => {
    const url = new URL(window.location.href);
    const loc = locate(url.pathname, url.search);
    const sab = new Saboteur(loc.fault);
    if (lastFaultCode !== (loc.fault?.code ?? null)) {
      cart = loadCart(sab, kv);
      lastFaultCode = loc.fault?.code ?? null;
    }
    current = { fault: loc.fault };
    if (url.searchParams.get("show") === "1" && loc.fault) {
      try {
        sessionStorage.setItem(REVEAL_KEY, loc.fault.code);
      } catch {
        /* ignore */
      }
    }
    const ctx: Ctx = {
      sab,
      base: loc.base,
      path: loc.path,
      hash: url.hash.slice(1),
      kv,
      link: (p) => (/^https?:/.test(p) ? p : loc.base + (p === "/" && loc.base ? "/" : p)),
      go: (p) => navigate(loc.base + p),
      cart: () => cart,
      setCart: (c) => {
        cart = c;
        saveCart(sab, kv, c);
      },
      refresh: () => render(),
    };
    const match = loc.unknownCode ? null : findRoute(loc.path);
    const r = match?.route;
    document.title = r ? `${r.title} · Saboteur` : "Not found · Saboteur";
    let main: HTMLElement;
    try {
      main = r ? r.view(ctx, match.params) : notFound(ctx, loc.unknownCode);
    } catch (err) {
      console.error(err);
      main = errorPanel(ctx);
    }
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focus;
    root.replaceChildren(...[header(ctx), revealStrip(ctx, current.fault), h("main", { id: "main", tabindex: "-1" }, main), footer(ctx)].filter((n): n is HTMLElement => n instanceof HTMLElement));
    if (focusKey) document.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
    if (ctx.hash) {
      const target = document.getElementById(ctx.hash);
      if (target) target.scrollIntoView();
    }
  };

  const navigate = (href: string) => {
    const before = window.location.pathname;
    history.pushState(null, "", href);
    render();
    if (!href.includes("#") && before !== window.location.pathname) window.scrollTo(0, 0);
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    e.preventDefault();
    closeMenus();
    navigate(href);
  });
  window.addEventListener("popstate", render);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element | null)?.closest?.(".nav-cat")) closeMenus();
  });
  render();
}

function findRoute(path: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = m[i + 1] ?? ""));
    return { route: r, params };
  }
  return null;
}

// ---------- chrome ----------

function closeMenus(except?: Element): void {
  document.querySelectorAll(".nav-cat.open").forEach((el) => {
    if (el === except) return;
    el.classList.remove("open");
    el.querySelector("button")?.setAttribute("aria-expanded", "false");
  });
}

function setOpen(cat: HTMLElement, open: boolean): void {
  if (open) closeMenus(cat);
  cat.classList.toggle("open", open);
  cat.querySelector("button")?.setAttribute("aria-expanded", String(open));
}

function header(ctx: Ctx): HTMLElement {
  const cats = MENU.map((cat, ci) => {
    const id = `menu-${ci}`;
    const btn = h("button", { class: "nav-trigger", type: "button", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": id }, cat.label, icon("chevron", 14));
    const panel = h(
      "div",
      { class: "nav-panel", id, role: "menu" },
      ...cat.items.map((it) =>
        h(
          "a",
          { href: it.external ? it.href : ctx.link(it.href), role: "menuitem", class: "nav-item", ...(it.external ? { target: "_blank", rel: "noopener noreferrer" } : {}) },
          h("span", { class: "nav-item-label" }, it.label),
          h("span", { class: "nav-item-desc" }, it.desc),
        ),
      ),
    );
    const wrap = h("div", { class: "nav-cat" }, btn, panel);
    let closeTimer = 0;
    wrap.addEventListener("pointerenter", (e) => {
      if ((e as PointerEvent).pointerType === "mouse") {
        window.clearTimeout(closeTimer);
        setOpen(wrap, true);
      }
    });
    wrap.addEventListener("pointerleave", (e) => {
      if ((e as PointerEvent).pointerType === "mouse") closeTimer = window.setTimeout(() => setOpen(wrap, false), 120);
    });
    btn.addEventListener("click", () => setOpen(wrap, !wrap.classList.contains("open")));
    wrap.addEventListener("focusin", () => setOpen(wrap, true));
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget as Node | null)) setOpen(wrap, false);
    });
    panel.addEventListener("keydown", (e) => {
      const items = [...panel.querySelectorAll<HTMLElement>("a")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length]?.focus();
      }
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(wrap, true);
        panel.querySelector<HTMLElement>("a")?.focus();
      }
    });
    return wrap;
  });

  const mobile = h("button", { class: "icon-btn nav-burger", type: "button", "aria-label": "Open menu", "aria-expanded": "false" }, icon("menu"));
  const nav = h("nav", { class: "nav-cats", "aria-label": "Main" }, ...cats);
  mobile.addEventListener("click", () => {
    const open = !nav.classList.contains("show");
    nav.classList.toggle("show", open);
    mobile.setAttribute("aria-expanded", String(open));
  });

  return h(
    "header",
    { class: "topbar" },
    h(
      "div",
      { class: "container topbar-row" },
      h("a", { href: ctx.link("/"), class: "brand", "aria-label": "Saboteur home" }, brandMark(), h("span", {}, "Saboteur")),
      nav,
      h("div", { class: "topbar-end" }, themeToggle(), h("a", { class: "btn btn-sm btn-primary hide-sm", href: ctx.link("/report") }, "See the matrix"), mobile),
    ),
  );
}

export function brandMark(): SVGElement {
  const m = icon("bug", 22);
  m.setAttribute("class", "brand-mark");
  return m;
}

function themeToggle(): HTMLElement {
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
  const btn = h("button", { class: "icon-btn", type: "button", "aria-label": "Dark theme", "aria-pressed": String(isDark()) });
  const paint = () => {
    btn.replaceChildren(icon(isDark() ? "sun" : "moon"));
    btn.setAttribute("aria-pressed", String(isDark()));
    btn.title = isDark() ? "Switch to light theme" : "Switch to dark theme";
  };
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    paint();
  });
  paint();
  return btn;
}

function revealStrip(ctx: Ctx, fault: Fault | null): Child {
  if (!fault) return null;
  let code: string | null = null;
  try {
    code = sessionStorage.getItem(REVEAL_KEY);
  } catch {
    /* ignore */
  }
  if (code !== fault.code) return null;
  return h(
    "div",
    { class: "reveal", role: "status" },
    h(
      "div",
      { class: "container reveal-row" },
      icon("bug", 16),
      h("span", {}, h("strong", {}, `Sabotaged build ${fault.code}: `), fault.title, ". ", fault.symptom),
      h("a", { href: ctx.path, class: "reveal-exit", onclick: () => sessionStorage.removeItem(REVEAL_KEY) }, "Back to the clean build"),
    ),
  );
}

function footer(ctx: Ctx): HTMLElement {
  return h(
    "footer",
    { class: "footer" },
    h(
      "div",
      { class: "container footer-row" },
      h("span", { class: "muted" }, "Saboteur, built for TestSprite Hackathon Season 4. Kiln is a demo store: nothing is sold or shipped."),
      h(
        "span",
        { class: "footer-links" },
        h("a", { href: ctx.link("/method#limits"), class: "ilink" }, "Limits"),
        h("a", { href: REPO_URL, class: "ilink", target: "_blank", rel: "noopener noreferrer" }, "GitHub"),
      ),
    ),
  );
}

function notFound(ctx: Ctx, unknownCode: boolean): HTMLElement {
  return h(
    "section",
    { class: "section container narrow center" },
    h("p", { class: "eyebrow" }, "404"),
    h("h1", {}, unknownCode ? "That build does not exist" : "Page not found"),
    h("p", { class: "lead" }, unknownCode ? "The fault code in this address is not in the catalog." : "There is nothing at this address."),
    h("div", { class: "row-gap center-row" }, h("a", { class: "btn btn-primary", href: unknownCode ? "/" : ctx.link("/") }, "Go home"), h("a", { class: "btn", href: ctx.link("/shop") }, "Open the store")),
  );
}

function errorPanel(ctx: Ctx): HTMLElement {
  return h(
    "section",
    { class: "section container narrow center" },
    h("p", { class: "eyebrow" }, "Error"),
    h("h1", {}, "This page failed to render"),
    h("p", { class: "lead" }, "The rest of the site still works. Try another page or reload."),
    h("a", { class: "btn btn-primary", href: ctx.link("/") }, "Go home"),
  );
}

export function cartBadgeCount(ctx: Ctx, shown: number): number {
  return ctx.sab.isOn("badge-stale") ? 0 : shown;
}

export function storeHeader(ctx: Ctx): HTMLElement {
  const count = cartBadgeCount(ctx, itemCount(ctx.cart()));
  const cartHref = ctx.sab.isOn("cart-link-404") ? ctx.link("/bag") : ctx.link("/cart");
  return h(
    "div",
    { class: "store-bar" },
    h(
      "div",
      { class: "container store-row" },
      h("a", { href: ctx.link("/shop"), class: "store-brand" }, h("span", { class: "kiln-dot", "aria-hidden": "true" }), "Kiln", h("span", { class: "tag" }, "demo store")),
      h(
        "nav",
        { class: "store-nav", "aria-label": "Store" },
        h("a", { href: ctx.link("/shop"), class: ctx.path === "/shop" ? "active" : "" }, "Shop"),
        h(
          "a",
          { href: cartHref, class: `store-cart ${ctx.path === "/cart" ? "active" : ""}`, "aria-label": `Cart, ${count} items`, "data-testid": "cart-link" },
          icon("cart"),
          h("span", {}, "Cart"),
          h("span", { class: "badge", "data-testid": "cart-count" }, String(count)),
        ),
      ),
    ),
  );
}
