import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

/** A unique address per test run, so parallel tests don't read each other's emails. */
export const uniqueEmail = (name: string, info: TestInfo) =>
  `${name}.${info.project.name}.${info.workerIndex}.${Date.now()}@example.com`;

/** Everything in the quote card sits inside its edges (PRD 5.4: never clip, the card grows). */
export async function expectCardNotClipped(card: Locator) {
  const spill = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Math.max(
      ...[...el.querySelectorAll("*")].flatMap((child) => {
        const r = child.getBoundingClientRect();
        return [r.bottom - box.bottom, r.right - box.right, box.left - r.left];
      }),
    );
  });
  expect(spill).toBeLessThanOrEqual(0);
}

export const STORY =
  "On my first day I was honestly really nervous, but the team gave me a real task straight away. " +
  "By Wednesday I was presenting part of a report in their morning meeting, and someone actually used what I made. " +
  "The hardest thing was asking questions. My advice is to say yes to things.";

/** Answers the interview using the fixed questions (no API key in tests), then asks for the write-up. */
export async function interview(page: Page) {
  await expect(heading(page)).toHaveText("Your interview");
  for (const answer of ["I helped run the reception desk.", "A patient thanked me by name.", "Talking to strangers was hard."]) {
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    await page.getByRole("textbox", { name: "Your answer" }).fill(answer);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log").getByText(answer)).toBeVisible();
  }
  await page.getByRole("button", { name: "I'm done, write it up" }).click();
}

export async function writeStory(page: Page) {
  await expect(heading(page)).toHaveText("Tell us what happened");
  await page.getByRole("textbox").fill(STORY);
  await page.getByRole("button", { name: "Write up my story" }).click();
}

export const heading = (page: Page) => page.getByRole("heading", { level: 1 });

export async function pick(page: Page, name: string | RegExp) {
  await page.getByRole("radio", { name }).click();
}

export async function answer(page: Page, value: string, button: "Continue" | "Skip" = "Continue") {
  await page.getByRole("textbox").fill(value);
  await page.getByRole("button", { name: button }).click();
}

export async function startAs(page: Page, who: string, age: string, name = "Priya") {
  await page.goto("/");
  await page.getByRole("button", { name: "Start my story" }).click();
  await expect(heading(page)).toHaveText("Which best describes you?");
  await pick(page, new RegExp(`^${who}`));
  await expect(heading(page)).toHaveText("How old are you?");
  await pick(page, age);
  if (age === "Under 14") return;
  await expect(heading(page)).toHaveText("What's your first name?");
  await answer(page, name);
}

export const FIXTURES = "tests/fixtures/media";

/** Picks a test file as if from the phone's camera ("capture") or the file picker ("upload"). */
export async function chooseMedia(page: Page, fixture: string, via: "capture" | "upload" = "upload") {
  await page.getByTestId(`${via}-input`).setInputFiles(`${FIXTURES}/${fixture}`);
}

/** Uses a file that passes the checks, waits for the transcript, and leaves the person on that screen. */
export async function useGoodVideo(page: Page) {
  await expect(heading(page)).toHaveText("Film your video");
  await chooseMedia(page, "good-video.webm");
  await expect(page.locator("[data-verdict=pass]")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Use this video" }).click();
  await expect(heading(page)).toHaveText("Check your transcript");
  await expect(page.getByRole("textbox")).toHaveValue(/children's ward/, { timeout: 60_000 });
}
