// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { REPO_URL, route, type Ctx } from "../app";
import { loadReport, type Loaded } from "../report/load";
import { scoreRun, type MatrixRun, type RunScore, type RunStatus } from "../report/matrix";
import { FAULTS, faultByCode, type Fault } from "../saboteur/catalog";
import { h, icon, svg, type Child } from "../ui/dom";

const AREA_LABEL: Record<Fault["area"], string> = { pricing: "Pricing", cart: "Cart", catalog: "Catalog", checkout: "Checkout", navigation: "Navigation" };

function pct(n: number | null): string {
  return n === null ? "n/a" : `${Math.round(n * 100)}%`;
}

/** A ring gauge: the caught share of decidable faults. */
function ring(score: RunScore, size = 148): SVGElement {
  const r = 58;
  const c = 2 * Math.PI * r;
  const decided = score.caught + score.survived;
  const frac = decided ? score.caught / decided : 0;
  return svg(
    "svg",
    { viewBox: "0 0 148 148", width: size, height: size, class: "ring", role: "img", "aria-label": `${score.caught} of ${decided} planted bugs caught` },
    svg("circle", { cx: 74, cy: 74, r, class: "ring-track", fill: "none", "stroke-width": 14 }),
    svg("circle", { cx: 74, cy: 74, r, class: "ring-fill", fill: "none", "stroke-width": 14, "stroke-linecap": "round", "stroke-dasharray": `${(c * frac).toFixed(2)} ${c.toFixed(2)}`, transform: "rotate(-90 74 74)" }),
    svg("text", { x: 74, y: 72, "text-anchor": "middle", class: "ring-num" }, `${score.caught}/${decided}`),
    svg("text", { x: 74, y: 94, "text-anchor": "middle", class: "ring-cap" }, "bugs caught"),
  );
}

function skeleton(lines = 3): HTMLElement {
  return h("div", { class: "skeleton", "aria-busy": "true", "aria-label": "Loading" }, ...Array.from({ length: lines }, () => h("span", { class: "sk-line" })));
}

function emptyReport(ctx: Ctx): HTMLElement {
  return h("div", { class: "empty" }, icon("bug", 28), h("h3", {}, "No matrix published yet"), h("p", { class: "muted" }, "The first run of the matrix lands here. Until then nothing is shown, rather than a made-up score."), h("a", { class: "btn btn-sm", href: ctx.link("/docs#runner") }, "How to run it"));
}

function errorReport(msg: string): HTMLElement {
  return h("div", { class: "empty err-box", role: "alert" }, h("h3", {}, "Report unavailable"), h("p", { class: "muted" }, msg));
}

function latest(l: Loaded): MatrixRun | null {
  return l.state === "ok" ? (l.report.runs[l.report.runs.length - 1] ?? null) : null;
}

function heroCard(ctx: Ctx): HTMLElement {
  const card = h("div", { class: "card hero-card" }, skeleton(4));
  void loadReport().then((l) => {
    const run = latest(l);
    if (l.state === "error") return card.replaceChildren(errorReport(l.message));
    if (!run) return card.replaceChildren(emptyReport(ctx));
    const s = scoreRun(run);
    const survivors = s.faults.filter((f) => f.verdict === "survived").slice(0, 4);
    card.replaceChildren(
      h("div", { class: "hero-card-head" }, h("span", { class: "eyebrow" }, run.label), h("span", { class: "muted small" }, `${run.suite.length} TestSprite tests × ${run.faults.length} planted bugs`)),
      h(
        "div",
        { class: "hero-card-body" },
        ring(s),
        h(
          "div",
          { class: "hero-survivors" },
          h("p", { class: "small strong" }, survivors.length ? "Walked straight past the suite" : "Nothing survived"),
          h("ul", { class: "surv-list" }, ...survivors.map((f) => h("li", {}, h("span", { class: "code" }, f.code), faultByCode(f.code)?.title ?? f.code))),
        ),
      ),
      h("a", { class: "btn btn-sm btn-block", href: ctx.link("/report") }, "Open the kill matrix", icon("arrow", 16)),
    );
  });
  return card;
}

