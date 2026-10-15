import AxeBuilder from "@axe-core/playwright";
import { test, type Page } from "@playwright/test";

/** WCAG 2.2 AA (PRD 17). */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** PRD 17: touch targets 44px or more. With a mouse, WCAG 2.2's 24px (2.5.8). */
const MIN_TOUCH = 44;
const MIN_POINTER = 24;

/**
 * Known design system issues, raised with the design system team (build plan M8.4): the warning
 * colours (`warning-foreground` on `warning`) measure 4.49:1, just under 4.5:1.
 */
const KNOWN_DS_ISSUES = [{ rule: "color-contrast", summary: /#8c5e03, background color: #fee2af/ }];

const known = (rule: string, summary = "") => KNOWN_DS_ISSUES.some((k) => k.rule === rule && k.summary.test(summary));

/** Axe problems and small touch targets on the page as it is now, labelled with the screen. */
export async function a11yProblems(page: Page, screen: string): Promise<string[]> {
  // Screens fade in; measure contrast once they have.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = result.violations.flatMap((v) => {
    const nodes = v.nodes.filter((n) => !known(v.id, n.failureSummary));
    if (!nodes.length) return [];
    const why = nodes[0]?.failureSummary?.replace(/\s+/g, " ").slice(0, 200);
    return [`${screen}: ${v.id} (${v.impact}) ${nodes.map((n) => n.target.join(" ")).join(", ")}: ${why}`];
  });
  const small = await page.evaluate(([touch, pointer]) => {
    const min = matchMedia("(pointer: coarse)").matches ? touch : pointer;
    // The design system's `ds-touch` adds an invisible 44px ::before on touch screens.
    const size = (el: Element) => {
      const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, "::before");
      const hit = before.content !== "none" && before.position === "absolute";
      return {
        w: Math.max(r.width, hit ? parseFloat(before.width) || 0 : 0),
        h: Math.max(r.height, hit ? parseFloat(before.height) || 0 : 0),
      };
    };
    const targets = document.querySelectorAll<HTMLElement>(
      "button, a[href], [role=radio], [role=checkbox], [role=tab], input:not([type=hidden]):not(.sr-only), textarea, select",
    );
    return [...targets]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (!r.width || !r.height || style.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) return false;
        // WCAG 2.5.8's inline exception: a link in a sentence. Touch screens still get 44px from ds-touch.
        const own = el.textContent?.trim().length ?? 0;
        const inSentence = (el.parentElement?.textContent?.trim().length ?? 0) > own + 2;
        if (min === pointer && inSentence) return false;
        const { w, h } = size(el);
        return h < min || w < min;
      })
      .map((el) => {
        const { w, h } = size(el);
        const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
        return `target ${Math.round(w)}x${Math.round(h)} under ${min}px "${name}"`;
      });
  }, [MIN_TOUCH, MIN_POINTER] as const);
  const sideScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  // For comparing with design/screens: SCREENSHOT_DIR=… pnpm test:e2e tests/e2e/a11y.spec.ts
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${test.info().project.name}/${screen.replace(/[^\w-]+/g, "-")}.png`, fullPage: true });
  return [...problems, ...small.map((s) => `${screen}: ${s}`), ...(sideScroll ? [`${screen}: scrolls sideways`] : [])];
}
