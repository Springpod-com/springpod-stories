import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { STAFF } from "./global-setup";
import { answer, heading, pick, startAs, uniqueEmail, chooseGoodVideo, writeStory } from "./helpers";
import { confirmLinkFor, editLinkFor } from "./outbox";

async function signIn(page: Page, email = STAFF.moderator, { expectIn = true } = {}) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Staff email").fill(email);
  await page.getByRole("button", { name: "Sign in for development" }).click();
  if (expectIn) await expect(page.getByRole("heading", { name: "Story queue" })).toBeVisible();
}

/** Sends a story through the public flow and confirms the email. Returns the headline to find it by. */
async function sendStory(page: Page, info: TestInfo, { video = false, age = "18 to 24" } = {}) {
  const email = uniqueEmail("admin", info);
  const name = `Ada${info.workerIndex}${Date.now() % 100000}`;
  await startAs(page, "Student", age, name);
  await pick(page, "Internship");
  await answer(page, "Engineering");
  await answer(page, "", "Skip");
  await pick(page, age === "14 to 17" ? "At school" : "At university");
  await pick(page, /^Tell it myself/);
  if (video) {
    await pick(page, /^Video/);
    await page.getByRole("button", { name: "I'm ready to film" }).click();
    await chooseGoodVideo(page);
    await page.getByRole("button", { name: "Write up my story" }).click();
  } else {
    await pick(page, /^Write it/);
    await writeStory(page);
  }
  await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?", { timeout: 20_000 });
  const headline = `Story by ${name}`;
  await page.getByLabel("Headline").fill(headline);
  await page.getByRole("button", { name: "Looks good" }).click();
  await pick(page, new RegExp(`^First name`));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /^On Springpod/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await answer(page, email);
  if (age === "14 to 17") await answer(page, uniqueEmail("parent", info));
  await page.getByRole("button", { name: /^This is my own experience/ }).click();
  await page.getByRole("button", { name: "Send my story" }).click();
  await expect(heading(page)).toContainText("Your story is in.");
  // The pre-screen runs in the worker; the confirm link works whenever it is opened.
  await page.goto(confirmLinkFor(email)!);
  await expect(heading(page)).toHaveText("Email confirmed");
  return { headline, email };
}

async function openStory(page: Page, headline: string) {
  await page.goto("/admin");
  await page.getByLabel("Search headlines and stories").fill(headline);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByRole("link", { name: /Story by/ })).toHaveCount(1);
  await page.getByRole("link", { name: new RegExp(headline) }).click();
  await expect(page.getByRole("heading", { level: 2, name: headline })).toBeVisible();
}

/** The pre-screen runs in the worker; reload until the story reaches `status`. */
async function waitForStatus(page: Page, status: string) {
  await expect(async () => {
    await page.reload();
    await expect(page.locator(`article [data-status=${status}]`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}

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