function home(ctx: Ctx): HTMLElement {
  const beforeAfter = h("div", { class: "ba" });
  void loadReport().then((l) => {
    if (l.state !== "ok" || l.report.runs.length < 2) return beforeAfter.replaceChildren();
    const first = l.report.runs[0];
    const last = l.report.runs[l.report.runs.length - 1];
    if (!first || !last) return;
    const a = scoreRun(first);
    const b = scoreRun(last);
    beforeAfter.replaceChildren(
      h(
        "section",
        { class: "section container" },
        h("div", { class: "section-head" }, h("h2", {}, "One PR later"), h("p", { class: "lead" }, "The tests that killed the survivors went in through a pull request that TestSprite checked.")),
        h(
          "div",
          { class: "ba-row" },
          h("div", { class: "card ba-card" }, h("p", { class: "eyebrow" }, first.label), h("p", { class: "big" }, pct(a.score)), h("p", { class: "muted small" }, `${a.caught} of ${a.caught + a.survived} bugs caught`)),
          h("div", { class: "ba-arrow", "aria-hidden": "true" }, icon("arrow", 28)),
          h("div", { class: "card ba-card ba-after" }, h("p", { class: "eyebrow" }, last.label), h("p", { class: "big" }, pct(b.score)), h("p", { class: "muted small" }, `${b.caught} of ${b.caught + b.survived} bugs caught`)),
        ),
      ),
    );
  });

  const steps: [string, string, string][] = [
    ["Plant", "One flag per bug", "Each of the 14 faults is one line in the app behind isOn(). The URL prefix /x/m07/ turns one on. Same deploy, no rebuild."],
    ["Replay", "Your suite, auto-heal off", "The runner points a TestSprite environment at each sabotaged build and replays the saved suite with --no-auto-heal, so no agent quietly rewrites a test to fit the bug."],
    ["Score", "Caught, survived, inconclusive", "A bug is caught when a test that passed clean now fails. The survivors are your next tests."],
  ];

  return h(
    "div",
    {},
    h(
      "section",
      { class: "hero container" },
      h(
        "div",
        { class: "hero-copy" },
        h("p", { class: "eyebrow" }, "Mutation testing for TestSprite suites"),
        h("h1", { class: "display" }, "Plant a bug. See if your tests notice."),
        h("p", { class: "lead" }, "Saboteur plants 14 realistic bugs in a live app, replays your TestSprite suite against each one and shows you exactly which bugs walk straight past it."),
        h("div", { class: "row-gap" }, h("a", { class: "btn btn-primary", href: ctx.link("/report") }, "See the kill matrix"), h("a", { class: "btn", href: ctx.link("/faults") }, "Break the demo store")),
        h("p", { class: "muted small" }, "A green check says your tests ran. It does not say they would fail if the app broke."),
      ),
      heroCard(ctx),
    ),
    h(
      "section",
      { class: "section container" },
      h("div", { class: "section-head" }, h("h2", {}, "Green is not the same as guarded"), h("p", { class: "lead" }, "Three steps, all against the real deploy and the real TestSprite runner.")),
      h("div", { class: "grid three" }, ...steps.map(([k, t, d], i) => h("article", { class: "card step" }, h("span", { class: "step-num" }, String(i + 1)), h("p", { class: "eyebrow" }, k), h("h3", {}, t), h("p", { class: "muted" }, d)))),
    ),
    beforeAfter,
    h(
      "section",
      { class: "section container" },
      h(
        "div",
        { class: "quote card" },
        h("blockquote", {}, "“It generated 40 tests. Three were the ones I needed.”"),
        h("p", { class: "muted small" }, "Feedback quoted on the TestSprite Season 4 page."),
        h("p", { class: "lead" }, "Saboteur tells you which three, and which bug none of them would catch."),
        h("div", { class: "row-gap" }, h("a", { class: "btn btn-primary", href: ctx.link("/how") }, "How it works"), h("a", { class: "btn", href: ctx.link("/docs") }, "Use it on your app")),
      ),
    ),
  );
}

