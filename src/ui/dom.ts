// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/** Element builder. Strings always become text nodes, so nothing a user or a report supplies is parsed as HTML. */

export type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

/** Inline icons drawn with strokes, so they follow `currentColor` in both themes. */
export function icon(name: "sun" | "moon" | "cart" | "menu" | "chevron" | "bug" | "check" | "x" | "arrow", size = 18): SVGElement {
  const paths: Record<typeof name, string[]> = {
    sun: ["M12 4V2", "M12 22v-2", "M4.93 4.93 3.51 3.51", "M20.49 20.49l-1.42-1.42", "M4 12H2", "M22 12h-2", "M4.93 19.07l-1.42 1.42", "M20.49 3.51l-1.42 1.42", "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z"],
    moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
    cart: ["M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6", "M10 20a1 1 0 1 0 0 .01", "M18 20a1 1 0 1 0 0 .01"],
    menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
    chevron: ["M6 9l6 6 6-6"],
    bug: ["M9 9a3 3 0 0 1 6 0v1H9z", "M8 10h8v5a4 4 0 0 1-8 0z", "M12 10v9", "M4 13h4", "M16 13h4", "M5 8l3 2", "M19 8l-3 2", "M5 19l3-2", "M19 19l-3-2"],
    check: ["M5 12.5l4.5 4.5L19 7.5"],
    x: ["M6 6l12 12", "M18 6L6 18"],
    arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  };
  return svg(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" },
    ...paths[name].map((d) => svg("path", { d })),
  );
}
