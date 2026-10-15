import { expect, test, type Page } from "@playwright/test";
import { answer, chooseMedia, heading, pick, sentEvents, startAs, uniqueEmail, chooseGoodVideo } from "./helpers";

/** Answers the questions before the story, choosing a voice note or video. */
async function reachCapture(page: Page, format: "Video" | "Voice note") {
  await startAs(page, "Student", "18 to 24", "Sam");
  await pick(page, "Internship");
  await answer(page, "Children's ward");
  await answer(page, "", "Skip");
  await pick(page, "At university");
  await pick(page, /^Tell it myself/);
  await pick(page, new RegExp(`^${format}`));
  await page.getByRole("button", { name: format === "Video" ? "I'm ready to film" : "I'm ready to record" }).click();
}

const check = (page: Page, id: string) => page.locator(`[data-check=${id}]`);

test.describe("voice notes and videos (PRD 6.3, 7)", () => {
  test("a video passes the checks, uploads, is transcribed and goes all the way through", async ({ page }, testInfo) => {
    await reachCapture(page, "Video");
    await expect(heading(page)).toHaveText("Film your video");
    await expect(page.getByRole("button", { name: "Film now" })).toBeVisible();
    await expect(page.getByText("Upload a file")).toBeVisible();

    await chooseGoodVideo(page);

    // Corrections are kept, and a short transcript is refused with the prototype message.
    const box = page.getByRole("textbox");
    await box.fill("Too short now.");
    await page.getByRole("button", { name: "Write up my story" }).click();
    await expect(page.locator("[data-slot=field-error]")).toHaveText("The transcript looks too short. Add anything that's missing.");
    await box.fill(
      "On my first day I shadowed a nurse on the children's ward. I set up games in the playroom and talked to families. " +
        "The calm way everyone worked when it got busy really stuck with me.",
    );
    await expect(page.getByText("36 words")).toBeVisible();
    await page.getByRole("button", { name: "Write up my story" }).click();

    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await page.getByRole("button", { name: "Looks good" }).click();
    await pick(page, "First name (Sam)");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^On Springpod/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, uniqueEmail("sam", testInfo));
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(heading(page)).toHaveText("Thanks, Sam. Your story is in.");
  });

  test("a video that fails a check can be replaced, and the failing check says how to fix it", async ({ page }) => {
    await reachCapture(page, "Video");
    await chooseMedia(page, "short-video.webm", "capture");
    await expect(page.locator("[data-verdict=fail]")).toContainText("Let's try that again.");
    await expect(check(page, "length")).toHaveAttribute("data-state", "fail");
    await expect(check(page, "length")).toContainText("is a bit short. Aim for at least 10 seconds");
    await expect(page.getByRole("button", { name: "Use this video" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Film again" })).toBeVisible();
    expect((await sentEvents(page)).filter((e) => e.name === "media_checks_result")).toEqual([
      { name: "media_checks_result", format: "video", verdict: "fail", failed: "length" },
    ]);

    await page.getByRole("button", { name: "Upload a different file" }).click();
    expect((await sentEvents(page)).filter((e) => e.name === "media_retry")).toEqual([
      { name: "media_retry", format: "video", reason: "different_file" },
    ]);
    await chooseMedia(page, "dark-video.webm");
    await expect(page.locator("[data-verdict=warn]")).toContainText("Good to go.");
    await expect(check(page, "light")).toContainText("It looks dark. Face a window or turn on a light in front of you.");
    await expect(page.getByRole("button", { name: "Use this video" })).toBeVisible();
  });

  test("a file that isn't a video is refused straight away", async ({ page }) => {
    await reachCapture(page, "Video");
    await chooseMedia(page, "not-media.txt");
    await expect(check(page, "format")).toContainText("That isn't a video file.");
    await expect(page.locator("[data-verdict=fail]")).toBeVisible();
  });

  test("a voice note is checked with the voice rules and transcribed", async ({ page }) => {
    await reachCapture(page, "Voice note");
    await expect(heading(page)).toHaveText("Record your voice note");
    await chooseMedia(page, "quiet-voice.ogg");
    await expect(check(page, "volume")).toHaveAttribute("data-state", "fail");
    await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();

    await chooseMedia(page, "good-voice.ogg", "capture");
    await expect(page.locator("[data-verdict=pass]")).toContainText("Your voice note passed every check.");
    await expect(page.locator("audio")).toBeVisible();
    await page.getByRole("button", { name: "Use this voice note" }).click();
    await expect(heading(page)).toHaveText("Check your transcript");
    await expect(page.getByText("We turned your voice note into text.")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue(/children's ward/, { timeout: 60_000 });
  });

  test("the chosen video and corrected transcript pick up again after a reload", async ({ page }) => {
    await reachCapture(page, "Video");
    await chooseGoodVideo(page);
    await page.getByRole("textbox").fill(
      "Edited after the reload test. I set up games, talked with families and learned how a busy ward keeps calm. It made me sure about nursing.",
    );
    // Corrections save as people type.
    await page.waitForResponse((r) => r.url().includes("/api/media/") && r.request().method() === "PATCH");

    await page.reload();
    await page.getByRole("button", { name: "Start my story" }).click();
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page)).toHaveText("Check your transcript");
    await expect(page.getByRole("textbox")).toHaveValue(/^Edited after the reload test/);
  });

  test("the tips are one tap away and the format can be changed", async ({ page }) => {
    await reachCapture(page, "Video");
    await page.getByRole("button", { name: "See all tips" }).click();
    await expect(heading(page)).toHaveText("How to film a great video");
    await page.getByRole("button", { name: "I'm ready to film" }).click();
    await page.getByRole("button", { name: "Change how I tell it" }).click();
    await expect(heading(page)).toHaveText("How do you want to tell your story?");
  });
});

test.describe("media layout @layout", () => {
  // Measured with motion reduced, so the slide-in between screens doesn't count as overflow.
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("no horizontal scroll on the capture and checks screens", async ({ page }) => {
    const noSideScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await reachCapture(page, "Video");
    await expect(heading(page)).toHaveText("Film your video");
    expect(await noSideScroll()).toBe(true);
    await chooseMedia(page, "short-video.webm");
    await expect(page.locator("[data-verdict=fail]")).toBeVisible();
    expect(await noSideScroll()).toBe(true);
  });
});