function code(text: string, label?: string): HTMLElement {
  return h("figure", { class: "code-block" }, label ? h("figcaption", {}, label) : null, h("pre", {}, h("code", {}, text)));
}

function how(ctx: Ctx): HTMLElement {
  return h(
    "section",
    { class: "section container narrow" },
    h("p", { class: "eyebrow" }, "How it works"),
    h("h1", {}, "Four moving parts, one score"),
    h("ol", { class: "how" },
      h("li", {}, h("h3", {}, "A flag at the line the bug lives on"), h("p", { class: "muted" }, "The store calls the saboteur where a real regression would sit. Clean builds never take the branch."), code(`const unit = sab.isOn("subtotal-drops-cents")\n  ? Math.floor(p.priceCents / 100) * 100   // the planted bug\n  : p.priceCents;                           // the real rule`, "src/shop/shop.ts")),
      h("li", {}, h("h3", {}, "One address per bug"), h("p", { class: "muted" }, "The prefix /x/m01/ to /x/m14/ turns a fault on for every page under it. Codes are opaque, so an AI tester cannot read the bug from the URL."), code("https://<your-app>/shop          clean\nhttps://<your-app>/x/m07/shop    checkout accepts an invalid email")),
      h("li", {}, h("h3", {}, "One environment, repointed per bug"), h("p", { class: "muted" }, "On plans with several environments the runner keeps one per bug (saboteur-m01 and so on). On Starter, which allows one, it repoints the default environment at each sabotaged build in turn and always restores the clean URL afterwards. Every replay runs with auto-heal off."), code("testsprite project env update $P default --url https://<app>/x/m07/shop\ntestsprite test rerun --all --project $P --no-auto-heal --wait \\\n  --summary-file runs/m07.json", "what the runner calls, per fault (--single-env)")),
      h("li", {}, h("h3", {}, "A kill matrix"), h("p", { class: "muted" }, "Rows are bugs, columns are tests. A cell is a kill when a test that passed on the clean build fails on that bug. Survivors get a test in the next PR, and TestSprite checks that PR."), h("a", { class: "btn btn-sm", href: ctx.link("/report") }, "Open the matrix", icon("arrow", 16))),
    ),
  );
}

function faults(ctx: Ctx): HTMLElement {
  void ctx;
  return h(
    "section",
    { class: "section container" },
    h("div", { class: "section-head" }, h("p", { class: "eyebrow" }, "Fault catalog"), h("h1", {}, "14 bugs a coding agent could ship tomorrow"), h("p", { class: "lead" }, "Each one is a single line behind a flag. Open any of them and try to spot it yourself.")),
    h(
      "table",
      { class: "table table-cards" },
      h("thead", {}, h("tr", {}, h("th", {}, "Code"), h("th", {}, "Bug"), h("th", {}, "Area"), h("th", {}, "To catch it, a test must"), h("th", {}, h("span", { class: "sr-only" }, "Try it")))),
      h(
        "tbody",
        {},
        ...FAULTS.map((f) =>
          h(
            "tr",
            { id: f.code },
            h("td", { "data-label": "Code" }, h("span", { class: "code" }, f.code)),
            h("td", { "data-label": "Bug" }, h("strong", {}, f.title), h("br"), h("span", { class: "muted small" }, f.symptom)),
            h("td", { "data-label": "Area" }, h("span", { class: `pill pill-${f.area}` }, AREA_LABEL[f.area])),
            h("td", { "data-label": "To catch it" }, f.killedBy),
            h("td", { "data-label": "Try it" }, h("a", { class: "btn btn-sm", href: `/x/${f.code}/shop?show=1` }, "Try it")),
          ),
        ),
      ),
    ),
  );
}

const CELL: Record<string, { cls: string; label: string }> = {
  kill: { cls: "cell-kill", label: "caught" },
  pass: { cls: "cell-pass", label: "passed (missed)" },
  other: { cls: "cell-other", label: "inconclusive" },
  base: { cls: "cell-base", label: "not green on clean build" },
};

