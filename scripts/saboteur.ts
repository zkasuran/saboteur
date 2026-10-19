#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
/**
 * Saboteur matrix runner. Shells out to the official TestSprite CLI with argument arrays (never a shell
 * string) and never touches the API key: the CLI reads its own credential file.
 *
 *   node scripts/saboteur.ts envs   --project <id> --origin https://app.example [--path /shop]
 *   node scripts/saboteur.ts run    --project <id> --label "Generated suite" [--faults m01,m02] [--parallel 3]
 *   node scripts/saboteur.ts report --project <id> --label "Generated suite" --origin https://app.example [--note "..."]
 *
 * Runs Node's built-in type stripping (Node 22.18+), so it imports the same validator the site uses.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { asStatus, parseReport, scoreRun, type FaultRow, type MatrixRun, type Report, type RunStatus } from "../src/report/matrix.ts";

const ROOT = resolve(import.meta.dirname, "..");
const CODES = Array.from({ length: 14 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
const ENV_PREFIX = "saboteur-";
const REPORT = join(ROOT, "public", "report.json");
const MAX_OUT = 16 * 1024 * 1024;

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = "help", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (!a.startsWith("--")) die(`unexpected argument: ${a}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
    else {
      args[a.slice(2)] = next;
      i++;
    }
  }
  return { cmd, args };
}

function die(msg: string): never {
  process.stderr.write(`saboteur: ${msg}\n`);
  process.exit(2);
}

function str(args: Args, k: string, required = true): string {
  const v = args[k];
  if (typeof v === "string" && v.length > 0) return v;
  if (required) die(`--${k} is required`);
  return "";
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
function projectId(args: Args): string {
  const p = str(args, "project");
  if (!ID_RE.test(p)) die("--project does not look like a project id");
  return p;
}

function origin(args: Args): string {
  const o = str(args, "origin").replace(/\/+$/, "");
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(o)) die("--origin must be an https origin with no path, like https://app.example");
  return o;
}

function slug(label: string): string {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (!s) die("--label must contain letters or digits");
  return s;
}

function faultList(args: Args): string[] {
  const f = args.faults;
  if (typeof f !== "string") return CODES;
  const list = f.split(",").map((s) => s.trim().toLowerCase());
  for (const c of list) if (!CODES.includes(c)) die(`unknown fault code ${c}`);
  return list;
}

interface Exec {
  code: number;
  stdout: string;
  stderr: string;
}

function ts(argv: string[], timeoutMs = 60 * 60 * 1000): Promise<Exec> {
  return new Promise((done) => {
    const child = spawn("testsprite", argv, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TESTSPRITE_NO_SKILL_WARNING: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      if (stdout.length < MAX_OUT) stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      if (stderr.length < MAX_OUT) stderr += b.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      done({ code: 127, stdout, stderr: String(e) });
    });
  });
}

/** The CLI prints JSON on stdout with --output json; tolerate a leading advisory line. */
function json(out: string): unknown {
  const i = out.search(/[[{]/);
  if (i < 0) return null;
  try {
    return JSON.parse(out.slice(i));
  } catch {
    return null;
  }
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ---------------- envs ----------------

async function envs(args: Args): Promise<void> {
  const p = projectId(args);
  const o = origin(args);
  const path = typeof args.path === "string" ? args.path : "/shop";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) die("--path must be a simple absolute path");
  const listed = await ts(["--output", "json", "project", "env", "list", p]);
  if (listed.code !== 0) die(`env list failed: ${listed.stderr.trim() || listed.stdout.trim()}`);
  const existing = new Set(
    (Array.isArray(rec(json(listed.stdout)).environments) ? (rec(json(listed.stdout)).environments as unknown[]) : []).map((e) => String(rec(e).name ?? "")),
  );
  for (const code of faultList(args)) {
    const name = ENV_PREFIX + code;
    const url = `${o}/x/${code}${path}`;
    const argv = existing.has(name) ? ["project", "env", "update", p, name, "--url", url] : ["project", "env", "create", p, "--name", name, "--url", url, "--sign-in", "public"];
    const r = await ts(["--output", "json", ...argv]);
    process.stdout.write(`${r.code === 0 ? "ok  " : "FAIL"} ${name} -> ${url}${r.code === 0 ? "" : `\n     ${(r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ")}`}\n`);
    if (r.code !== 0) process.exitCode = 1;
  }
}

// ---------------- run ----------------

async function rerun(p: string, env: string | null, file: string, label = env ?? "clean"): Promise<void> {
  const argv = ["--output", "json", "test", "rerun", "--all", "--project", p, "--no-auto-heal", "--wait", "--timeout", "1800", "--summary-file", file];
  if (env) argv.push("--env", env);
  const started = Date.now();
  const r = await ts(argv);
  const secs = Math.round((Date.now() - started) / 1000);
  // Exit 1 just means some test failed, which is the point on a sabotaged build. Only a missing summary is an error.
  if (!existsSync(file)) {
    writeFileSync(join(file + ".err.txt"), `${r.code}\n${r.stderr}\n${r.stdout}`.slice(0, 64 * 1024));
    process.stdout.write(`FAIL ${label} (exit ${r.code}, ${secs}s): no summary; see ${file}.err.txt\n`);
    process.exitCode = 1;
    return;
  }
  const s = rec(JSON.parse(readFileSync(file, "utf8")));
  process.stdout.write(`done ${label} in ${secs}s: ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.timedOut} timed out, ${s.skipped} skipped\n`);
}

/**
 * Plans with one environment (TestSprite Starter) cannot hold an environment per fault. Saved test code
 * navigates to the environment URL (`VAR_{url}`), so the runner points the single environment at each
 * sabotaged URL in turn, replays, and always restores the clean URL, even on failure or Ctrl-C.
 */
async function runSingleEnv(args: Args, p: string, dir: string, resume: boolean): Promise<void> {
  const o = origin(args);
  const env = typeof args.env === "string" ? args.env : "default";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(env)) die("--env must be an environment name");
  const path = typeof args.path === "string" ? args.path : "/shop";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) die("--path must be a simple absolute path");
  const cleanUrl = `${o}${path}`;
  const point = async (url: string) => {
    const r = await ts(["--output", "json", "project", "env", "update", p, env, "--url", url]);
    if (r.code !== 0) throw new Error(`env update to ${url} failed: ${(r.stderr || r.stdout).trim().slice(-300)}`);
  };
  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    await point(cleanUrl);
    process.stdout.write(`restored ${env} -> ${cleanUrl}\n`);
  };
  const onSignal = () => void restore().finally(() => process.exit(130));
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    await point(cleanUrl);
    if (!(resume && existsSync(join(dir, "clean.json"))) && args["skip-clean"] !== true) await rerun(p, null, join(dir, "clean.json"));
    for (const c of faultList(args)) {
      if (resume && existsSync(join(dir, `${c}.json`))) continue;
      await point(`${o}/x/${c}${path}`);
      await rerun(p, null, join(dir, `${c}.json`), c);
    }
  } finally {
    await restore();
  }
}

async function run(args: Args): Promise<void> {
  const p = projectId(args);
  const dir = join(ROOT, "runs", slug(str(args, "label")));
  mkdirSync(dir, { recursive: true });
  const resume = args.resume === true;
  if (args["single-env"] === true) {
    const listed = await ts(["--output", "json", "test", "list", "--project", p, "--page-size", "100"]);
    if (listed.code !== 0) die(`test list failed: ${listed.stderr.trim()}`);
    writeFileSync(join(dir, "suite.json"), JSON.stringify(json(listed.stdout), null, 2));
    await runSingleEnv(args, p, dir, resume);
    process.stdout.write(`summaries in ${dir}\n`);
    return;
  }
  const parallel = Math.max(1, Math.min(5, Number(args.parallel ?? 2) || 2));
  const listed = await ts(["--output", "json", "test", "list", "--project", p, "--page-size", "100"]);
  if (listed.code !== 0) die(`test list failed: ${listed.stderr.trim()}`);
  writeFileSync(join(dir, "suite.json"), JSON.stringify(json(listed.stdout), null, 2));
  if (!(resume && existsSync(join(dir, "clean.json"))) && args["skip-clean"] !== true) await rerun(p, null, join(dir, "clean.json"));
  const queue = faultList(args).filter((c) => !(resume && existsSync(join(dir, `${c}.json`))));
  const workers = Array.from({ length: parallel }, async () => {
    for (let c = queue.shift(); c !== undefined; c = queue.shift()) await rerun(p, ENV_PREFIX + c, join(dir, `${c}.json`));
  });
  await Promise.all(workers);
  process.stdout.write(`summaries in ${dir}\n`);
}

// ---------------- report ----------------

function summaryRows(file: string): { status: Record<string, RunStatus>; runIds: Record<string, string>; titles: Record<string, string> } {
  const s = rec(JSON.parse(readFileSync(file, "utf8")));
  const status: Record<string, RunStatus> = {};
  const runIds: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const row of Array.isArray(s.runs) ? s.runs : []) {
    const r = rec(row);
    const id = String(r.testId ?? "");
    if (!id) continue;
    status[id] = asStatus(r.status);
    if (typeof r.runId === "string") runIds[id] = r.runId;
    if (typeof r.title === "string") titles[id] = r.title;
  }
  return { status, runIds, titles };
}

