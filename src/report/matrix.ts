// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/**
 * The kill matrix. A fault is CAUGHT when at least one test that passed on the clean build fails (or is
 * blocked) on the sabotaged build. It SURVIVED when every such test still passed. Anything else
 * (timeouts, cancelled, not dispatched, or no clean pass to compare against) is INCONCLUSIVE and is kept
 * out of the score rather than counted either way.
 */

export type RunStatus = "passed" | "failed" | "blocked" | "timeout" | "cancelled" | "skipped" | "deferred" | "conflict" | "not_found" | "unknown";

const STATUSES: ReadonlySet<string> = new Set<RunStatus>([
  "passed", "failed", "blocked", "timeout", "cancelled", "skipped", "deferred", "conflict", "not_found", "unknown",
]);

export function asStatus(s: unknown): RunStatus {
  return typeof s === "string" && STATUSES.has(s) ? (s as RunStatus) : "unknown";
}

const CAUGHT_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>(["failed", "blocked"]);

export interface SuiteTest {
  readonly testId: string;
  readonly title: string;
}

export interface FaultRow {
  readonly code: string;
  readonly results: Readonly<Record<string, RunStatus>>;
  readonly runIds?: Readonly<Record<string, string>>;
}

export interface MatrixRun {
  readonly label: string;
  readonly generatedAt: string;
  readonly projectId: string;
  readonly origin: string;
  readonly autoHeal: false;
  readonly suite: readonly SuiteTest[];
  readonly baseline: Readonly<Record<string, RunStatus>>;
  readonly faults: readonly FaultRow[];
  /** Free-text note shown under the run (e.g. which PR added tests). */
  readonly note?: string;
}

export interface Report {
  readonly schema: "saboteur.report/1";
  readonly runs: readonly MatrixRun[];
}

export type Verdict = "caught" | "survived" | "inconclusive";

export interface FaultScore {
  readonly code: string;
  readonly verdict: Verdict;
  /** Test ids that caught it. */
  readonly killers: readonly string[];
}

export interface RunScore {
  readonly faults: readonly FaultScore[];
  readonly caught: number;
  readonly survived: number;
  readonly inconclusive: number;
  /** caught / (caught + survived), or null when nothing was decidable. */
  readonly score: number | null;
  /** Per test: how many faults it caught. */
  readonly killsByTest: Readonly<Record<string, number>>;
  /** Tests that passed clean but never caught anything. */
  readonly idleTests: readonly string[];
  readonly baselineGreen: number;
}

export function scoreRun(run: MatrixRun): RunScore {
  const green = run.suite.map((t) => t.testId).filter((id) => run.baseline[id] === "passed");
  const kills: Record<string, number> = Object.fromEntries(run.suite.map((t) => [t.testId, 0]));
  const faults: FaultScore[] = run.faults.map((row) => {
    const killers = green.filter((id) => CAUGHT_STATUSES.has(row.results[id] ?? "unknown"));
    for (const id of killers) kills[id] = (kills[id] ?? 0) + 1;
    let verdict: Verdict;
    if (killers.length > 0) verdict = "caught";
    else if (green.length > 0 && green.every((id) => row.results[id] === "passed")) verdict = "survived";
    else verdict = "inconclusive";
    return { code: row.code, verdict, killers };
  });
  const caught = faults.filter((f) => f.verdict === "caught").length;
  const survived = faults.filter((f) => f.verdict === "survived").length;
  return {
    faults,
    caught,
    survived,
    inconclusive: faults.length - caught - survived,
    score: caught + survived > 0 ? caught / (caught + survived) : null,
    killsByTest: kills,
    idleTests: green.filter((id) => (kills[id] ?? 0) === 0),
    baselineGreen: green.length,
  };
}

// ---- validation of a report fetched over the network or read from disk ----

const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const CODE_RE = /^m\d{2}$/;
const LIMITS = { runs: 20, tests: 200, faults: 64, text: 300 } as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number = LIMITS.text): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

function statusMap(v: unknown, allowed: ReadonlySet<string>): Record<string, RunStatus> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, RunStatus> = {};
  for (const [k, s] of Object.entries(v)) {
    if (!allowed.has(k)) continue;
    out[k] = asStatus(s);
  }
  return out;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseReport(v: unknown): Parsed<Report> {
  if (!isRecord(v) || v.schema !== "saboteur.report/1") return { ok: false, error: "not a saboteur.report/1 document" };
  if (!Array.isArray(v.runs) || v.runs.length > LIMITS.runs) return { ok: false, error: "runs missing or too many" };
  const runs: MatrixRun[] = [];
  for (const [i, r] of v.runs.entries()) {
    const p = parseRun(r);
    if (!p.ok) return { ok: false, error: `run ${i}: ${p.error}` };
    runs.push(p.value);
  }
  return { ok: true, value: { schema: "saboteur.report/1", runs } };
}

function parseRun(r: unknown): Parsed<MatrixRun> {
  if (!isRecord(r)) return { ok: false, error: "not an object" };
  const label = text(r.label, 80);
  const generatedAt = text(r.generatedAt, 40);
  const projectId = text(r.projectId, 80);
  const origin = text(r.origin, 200);
  if (!label || !generatedAt || Number.isNaN(Date.parse(generatedAt)) || !projectId || !origin) return { ok: false, error: "bad header fields" };
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) return { ok: false, error: "origin must be an https origin" };
  if (r.autoHeal !== false) return { ok: false, error: "matrix runs must be recorded with auto-heal off" };
  if (!Array.isArray(r.suite) || r.suite.length === 0 || r.suite.length > LIMITS.tests) return { ok: false, error: "bad suite" };
  const suite: SuiteTest[] = [];
  const seen = new Set<string>();
  for (const t of r.suite) {
    if (!isRecord(t) || typeof t.testId !== "string" || !ID_RE.test(t.testId) || seen.has(t.testId)) return { ok: false, error: "bad suite entry" };
    const title = text(t.title, 200);
    if (title === null) return { ok: false, error: "bad suite title" };
    seen.add(t.testId);
    suite.push({ testId: t.testId, title });
  }
  const baseline = statusMap(r.baseline, seen);
  if (!baseline) return { ok: false, error: "bad baseline" };
  if (!Array.isArray(r.faults) || r.faults.length > LIMITS.faults) return { ok: false, error: "bad faults" };
  const codes = new Set<string>();
  const faults: FaultRow[] = [];
  for (const f of r.faults) {
    if (!isRecord(f) || typeof f.code !== "string" || !CODE_RE.test(f.code) || codes.has(f.code)) return { ok: false, error: "bad fault row" };
    const results = statusMap(f.results, seen);
    if (!results) return { ok: false, error: `bad results for ${f.code}` };
    let runIds: Record<string, string> | undefined;
    if (isRecord(f.runIds)) {
      runIds = {};
      for (const [k, id] of Object.entries(f.runIds)) if (seen.has(k) && typeof id === "string" && ID_RE.test(id)) runIds[k] = id;
    }
    codes.add(f.code);
    faults.push(runIds ? { code: f.code, results, runIds } : { code: f.code, results });
  }
  const note = r.note === undefined ? undefined : text(r.note, 400);
  if (note === null) return { ok: false, error: "bad note" };
  const run: MatrixRun = { label, generatedAt, projectId, origin, autoHeal: false, suite, baseline, faults };
  return { ok: true, value: note === undefined ? run : { ...run, note } };
}
