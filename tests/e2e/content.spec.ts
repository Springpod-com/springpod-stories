import { expect, test, type Page } from "@playwright/test";
import { openStory, sendStory, signIn, waitForStatus } from "./admin-helpers";
import { STAFF } from "./global-setup";
import { emailFor } from "./outbox";

/** The natural size of an image on the page. */
const imageSize = (page: Page, kind: string) =>
  page.locator(`[data-asset=${kind}] img`).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);

// A 160-character quote, the longest allowed (acceptance criterion 11).
const LONG_QUOTE = "The moment I presented our findings to the whole team and someone asked me a follow-up question, I realised they actually trusted what I had to say about it all";

test.describe("content pack, publishing and removal (PRD 12, 14, 9.3)", () => {
  test("content team makes a pack for the agreed channels, with quote card images at both sizes", async ({ page }, info) => {
    test.slow();
    expect(LONG_QUOTE).toHaveLength(160);
    const { headline, email } = await sendStory(page, info, { quote: LONG_QUOTE });
    await signIn(page, STAFF.content);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("article [data-status=approved]")).toBeVisible();

    await page.getByRole("button", { name: "Generate content pack" }).click();
    // The person chose "On Springpod" only: a programme page snippet and tags, no social posts.
    await expect(page.locator("[data-asset=snippet]")).toBeVisible();
    await expect(page.locator("[data-asset=tags]")).toBeVisible();
    await expect(page.locator("[data-asset=linkedin], [data-asset=instagram], [data-asset=video_hook], [data-asset=blog]")).toHaveCount(0);
    await expect(page.locator("[data-asset=snippet]").getByRole("button", { name: "Copy" })).toBeVisible();

    // The worker draws the cards with headless Chromium; the quote never clips, so the card keeps its size.
    await expect(async () => {
      await page.reload();
      await expect(page.locator("[data-asset=quote_card_9x16] img")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 60_000 });
    expect(await imageSize(page, "quote_card_4x5")).toEqual([1080, 1350]);
    expect(await imageSize(page, "quote_card_9x16")).toEqual([1080, 1920]);

    // Published: the person is emailed the link and a quote card download.
    await page.getByLabel("Link to the published story").fill("https://springpod.com/stories/example");
    await page.getByRole("button", { name: "Mark as published" }).click();
    await expect(page.locator("[data-published]")).toBeVisible();
    await expect.poll(() => emailFor("published", email)).toBeTruthy();
    const published = emailFor("published", email)!;
    expect(published.text).toContain("Share it: https://springpod.com/stories/example");
    const card = /(\/api\/card\/[\w-]+\?sig=[\w-]+)/.exec(published.text)![1]!;
    const res = await page.request.get(card, { maxRedirects: 0 });
    expect(res.status()).toBe(307);

    // "Remove my story" from the email: the story is withdrawn and the card link stops working.
    const remove = /(\/remove\/[\w-]+)/.exec(published.text)![1]!;
    await page.goto(remove);
    await expect(page.getByRole("heading", { name: "Remove my story" })).toBeVisible();
    await page.getByRole("button", { name: "Remove my story" }).click();
    await expect(page.locator("[data-removed]")).toBeVisible();
    expect((await page.request.get(card, { maxRedirects: 0 })).status()).toBe(404);
    await openStory(page, headline);
    await expect(page.locator("article [data-status=withdrawn]")).toBeVisible();
  });

  test("moderators see the pack but can't make one", async ({ page }, info) => {
    const { headline } = await sendStory(page, info);
    await signIn(page);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await expect(page.getByText("Only the content team can make content packs.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate content pack" })).toHaveCount(0);
  });
});
