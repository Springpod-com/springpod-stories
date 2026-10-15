import "server-only";
import { chromium } from "playwright-core";
import { writeAudit } from "./audit";
import { db } from "./db";
import { renderQuery } from "./render-sign";
import { putObject } from "./storage";

/**
 * Quote card PNGs (PRD 12): 1080 x 1350 (4:5) and 1080 x 1920 (9:16). Headless Chromium opens the
 * render page at 360 pixels wide and three times the pixel density, and screenshots the card.
 * The card grows rather than clips (PRD 5.4), so a very long quote would make a taller image.
 */
const SIZES = [
  { kind: "quote_card_4x5", shape: "portrait", height: 450 },
  { kind: "quote_card_9x16", shape: "story", height: 640 },
] as const;
const WIDTH = 360;
const SCALE = 3;

const renderBase = () => process.env.RENDER_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export async function renderQuoteCards(storyId: string): Promise<string> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { status: true, withdrawnAt: true } });
  if (!story || story.withdrawnAt) return "skipped";
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const keys: string[] = [];
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: WIDTH, height: size.height }, deviceScaleFactor: SCALE, reducedMotion: "reduce" });
      const url = new URL(`/render/quote-card/${storyId}?${renderQuery(storyId, size.shape)}`, renderBase());
      const res = await page.goto(url.toString(), { waitUntil: "networkidle" });
      if (!res?.ok()) throw new Error(`Render page returned ${res?.status()}`);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.locator("[data-render-card] figure").screenshot({ type: "png" });
      await page.close();
      const key = `assets/${storyId}/${size.kind}-${Date.now()}.png`;
      await putObject(key, png, "image/png");
      await db.asset.create({ data: { storyId, kind: size.kind, storageKey: key, createdBy: "system" } });
      keys.push(key);
    }
    await writeAudit(db, { storyId, actorType: "system", action: "quote_cards_rendered", payload: { count: keys.length } });
    return "rendered";
  } finally {
    await browser.close();
  }
}
