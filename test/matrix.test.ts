// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { describe, expect, it } from "vitest";
import { parseReport, scoreRun, type MatrixRun } from "../src/report/matrix";

const base: MatrixRun = {
  label: "Generated suite",
  generatedAt: "2026-10-19T12:00:00Z",
  projectId: "proj_1",
  origin: "https://saboteur.example",
  autoHeal: false,
  suite: [
    { testId: "t1", title: "Add to cart" },
    { testId: "t2", title: "Checkout" },
    { testId: "t3", title: "Flaky on clean" },
  ],
  baseline: { t1: "passed", t2: "passed", t3: "failed" },
  faults: [
    { code: "m01", results: { t1: "failed", t2: "passed", t3: "failed" } },
    { code: "m02", results: { t1: "passed", t2: "passed", t3: "failed" } },
    { code: "m03", results: { t1: "passed", t2: "timeout", t3: "passed" } },
    { code: "m04", results: { t1: "blocked", t2: "failed", t3: "passed" } },
  ],
};

describe("scoreRun", () => {
  it("classifies caught, survived and inconclusive", () => {
    const s = scoreRun(base);
    expect(s.faults.map((f) => f.verdict)).toEqual(["caught", "survived", "inconclusive", "caught"]);
    expect([s.caught, s.survived, s.inconclusive]).toEqual([2, 1, 1]);
    expect(s.score).toBeCloseTo(2 / 3);
    expect(s.faults[3]?.killers).toEqual(["t1", "t2"]);
  });
  it("a test that is red on the clean build can never claim a kill", () => {
    const s = scoreRun(base);
    expect(s.killsByTest.t3).toBe(0);
    expect(s.faults.every((f) => !f.killers.includes("t3"))).toBe(true);
    expect(s.idleTests).toEqual([]);
    expect(s.baselineGreen).toBe(2);
  });
  it("no green baseline means no score, not 0% or 100%", () => {
    const s = scoreRun({ ...base, baseline: { t1: "failed", t2: "timeout", t3: "failed" } });
    expect(s.score).toBeNull();
    expect(s.inconclusive).toBe(4);
  });
  it("idle tests are green tests that never killed anything", () => {
    const s = scoreRun({ ...base, faults: [{ code: "m01", results: { t1: "failed", t2: "passed" } }] });
    expect(s.idleTests).toEqual(["t2"]);
  });
});

describe("parseReport", () => {
  const doc = { schema: "saboteur.report/1", runs: [base] };
  it("accepts a valid report", () => {
    const p = parseReport(JSON.parse(JSON.stringify(doc)));
    expect(p.ok).toBe(true);
  });
  it("rejects auto-heal runs, bad origins, duplicate ids and bad codes", () => {
    const bad = [
      { ...doc, schema: "x" },
      { ...doc, runs: [{ ...base, autoHeal: true }] },
      { ...doc, runs: [{ ...base, origin: "javascript:alert(1)" }] },
      { ...doc, runs: [{ ...base, origin: "http://plain.example" }] },
      { ...doc, runs: [{ ...base, suite: [...base.suite, { testId: "t1", title: "dup" }] }] },
      { ...doc, runs: [{ ...base, faults: [{ code: "zz", results: {} }] }] },
      { ...doc, runs: [{ ...base, faults: [base.faults[0], base.faults[0]] }] },
      { ...doc, runs: [{ ...base, generatedAt: "yesterday" }] },
      { ...doc, runs: [{ ...base, suite: [{ testId: "<script>", title: "x" }] }] },
      { ...doc, runs: Array.from({ length: 21 }, () => base) },
    ];
    for (const b of bad) expect(parseReport(JSON.parse(JSON.stringify(b))).ok).toBe(false);
  });
  it("coerces unknown statuses and drops results for tests not in the suite", () => {
    const p = parseReport({ ...doc, runs: [{ ...base, faults: [{ code: "m01", results: { t1: "exploded", ghost: "failed" } }] }] });
    expect(p.ok && p.value.runs[0]?.faults[0]?.results).toEqual({ t1: "unknown" });
  });
  it("random structures never throw", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const gen = (d: number): unknown => {
      const r = rnd();
      if (d > 3 || r < 0.2) return [null, 1, "s", true, -0.5][Math.floor(rnd() * 5)];
      if (r < 0.6) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(d + 1));
      return Object.fromEntries(["schema", "runs", "suite", "baseline", "faults", "code", "results", "label"].filter(() => rnd() < 0.5).map((k) => [k, gen(d + 1)]));
    };
    for (let i = 0; i < 2000; i++) expect(() => parseReport(gen(0))).not.toThrow();
  });
});