function report(args: Args): void {
  const p = projectId(args);
  const label = str(args, "label");
  const dir = join(ROOT, "runs", slug(label));
  if (!existsSync(join(dir, "clean.json"))) die(`no clean baseline in ${dir}; run the matrix first`);
  const clean = summaryRows(join(dir, "clean.json"));
  const suiteDoc = existsSync(join(dir, "suite.json")) ? rec(JSON.parse(readFileSync(join(dir, "suite.json"), "utf8"))) : {};
  const names: Record<string, string> = {};
  for (const t of Array.isArray(suiteDoc.items) ? suiteDoc.items : []) {
    const r = rec(t);
    if (typeof r.id === "string" && typeof r.name === "string") names[r.id] = r.name;
  }
  const ids = Object.keys(clean.status);
  const suite = ids.map((testId) => ({ testId, title: (names[testId] ?? clean.titles[testId] ?? testId).slice(0, 200) }));
  const faults: FaultRow[] = [];
  for (const f of readdirSync(dir).filter((n) => /^m\d{2}\.json$/.test(n)).sort()) {
    const rows = summaryRows(join(dir, f));
    faults.push({ code: f.slice(0, 3), results: rows.status, runIds: rows.runIds });
  }
  const note = typeof args.note === "string" ? args.note.slice(0, 400) : undefined;
  const runDoc: MatrixRun = {
    label: label.slice(0, 80),
    generatedAt: new Date().toISOString(),
    projectId: p,
    origin: origin(args),
    autoHeal: false,
    suite,
    baseline: clean.status,
    faults,
    ...(note ? { note } : {}),
  };
  let doc: Report = { schema: "saboteur.report/1", runs: [] };
  if (existsSync(REPORT)) {
    const prev = parseReport(JSON.parse(readFileSync(REPORT, "utf8")));
    if (!prev.ok) die(`existing ${REPORT} is invalid: ${prev.error}`);
    doc = prev.value;
  }
  const runs = [...doc.runs.filter((r) => r.label !== runDoc.label), runDoc];
  const next: Report = { schema: "saboteur.report/1", runs };
  const check = parseReport(JSON.parse(JSON.stringify(next)));
  if (!check.ok) die(`refusing to write an invalid report: ${check.error}`);
  const tmp = `${REPORT}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  renameSync(tmp, REPORT);
  const s = scoreRun(runDoc);
  process.stdout.write(`${label}: ${s.caught} caught, ${s.survived} survived, ${s.inconclusive} inconclusive; score ${s.score === null ? "n/a" : Math.round(s.score * 100) + "%"}\n`);
  for (const f of s.faults.filter((x) => x.verdict !== "caught")) process.stdout.write(`  ${f.verdict.padEnd(12)} ${f.code}\n`);
}

const { cmd, args } = parseArgs(process.argv.slice(2));
if (cmd === "envs") await envs(args);
else if (cmd === "run") await run(args);
else if (cmd === "report") report(args);
else {
  process.stdout.write("usage: node scripts/saboteur.ts envs|run|report --project <id> [...]\n");
  process.exit(cmd === "help" ? 0 : 2);
}
