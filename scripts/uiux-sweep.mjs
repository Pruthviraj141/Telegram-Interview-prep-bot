#!/usr/bin/env node
/**
 * UI/UX sweep harness (dev-only, never imported by the app).
 *
 * For every route x viewport it records:
 *   - HTTP status and final URL (client-side redirects matter)
 *   - console errors / warnings and uncaught page errors
 *   - horizontal overflow (documentElement.scrollWidth > clientWidth) + offending nodes
 *   - axe-core violations (WCAG 2.x A/AA + best-practice), reported by impact
 *
 * Authenticated routes are seeded through the app's own localStorage token
 * (`ai_coach_auth_token`), supplied via the gitignored env var UIUX_DEV_TOKEN.
 * No credential is ever hardcoded here.
 *
 * Usage:
 *   UIUX_DEV_TOKEN=<local user id or jwt> node scripts/uiux-sweep.mjs
 *   UIUX_DEV_TOKEN=... node scripts/uiux-sweep.mjs --shots
 *   node scripts/uiux-sweep.mjs --routes=/history,/resume --widths=390
 *
 * Flags:
 *   --shots            write screenshots (default widths 390,768,1440)
 *   --widths=a,b,c     restrict viewports
 *   --routes=/a,/b     restrict routes (prefix match on route name or path)
 *   --label=before     name for report + screenshot files
 *   --base=URL         frontend origin (default http://127.0.0.1:3000)
 *   --api=URL          backend API base (default http://127.0.0.1:8000/api)
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FRONTEND = path.join(ROOT, "frontend");

const ALL_WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440, 1920];
const MOBILE_MAX = 768; // touch emulation at or below this width
const SHOT_WIDTHS = [390, 768, 1440];

function arg(name, fallback = undefined) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
}

const BASE = String(arg("base", process.env.UIUX_BASE_URL || "http://127.0.0.1:3000")).replace(/\/$/, "");
const API = String(arg("api", process.env.UIUX_API_URL || "http://127.0.0.1:8000/api")).replace(/\/$/, "");
const TOKEN = process.env.UIUX_DEV_TOKEN || "";
const LABEL = String(arg("label", "sweep"));
const WANT_SHOTS = Boolean(arg("shots", false));
const widthFilter = arg("widths", "");
const routeFilter = arg("routes", "");

const widths = widthFilter
  ? String(widthFilter).split(",").map((w) => Number(w.trim())).filter(Boolean)
  : ALL_WIDTHS;
const shotWidths = WANT_SHOTS
  ? widths.filter((w) => SHOT_WIDTHS.includes(w))
  : [];

const REPORT_DIR = path.join(ROOT, ".uiux", "reports");
const SHOT_DIR = path.join(ROOT, ".uiux", "shots");

// ---------------------------------------------------------------- tool loading

async function loadTools() {
  const pwEntry = require.resolve("playwright", { paths: [FRONTEND] });
  const pw = await import(pathToFileURL(pwEntry).href);
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) throw new Error("playwright: chromium export not found");

  const axeEntry = require.resolve("@axe-core/playwright", { paths: [FRONTEND] });
  const axeMod = await import(pathToFileURL(axeEntry).href);
  const AxeBuilder = axeMod.default?.default ?? axeMod.default ?? axeMod.AxeBuilder;
  if (typeof AxeBuilder !== "function") throw new Error("@axe-core/playwright: AxeBuilder not found");

  return { chromium, AxeBuilder };
}

// ---------------------------------------------------------------- route model

async function resolveRoutes() {
  const routes = [
    { name: "dashboard", path: "/", auth: true },
    { name: "interview-setup", path: "/interview", auth: true },
    { name: "resume", path: "/resume", auth: true },
    { name: "history", path: "/history", auth: true },
    { name: "tracker", path: "/tracker", auth: true },
    { name: "company-prep", path: "/company-prep", auth: true },
    { name: "settings", path: "/settings", auth: true },
    { name: "not-found", path: "/uiux-sweep-does-not-exist", auth: false },
  ];

  if (TOKEN) {
    try {
      const res = await fetch(`${API}/interview/sessions`, {
        headers: { Authorization: `Bearer ${TOKEN}`, "X-Clerk-User-Id": TOKEN },
      });
      if (res.ok) {
        const sessions = await res.json();
        const list = Array.isArray(sessions) ? sessions : [];
        const finished = list.find((s) => s.status === "completed" || s.status === "partial_completed");
        const open = list.find((s) => s.status === "in_progress");
        if (finished) {
          routes.splice(2, 0, {
            name: "debrief",
            path: `/interview/${finished.id}/debrief`,
            auth: true,
          });
        }
        if (open) {
          routes.splice(2, 0, {
            name: "interview-studio",
            path: `/interview?resume=${open.id}`,
            auth: true,
          });
        }
        console.log(
          `resolved sessions: ${list.length} total, debrief=${finished?.id ?? "none"}, studio=${open?.id ?? "none"}`
        );
      } else {
        console.warn(`sessions API returned ${res.status}; debrief/studio routes skipped`);
      }
    } catch (err) {
      console.warn(`sessions API unreachable (${err.message}); debrief/studio routes skipped`);
    }
  }

  if (!routeFilter) return routes;
  const needles = String(routeFilter).split(",").map((s) => s.trim()).filter(Boolean);
  return routes.filter((r) => needles.some((n) => r.name.includes(n) || r.path.startsWith(n)));
}

// ---------------------------------------------------------------- page audit

const OVERFLOW_PROBE = `(() => {
  const de = document.documentElement;
  const limit = de.clientWidth;
  const scrollWidth = de.scrollWidth;
  const offenders = [];
  if (scrollWidth > limit + 1) {
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > limit + 1) {
        const style = getComputedStyle(el);
        if (style.position === "fixed" && style.visibility === "hidden") continue;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 90)) || "",
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
        if (offenders.length >= 8) break;
      }
    }
  }
  return { scrollWidth, clientWidth: limit, overflow: scrollWidth > limit + 1, offenders };
})()`;

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

async function auditRoute({ browser, AxeBuilder, route, width, runIndex }) {
  const isMobile = width <= MOBILE_MAX;
  const context = await browser.newContext({
    viewport: { width, height: width <= 480 ? 800 : 900 },
    deviceScaleFactor: 1,
    hasTouch: isMobile,
    isMobile,
    locale: "en-US",
    colorScheme: "light",
  });

  if (TOKEN) {
    await context.addInitScript((token) => {
      try {
        window.localStorage.setItem("ai_coach_auth_token", token);
      } catch {
        /* storage unavailable: sweep will show the signed-out state */
      }
    }, TOKEN);
  }

  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text().replace(/\s+/g, " ").trim();
    if (!text) return;
    (type === "error" ? consoleErrors : consoleWarnings).push(text.slice(0, 400));
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err && err.message ? err.message : err).slice(0, 400));
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText || "failed";
    if (failure.includes("ERR_ABORTED")) return; // navigation-cancelled prefetches
    failedRequests.push(`${req.method()} ${req.url().slice(0, 160)} :: ${failure}`);
  });

  const url = `${BASE}${route.path}`;
  let status = null;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = response ? response.status() : null;
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  } catch (err) {
    pageErrors.push(`navigation: ${err.message}`.slice(0, 400));
  }

  // let client-side data fetches settle and animations reach a stable frame
  await page.waitForTimeout(900);

  const overflow = await page.evaluate(OVERFLOW_PROBE).catch((err) => ({
    scrollWidth: 0,
    clientWidth: 0,
    overflow: false,
    offenders: [],
    error: err.message,
  }));

  let axeViolations = [];
  let axeError = null;
  try {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    axeViolations = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes.slice(0, 2).map((n) => String(n.target).slice(0, 120)),
      }));
  } catch (err) {
    axeError = err.message;
  }

  let shot = null;
  if (shotWidths.includes(width)) {
    const file = path.join(SHOT_DIR, `${LABEL}-${route.name}-${width}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
      shot = path.relative(ROOT, file);
    } catch (err) {
      pageErrors.push(`screenshot: ${err.message}`.slice(0, 300));
    }
  }

  const result = {
    route: route.name,
    path: route.path,
    width,
    isMobile,
    status,
    finalUrl: page.url().replace(BASE, ""),
    consoleErrors: dedupe(consoleErrors),
    consoleWarnings: dedupe(consoleWarnings),
    pageErrors: dedupe(pageErrors),
    failedRequests: dedupe(failedRequests),
    overflow,
    axe: axeViolations,
    axeError,
    shot,
  };

  await context.close();
  return result;
}

// ---------------------------------------------------------------- reporting

function summarise(results) {
  const byRoute = new Map();
  const totals = {
    runs: results.length,
    consoleErrors: 0,
    consoleWarnings: 0,
    pageErrors: 0,
    failedRequests: 0,
    overflow: 0,
    axeSerious: 0,
    axeCritical: 0,
    badStatus: 0,
  };

  for (const r of results) {
    totals.consoleErrors += r.consoleErrors.length;
    totals.consoleWarnings += r.consoleWarnings.length;
    totals.pageErrors += r.pageErrors.length;
    totals.failedRequests += r.failedRequests.length;
    if (r.overflow.overflow) totals.overflow += 1;
    for (const v of r.axe) {
      if (v.impact === "critical") totals.axeCritical += 1;
      else totals.axeSerious += 1;
    }
    if (r.status && r.status >= 400 && r.route !== "not-found") totals.badStatus += 1;

    const key = r.route;
    const entry = byRoute.get(key) || {
      route: r.route,
      path: r.path,
      consoleErrors: 0,
      consoleWarnings: 0,
      pageErrors: 0,
      failedRequests: 0,
      overflowWidths: [],
      axe: new Map(),
      statuses: new Set(),
    };
    entry.consoleErrors += r.consoleErrors.length;
    entry.consoleWarnings += r.consoleWarnings.length;
    entry.pageErrors += r.pageErrors.length;
    entry.failedRequests += r.failedRequests.length;
    if (r.overflow.overflow) entry.overflowWidths.push(r.width);
    entry.statuses.add(r.status);
    for (const v of r.axe) {
      const prev = entry.axe.get(v.id) || { id: v.id, impact: v.impact, help: v.help, runs: 0, nodes: 0 };
      prev.runs += 1;
      prev.nodes = Math.max(prev.nodes, v.nodes);
      entry.axe.set(v.id, prev);
    }
    byRoute.set(key, entry);
  }

  return { totals, byRoute: [...byRoute.values()] };
}

function printSummary(summary) {
  const { totals, byRoute } = summary;
  console.log("\n=== SWEEP TOTALS ===");
  console.log(JSON.stringify(totals, null, 2));
  console.log("\n=== PER ROUTE ===");
  for (const e of byRoute) {
    const axe = [...e.axe.values()]
      .map((v) => `${v.id}(${v.impact}, max ${v.nodes} nodes, ${v.runs} runs)`)
      .join("; ");
    console.log(
      [
        e.route.padEnd(18),
        `status=${[...e.statuses].join("/")}`,
        `console=${e.consoleErrors}e/${e.consoleWarnings}w`,
        `pageErrors=${e.pageErrors}`,
        `reqFailed=${e.failedRequests}`,
        `overflow@[${e.overflowWidths.join(",")}]`,
        axe ? `axe=${axe}` : "axe=clean",
      ].join("  ")
    );
  }
  console.log("\n=== CONSOLE / PAGE ERRORS (unique) ===");
  const unique = new Map();
  for (const r of summary.raw || []) {
    for (const msg of [...r.consoleErrors.map((m) => `E ${m}`), ...r.pageErrors.map((m) => `P ${m}`)]) {
      const key = msg.slice(0, 160);
      const prev = unique.get(key) || { count: 0, routes: new Set() };
      prev.count += 1;
      prev.routes.add(`${r.route}@${r.width}`);
      unique.set(key, prev);
    }
  }
  if (unique.size === 0) console.log("none");
  for (const [msg, meta] of unique) {
    console.log(`[${meta.count}x] ${msg}\n      ${[...meta.routes].slice(0, 6).join(", ")}`);
  }
}

// ---------------------------------------------------------------- main

async function main() {
  if (!TOKEN) {
    console.warn("UIUX_DEV_TOKEN is not set — authenticated routes will render their signed-out/error state.");
  }
  if (!existsSync(path.join(FRONTEND, "node_modules", "playwright"))) {
    throw new Error("playwright is not installed in frontend/node_modules — run `npm i -D playwright @axe-core/playwright`");
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  if (WANT_SHOTS) await fs.mkdir(SHOT_DIR, { recursive: true });

  const { chromium, AxeBuilder } = await loadTools();
  const routes = await resolveRoutes();
  if (routes.length === 0) throw new Error("no routes matched the --routes filter");

  console.log(`sweeping ${routes.length} routes x ${widths.length} viewports (${widths.join(",")}) on ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const route of routes) {
      for (const width of widths) {
        process.stdout.write(`  ${route.name} @ ${width} ... `);
        const r = await auditRoute({ browser, AxeBuilder, route, width, runIndex: results.length });
        const flags = [];
        if (r.consoleErrors.length) flags.push(`${r.consoleErrors.length} console-err`);
        if (r.pageErrors.length) flags.push(`${r.pageErrors.length} page-err`);
        if (r.failedRequests.length) flags.push(`${r.failedRequests.length} req-fail`);
        if (r.overflow.overflow) flags.push(`overflow ${r.overflow.scrollWidth}>${r.overflow.clientWidth}`);
        if (r.axe.length) flags.push(`axe ${r.axe.map((v) => v.id).join(",")}`);
        console.log(flags.length ? flags.join(" | ") : "ok");
        results.push(r);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = summarise(results);
  summary.raw = results;
  printSummary(summary);

  const reportPath = path.join(REPORT_DIR, `${LABEL}.json`);
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        label: LABEL,
        base: BASE,
        generatedAt: new Date().toISOString(),
        authenticated: Boolean(TOKEN),
        widths,
        shotWidths,
        totals: summary.totals,
        routes: summary.byRoute.map((e) => ({ ...e, axe: [...e.axe.values()], statuses: [...e.statuses] })),
        runs: results,
      },
      null,
      2
    )
  );
  console.log(`\nreport: ${path.relative(ROOT, reportPath)}`);
  if (shotWidths.length) console.log(`shots:  ${path.relative(ROOT, SHOT_DIR)} (${shotWidths.join(",")})`);

  const failed = summary.totals.consoleErrors + summary.totals.pageErrors > 0;
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(`\nsweep failed: ${err.stack || err.message}`);
  process.exitCode = 2;
});
