// Lighthouse mobile scores for the public pages (PRD 17, acceptance criterion 14).
// Run against a production build: `pnpm build && pnpm start`, then `pnpm lighthouse [base-url]`.
// Uses Lighthouse's default mobile settings (emulated phone, simulated slow 4G and CPU slowdown).
import { mkdirSync, writeFileSync } from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = [
  ["start", "/"],
  ["link that doesn't work", "/confirm/not-a-real-link"],
  ["staff sign-in", "/admin/sign-in"],
];
const TARGET = { performance: 85, accessibility: 95 };
const OUT = "lighthouse-reports";

mkdirSync(OUT, { recursive: true });
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromeFlags: ["--headless=new", "--no-sandbox"],
});
let failed = false;
try {
  for (const [name, path] of PAGES) {
    const runs = [];
    // Three runs per page, keeping the median performance score, as Lighthouse recommends.
    for (let i = 0; i < 3; i++) {
      const result = await lighthouse(`${BASE}${path}`, {
        port: chrome.port,
        output: "html",
        onlyCategories: ["performance", "accessibility", "best-practices"],
      });
      runs.push(result);
    }
    runs.sort((a, b) => a.lhr.categories.performance.score - b.lhr.categories.performance.score);
    const median = runs[1];
    const scores = Object.fromEntries(Object.entries(median.lhr.categories).map(([k, c]) => [k, Math.round(c.score * 100)]));
    const ok = scores.performance >= TARGET.performance && scores.accessibility >= TARGET.accessibility;
    failed ||= !ok;
    const metrics = median.lhr.audits;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${name}: performance ${scores.performance}, accessibility ${scores.accessibility}, best practices ${scores["best-practices"]}` +
        ` (LCP ${metrics["largest-contentful-paint"].displayValue}, TBT ${metrics["total-blocking-time"].displayValue}, CLS ${metrics["cumulative-layout-shift"].displayValue})`,
    );
    writeFileSync(`${OUT}/${name.replace(/\W+/g, "-")}.html`, median.report);
  }
} finally {
  await chrome.kill();
}
process.exit(failed ? 1 : 0);