function cellKind(run: MatrixRun, testId: string, s: RunStatus | undefined): keyof typeof CELL {
  if (run.baseline[testId] !== "passed") return "base";
  if (s === "failed" || s === "blocked") return "kill";
  if (s === "passed") return "pass";
  return "other";
}

function matrixView(ctx: Ctx, run: MatrixRun): HTMLElement {
  const s = scoreRun(run);
  const cols = run.suite.map((t, i) => ({ ...t, short: `T${i + 1}` }));
  const verdictOf = new Map(s.faults.map((f) => [f.code, f]));
  const survivors = s.faults.filter((f) => f.verdict === "survived");
  const table = h(
    "div",
    { class: "matrix-wrap", tabindex: "0", role: "region", "aria-label": "Kill matrix, scrolls sideways" },
    h(
      "table",
      { class: "matrix" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "mx-fault" }, "Planted bug"), ...cols.map((c) => h("th", { scope: "col", title: c.title }, h("abbr", { title: c.title }, c.short))), h("th", { scope: "col" }, "Verdict"))),
      h(
        "tbody",
        {},
        ...run.faults.map((row) => {
          const f = faultByCode(row.code);
          const v = verdictOf.get(row.code);
          return h(
            "tr",
            {},
            h("th", { scope: "row", class: "mx-fault" }, h("a", { href: ctx.link(`/faults#${row.code}`), class: "ilink" }, h("span", { class: "code" }, row.code), " ", f?.title ?? "Unknown fault")),
            ...cols.map((c) => {
              const k = cellKind(run, c.testId, row.results[c.testId]);
              const meta = CELL[k] ?? { cls: "", label: "" };
              return h("td", { class: `cell ${meta.cls}`, title: `${c.short} ${c.title}: ${meta.label}` }, h("span", { class: "sr-only" }, meta.label), k === "kill" ? icon("x", 14) : k === "pass" ? icon("check", 14) : "·");
            }),
            h("td", {}, h("span", { class: `pill verdict-${v?.verdict ?? "inconclusive"}` }, v?.verdict ?? "inconclusive")),
          );
        }),
      ),
    ),
  );

  return h(
    "div",
    {},
    h(
      "div",
      { class: "score-head" },
      h("div", { class: "card score-card" }, ring(s, 132), h("div", {}, h("p", { class: "eyebrow" }, "Mutation score"), h("p", { class: "big" }, pct(s.score)), h("p", { class: "muted small" }, `${s.caught} caught · ${s.survived} survived · ${s.inconclusive} inconclusive`))),
      h(
        "div",
        { class: "card meta-card" },
        h("dl", { class: "meta" },
          h("div", {}, h("dt", {}, "Recorded"), h("dd", {}, new Date(run.generatedAt).toUTCString().replace(" GMT", " UTC"))),
          h("div", {}, h("dt", {}, "Suite"), h("dd", {}, `${run.suite.length} tests, ${s.baselineGreen} green on the clean build`)),
          h("div", {}, h("dt", {}, "Replay"), h("dd", {}, "TestSprite rerun, auto-heal off")),
          h("div", {}, h("dt", {}, "Project"), h("dd", { class: "mono" }, run.projectId)),
        ),
        run.note ? h("p", { class: "muted small" }, run.note) : null,
      ),
    ),
    h("div", { class: "legend" }, h("span", { class: "cell-kill lg" }, icon("x", 12)), "caught", h("span", { class: "cell-pass lg" }, icon("check", 12)), "test still passed", h("span", { class: "cell-other lg" }, "·"), "inconclusive", h("span", { class: "cell-base lg" }, "·"), "not green on the clean build"),
    table,
    h("h2", { id: "survivors", class: "anchor" }, `Survivors (${survivors.length})`),
    survivors.length === 0
      ? h("p", { class: "muted" }, "Every decidable bug was caught by at least one test.")
      : h("div", { class: "grid two" }, ...survivors.map((v) => {
          const f = faultByCode(v.code);
          return h("article", { class: "card surv" }, h("p", { class: "eyebrow" }, h("span", { class: "code" }, v.code), ` ${f ? AREA_LABEL[f.area] : ""}`), h("h3", {}, f?.title ?? v.code), h("p", { class: "muted" }, f?.symptom ?? ""), h("p", { class: "small" }, h("strong", {}, "Missing test: "), f?.killedBy ?? ""));
        })),
    h("h2", { class: "anchor", id: "tests" }, "Tests by kills"),
    h("ol", { class: "tests" }, ...cols.map((c) => h("li", {}, h("span", { class: "code" }, c.short), h("span", { class: "grow" }, c.title), run.baseline[c.testId] === "passed" ? h("span", { class: `pill ${s.killsByTest[c.testId] ? "verdict-caught" : "pill-muted"}` }, `${s.killsByTest[c.testId] ?? 0} kills`) : h("span", { class: "pill verdict-inconclusive" }, `clean: ${run.baseline[c.testId] ?? "no run"}`)))),
  );
}

