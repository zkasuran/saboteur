// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** A strict Content-Security-Policy, injected into the production build only (dev needs inline HMR).
 *  The one inline script, the no-flash theme switch, is allowed by its sha256. */
function csp(): Plugin {
  return {
    name: "saboteur-csp",
    apply: "build",
    transformIndexHtml(html) {
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (m) => `'sha256-${createHash("sha256").update(m[1] ?? "").digest("base64")}'`,
      );
      const policy = [
        "default-src 'none'",
        `script-src 'self' ${inline.join(" ")}`,
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join("; ");
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="no-referrer" />`,
      );
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [csp()],
  build: { target: "es2022", sourcemap: false },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
