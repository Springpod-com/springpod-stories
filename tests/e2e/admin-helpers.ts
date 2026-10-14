import { expect, type Page, type TestInfo } from "@playwright/test";
import { STAFF } from "./global-setup";
import { answer, chooseGoodVideo, heading, pick, startAs, uniqueEmail, writeStory } from "./helpers";
import { confirmLinkFor } from "./outbox";

export async function signIn(page: Page, email = STAFF.moderator, { expectIn = true } = {}) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Staff email").fill(email);
  await page.getByRole("button", { name: "Sign in for development" }).click();
  if (expectIn) await expect(page.getByRole("heading", { name: "Story queue" })).toBeVisible();
}

/** Sends a story through the public flow and confirms the email. Returns the headline to find it by. */
export async function sendStory(page: Page, info: TestInfo, { video = false, age = "18 to 24", quote = "" } = {}) {
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
  if (quote) await page.getByLabel("Or edit it").fill(quote);
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

export async function openStory(page: Page, headline: string) {
  await page.goto("/admin");
  await page.getByLabel("Search headlines and stories").fill(headline);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByRole("link", { name: /Story by/ })).toHaveCount(1);
  await page.getByRole("link", { name: new RegExp(headline) }).click();
  await expect(page.getByRole("heading", { level: 2, name: headline })).toBeVisible();
}

/** The pre-screen runs in the worker; reload until the story reaches `status`. */
export async function waitForStatus(page: Page, status: string) {
  await expect(async () => {
    await page.reload();
    await expect(page.locator(`article [data-status=${status}]`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
}
