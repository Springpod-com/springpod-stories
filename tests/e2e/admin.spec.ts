import { expect, test } from "@playwright/test";
import { openStory, sendStory, signIn, waitForStatus } from "./admin-helpers";
import { editLinkFor } from "./outbox";

test.describe("admin (PRD 11)", () => {
  test("only signed-in staff get in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/sign-in/);
    expect((await page.request.get("/admin/stories/anything", { maxRedirects: 0 })).status()).toBe(307);
    await signIn(page, "not.staff@springpod.com", { expectIn: false });
    await expect(page.getByText("You can't sign in with that account")).toBeVisible();
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Story queue" })).toBeVisible();
  });

  test("approve stays disabled until every video check is ticked (acceptance criterion 8)", async ({ page }, info) => {
    test.slow();
    const { headline, email } = await sendStory(page, info, { video: true });
    await signIn(page);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Video checks" })).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeDisabled();
    await expect(page.getByTestId("approve-blockers")).toContainText("Tick every video check first.");
    const boxes = page.getByRole("checkbox");
    await expect(boxes).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await boxes.nth(i).click();
      await expect(boxes.nth(i)).toBeChecked();
    }
    await expect(page.getByText("Team review · 6 of 6")).toBeVisible();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.locator("article [data-status=approved]")).toBeVisible();

    // Approved video downloads (PRD 12): the MP4, captions and poster frame.
    await expect(page.getByRole("link", { name: "Download video (MP4)" })).toBeVisible();
    const captions = await page.request.get((await page.getByRole("link", { name: "Download captions (SRT)" }).getAttribute("href"))!);
    expect(captions.headers()["content-type"]).toContain("application/x-subrip");
    expect(await captions.text()).toMatch(/^1\n00:00:00,000 --> /);
    await expect(page.getByRole("link", { name: "Download poster frame" })).toBeVisible();
  });

  test("approve stays disabled while parent consent is pending", async ({ page }, info) => {
    const { headline } = await sendStory(page, info, { age: "14 to 17" });
    await signIn(page);
    await openStory(page, headline);
    await waitForStatus(page, "awaiting_parent");
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByTestId("approve-blockers")).toContainText("Waiting for the parent or carer to approve.");
    await expect(page.getByRole("button", { name: "Resend parent email" })).toBeVisible();
  });

  test("request changes emails an edit link; the edited story comes back to review", async ({ page }, info) => {
    const { headline, email } = await sendStory(page, info);
    await signIn(page);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await page.getByRole("button", { name: "Request changes" }).click();
    await page.getByLabel("Message").fill("Please add one moment that stood out.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("article [data-status=changes_requested]")).toBeVisible();

    await page.goto(editLinkFor(email)!);
    await expect(page.getByText("Please add one moment that stood out.")).toBeVisible();
    await page.getByLabel("Story", { exact: true }).fill("The moment that stood out was presenting to the whole team on my last day.");
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(page.locator("[data-done]")).toBeVisible();

    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await expect(page.getByText("The moment that stood out was presenting")).toBeVisible();
  });

  test("reject needs a reason", async ({ page }, info) => {
    const { headline } = await sendStory(page, info);
    await signIn(page);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("button", { name: "Reject story" })).toBeDisabled();
    await page.getByLabel("Reason").fill("Not a work experience story.");
    await page.getByRole("button", { name: "Reject story" }).click();
    await expect(page.locator("article [data-status=rejected]")).toBeVisible();
  });
});

test.describe("admin layout @layout", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("no horizontal scroll on the queue or a story", async ({ page }) => {
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await signIn(page);
    expect(await noSideScroll()).toBe(true);
    const first = page.getByRole("link", { name: /./ }).filter({ has: page.locator("[data-status]") }).first();
    if (await first.count()) {
      await first.click();
      await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
      expect(await noSideScroll()).toBe(true);
    }
  });
});