function report(ctx: Ctx): HTMLElement {
  const body = h("div", {}, skeleton(6));
  const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Matrix runs" });
  void loadReport().then((l) => {
    if (l.state === "error") return body.replaceChildren(errorReport(l.message));
    if (l.state === "empty") return body.replaceChildren(emptyReport(ctx));
    const runs = l.report.runs;
    let sel = runs.length - 1;
    const paint = () => {
      tabs.replaceChildren(...runs.map((r, i) => {
        const b = h("button", { type: "button", role: "tab", class: "tab", "aria-selected": String(i === sel) }, r.label);
        b.addEventListener("click", () => {
          sel = i;
          paint();
        });
        return b;
      }));
      const run = runs[sel];
      if (run) body.replaceChildren(matrixView(ctx, run));
      if (ctx.hash) document.getElementById(ctx.hash)?.scrollIntoView();
    };
    paint();
  });
  return h("section", { class: "section container" }, h("div", { class: "section-head" }, h("p", { class: "eyebrow" }, "Reports"), h("h1", {}, "Kill matrix"), h("p", { class: "lead" }, "Every planted bug against every TestSprite test, replayed on the live deploy.")), tabs, body);
}

function docs(_ctx: Ctx): HTMLElement {
  return h(
    "section",
    { class: "section container narrow" },
    h("p", { class: "eyebrow" }, "Developers"),
    h("h1", {}, "Run Saboteur on your own app"),
    h("h2", { class: "anchor", id: "quick" }, "1. Plant flags"),
    h("p", { class: "muted" }, "Copy src/saboteur/catalog.ts. List your faults, give each an opaque code, and call isOn() on the exact line the regression would live on."),
    code(`import { locate, Saboteur } from "./saboteur/catalog";\n\nconst { fault } = locate(location.pathname, location.search);\nconst sab = new Saboteur(fault);\n\nif (sab.isOn("promo-ignored")) discount = 0;`, "your app"),
    h("p", { class: "muted small" }, "Keep the router base at the /x/<code> prefix so every in-app link stays on the sabotaged build. Ship flags only to preview and demo deploys if you prefer: production users never visit /x/ addresses."),
    h("h2", { class: "anchor", id: "runner" }, "2. Run the matrix"),
    h("p", { class: "muted" }, "The runner is one Node script with no dependencies. It shells out to the official TestSprite CLI with argument arrays, never a shell string, and reads your API key from the CLI's own credential file."),
    code(`npm i -g @testsprite/testsprite-cli\ntestsprite setup --from-env   # reads TESTSPRITE_API_KEY\n\nnode scripts/saboteur.ts envs   --project <id> --origin https://<your-app>\nnode scripts/saboteur.ts run    --project <id> --origin https://<your-app> --label "Generated suite" --single-env\nnode scripts/saboteur.ts report --project <id> --origin https://<your-app> --label \"Generated suite\"`, "terminal"),
    h("table", { class: "table table-cards" },
      h("thead", {}, h("tr", {}, h("th", {}, "Command"), h("th", {}, "What it does"))),
      h("tbody", {},
        h("tr", {}, h("td", { "data-label": "Command" }, h("code", {}, "envs")), h("td", { "data-label": "What it does" }, "Creates one TestSprite environment per fault, saboteur-m01 to saboteur-m14, on plans that allow several. On Starter, skip it and pass --single-env to run.")),
        h("tr", {}, h("td", { "data-label": "Command" }, h("code", {}, "run")), h("td", { "data-label": "What it does" }, "Replays the whole suite on the default environment, then once per fault, with --no-auto-heal --wait. Results go to runs/<label>/.")),
        h("tr", {}, h("td", { "data-label": "Command" }, h("code", {}, "report")), h("td", { "data-label": "What it does" }, "Validates every summary, scores it and appends the run to public/report.json.")),
      ),
    ),
    h("h2", { class: "anchor", id: "format" }, "3. Report format"),
    h("p", { class: "muted" }, "saboteur.report/1 is plain JSON, validated in full before the site renders it. Runs recorded with auto-heal on are rejected."),
    code(`{\n  "schema": "saboteur.report/1",\n  "runs": [{\n    "label": "Generated suite",\n    "generatedAt": "2026-10-19T12:00:00Z",\n    "projectId": "…", "origin": "https://…", "autoHeal": false,\n    "suite":    [{ "testId": "…", "title": "Add to cart updates badge" }],\n    "baseline": { "<testId>": "passed" },\n    "faults":   [{ "code": "m03", "results": { "<testId>": "failed" } }]\n  }]\n}`, "public/report.json"),
    h("p", {}, h("a", { class: "ilink", href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, "Read the source on GitHub")),
  );
}

function method(ctx: Ctx): HTMLElement {
  const rules: [string, string][] = [
    ["Caught", "At least one test that passed on the clean build failed or was blocked on the sabotaged build."],
    ["Survived", "Every test that passed on the clean build still passed with the bug in place."],
    ["Inconclusive", "Timed out, cancelled, not dispatched, or nothing was green on the clean build to compare against. Kept out of the score."],
    ["Score", "Caught divided by caught plus survived. Inconclusive rows never count for or against."],
  ];
  const limits: Child[] = [
    "A kill means a test noticed something changed, not that its failure message names the bug. Open the run in the TestSprite portal to read why.",
    "Replays run with auto-heal off. A suite that relies on healing to stay green will show inconclusive or failed baselines, which is a finding in itself.",
    "The 14 faults are hand-written for this store. A high score here does not prove a suite catches every regression in another app.",
    "Each fault is run once. A flaky test can fake a kill; check the clean baseline and rerun suspicious cells with testsprite test flaky.",
    "Replays depend on the stored test code. We found PR runs with auto-heal on rewriting a test's start address to that PR's preview URL, and weakening a receipt test to check only two words. The stored code is pinned in testsprite/code/ and was checked after the next PR run.",
    "The nine tests added after the first matrix were written against this catalog, so 14 of 14 on the second matrix is expected. The useful number is the generated suite's 5 of 14.",
    "Kiln is a demo store. Nothing is sold, charged or shipped, and orders live only in your browser.",
  ];
  return h(
    "section",
    { class: "section container narrow" },
    h("p", { class: "eyebrow" }, "Methodology"),
    h("h1", {}, "How a kill is counted"),
    h("dl", { class: "rules" }, ...rules.map(([k, v]) => h("div", { class: "card rule" }, h("dt", {}, k), h("dd", { class: "muted" }, v)))),
    h("h2", { class: "anchor", id: "limits" }, "Limits"),
    h("ul", { class: "limits" }, ...limits.map((l) => h("li", {}, l))),
    h("p", {}, h("a", { class: "btn btn-sm", href: ctx.link("/report") }, "Back to the matrix")),
  );
}

route("/", "Plant a bug, see if your tests notice", home);
route("/how", "How it works", how);
route("/faults", "Fault catalog", faults);
route("/report", "Kill matrix", report);
route("/docs", "Developers", docs);
route("/method", "Methodology", method);
