import { expect, test } from "@playwright/test";
import { a11yProblems } from "./a11y-helpers";
import { openStory, sendStory, signIn, waitForStatus } from "./admin-helpers";
import { STAFF } from "./global-setup";
import { editLinkFor, emailFor, parentLinkFor } from "./outbox";
import { answer, chooseGoodVideo, chooseMedia, heading, interview, pick, startAs, uniqueEmail } from "./helpers";

/** Every screen in `design/screens/` checked with axe (WCAG 2.2 AA) and for 44px targets (PRD 17). */
test.describe("accessibility and layout of every screen @a11y @layout", () => {
  test.describe.configure({ timeout: 120_000 });
  // Screens fade in; with motion reduced, colours are measured as they end up.
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("the video path, from start to done", async ({ page }, info) => {
    const problems: string[] = [];
    const check = async (screen: string) => problems.push(...(await a11yProblems(page, screen)));

    await page.goto("/");
    await check("01 start");
    await page.getByRole("button", { name: "Start my story" }).click();
    await check("02 who");
    await pick(page, /^Working professional/);
    await check("03 age");
    await pick(page, "25 or over");
    await check("04 first name");
    await answer(page, "Tom");
    await check("05/06 first job field");
    await answer(page, "Construction");
    await check("07 organisation");
    await answer(page, "", "Skip");
    await check("08 what now");
    await pick(page, "Working");
    await check("09 current role");
    await answer(page, "Site Manager");
    await check("10 current company");
    await answer(page, "Northern Build Co");
    await check("11 industry");
    await pick(page, "Construction and engineering");
    await check("12 interview or self");
    await pick(page, /^Tell it myself/);
    await check("13 format");
    await pick(page, /^Video/);
    await check("14 video guide");
    await page.getByRole("button", { name: "I'm ready to film" }).click();
    await check("15 video capture");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Upload a file/ }).click();
    expect((await chooser).isMultiple()).toBe(false);
    await chooseMedia(page, "short-video.webm");
    await expect(page.locator("[data-verdict=fail]")).toBeVisible({ timeout: 20_000 });
    await check("16 video checks (fail)");
    await page.getByRole("button", { name: "Upload a different file" }).click();
    await page.getByTestId("upload-input").setInputFiles([]);
    await page.reload();
    await page.getByRole("button", { name: "Start my story" }).click();
    await expect(heading(page)).toHaveText("Film your video");
    await chooseGoodVideo(page);
    await check("17 transcript");
    await page.getByRole("button", { name: "Write up my story" }).click();
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await check("18 draft and quote");
    await page.getByRole("button", { name: "Looks good" }).click();
    await check("19 name display");
    await pick(page, "First name (Tom)");
    await page.getByRole("button", { name: "Continue" }).click();
    await check("20 show company");
    await pick(page, "Yes, show it");
    await page.getByRole("button", { name: "Continue" }).click();
    await check("21 channels");
    await page.getByRole("button", { name: /^On Springpod/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await check("22 email");
    await answer(page, uniqueEmail("tom", info));
    await check("23 confirm");
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(heading(page)).toHaveText("Thanks, Tom. Your story is in.");
    await check("24 done");

    expect(problems).toEqual([]);
  });

  test("voice note checks, the interview and the stop screen", async ({ page }) => {
    const problems: string[] = [];
    const check = async (screen: string) => problems.push(...(await a11yProblems(page, screen)));

    await startAs(page, "Student", "18 to 24", "Sam");
    await pick(page, "Internship");
    await answer(page, "Children's ward");
    await answer(page, "", "Skip");
    await pick(page, "At university");
    await pick(page, /^Tell it myself/);
    await pick(page, /^Voice note/);
    await check("25 voice guide");
    await page.getByRole("button", { name: "I'm ready to record" }).click();
    await chooseMedia(page, "quiet-voice.ogg");
    await expect(page.locator("[data-verdict=fail]")).toBeVisible({ timeout: 20_000 });
    await check("26 voice checks (fail)");

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page)).toHaveText("How do you want to tell your story?");
    await pick(page, /^Interview me/);
    await check("27 interview");
    await interview(page);
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");

    await page.goto("/");
    await page.getByRole("button", { name: "Start my story" }).click();
    await page.getByRole("link", { name: /start again/i }).or(page.getByRole("button", { name: "Start again" })).first().click().catch(() => {});
    await expect(page.locator("main")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("the under 14 stop screen", async ({ page }) => {
    await startAs(page, "Student", "Under 14");
    await expect(page.getByRole("button", { name: "Change my age" })).toBeVisible();
    expect(await a11yProblems(page, "stop")).toEqual([]);
  });
});

test.describe("accessibility and layout of the email links and the team backend @a11y @layout", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("confirm, remove and edit pages; sign-in, queue and a story with video", async ({ page }, info) => {
    const problems: string[] = [];
    const check = async (screen: string) => problems.push(...(await a11yProblems(page, screen)));

    const { headline, email } = await sendStory(page, info, { video: true });
    await check("confirm page");
    const remove = /(\/remove\/[\w-]+)/.exec(emailFor("confirm_email", email)!.text)![1]!;
    await page.goto(remove);
    await expect(page.getByRole("heading", { name: "Remove my story" })).toBeVisible();
    await check("remove page");

    await page.goto("/admin/sign-in");
    await check("admin sign-in");
    await signIn(page);
    await check("admin queue");
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await check("admin story with video checks");
    await page.getByRole("button", { name: "Request changes" }).click();
    await check("request changes dialog");
    await page.getByLabel("Message").fill("Please add one more sentence about the hardest part.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.locator("article [data-status=changes_requested]")).toBeVisible();
    await page.goto(editLinkFor(email)!);
    await check("edit page");

    expect(problems).toEqual([]);
  });

  test("parent page, and an approved story with its content pack", async ({ page }, info) => {
    const problems: string[] = [];
    const check = async (screen: string) => problems.push(...(await a11yProblems(page, screen)));

    const { headline, parentEmail } = await sendStory(page, info, { age: "14 to 17" });
    await expect.poll(() => parentLinkFor(parentEmail), { timeout: 30_000 }).toBeTruthy();
    await page.goto(parentLinkFor(parentEmail)!);
    await check("parent page");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await check("parent page after deciding");

    await signIn(page, STAFF.content);
    await openStory(page, headline);
    await waitForStatus(page, "in_review");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("article [data-status=approved]")).toBeVisible();
    await page.getByRole("button", { name: "Generate content pack" }).click();
    await expect(page.locator("[data-asset=snippet]")).toBeVisible();
    await check("approved story with content pack and publishing");

    expect(problems).toEqual([]);
  });
});

test.describe("reduced motion (PRD 17) @a11y", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the example reel stays on its first story, and still moves on when tapped", async ({ page }) => {
    await page.goto("/");
    const reel = page.getByRole("button", { name: /^Example story/ });
    await expect(reel).toHaveAccessibleName(/^Example story 1 of 6/);
    await page.waitForTimeout(6_000);
    await expect(reel).toHaveAccessibleName(/^Example story 1 of 6/);
    await reel.click();
    await expect(reel).toHaveAccessibleName(/^Example story 2 of 6/);
  });
});
