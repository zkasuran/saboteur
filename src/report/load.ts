// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { parseReport, type Report } from "./matrix";

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;

export type Loaded = { state: "ok"; report: Report } | { state: "empty" } | { state: "error"; message: string };

let cache: Promise<Loaded> | null = null;

/** Fetch `/report.json` once per page load: timeout, size cap and full shape validation before use. */
export function loadReport(): Promise<Loaded> {
  cache ??= fetchReport().then((r) => {
    if (r.state === "error") cache = null;
    return r;
  });
  return cache;
}

async function fetchReport(): Promise<Loaded> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/report.json", { signal: ctl.signal, cache: "no-cache", credentials: "omit" });
    if (res.status === 404) return { state: "empty" };
    if (!res.ok) return { state: "error", message: `The report could not be loaded (HTTP ${res.status}).` };
    const text = await res.text();
    if (text.length > MAX_BYTES) return { state: "error", message: "The report is larger than the viewer accepts." };
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { state: "error", message: "The report is not valid JSON." };
    }
    const parsed = parseReport(json);
    if (!parsed.ok) return { state: "error", message: `The report failed validation: ${parsed.error}.` };
    return parsed.value.runs.length === 0 ? { state: "empty" } : { state: "ok", report: parsed.value };
  } catch {
    return { state: "error", message: ctl.signal.aborted ? "The report took too long to load." : "The report could not be reached. Check your connection." };
  } finally {
    window.clearTimeout(timer);
  }
}
