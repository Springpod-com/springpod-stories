import { expect, test, type Page } from "@playwright/test";
import { answer, expectCardNotClipped, heading, pick, startAs, writeStory } from "./helpers";

/** Writes a story, then waits for the draft. There is no API key in tests, so the fallback draft is used. */
async function reachDraft(page: Page) {
  await startAs(page, "Student", "18 to 24", "Priya");
  await pick(page, "Internship");
  await answer(page, "Marketing");
  await answer(page, "", "Skip");
  await pick(page, "At university");
  await pick(page, /^Tell it myself/);
  await pick(page, /^Write it/);
  await writeStory(page);
  await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?", { timeout: 20_000 });
}

test.describe("the draft (PRD 8)", () => {
  test("can be edited, and the quote picked or written, with the card updating", async ({ page }) => {
    await reachDraft(page);
    await expect(page.getByLabel("Headline")).toHaveValue("My internship in Marketing");
    await expect(page.getByLabel("Story", { exact: true })).toHaveValue(/really nervous/);

    const card = page.locator("figure");
    const options = page.getByRole("radiogroup", { name: "Pick the quote for your card" }).getByRole("radio");
    await expect(options).toHaveCount(3);
    const second = (await options.nth(1).innerText()).replace(/[“”]/g, "");
    await options.nth(1).click();
    await expect(options.nth(1)).toBeChecked();
    await expect(page.getByLabel("Or edit it")).toHaveValue(second);
    await expect(card).toContainText(second);

    await page.getByLabel("Or edit it").fill("Someone actually used what I made.");
    await expect(card).toContainText("Someone actually used what I made.");
    await expect(options.nth(1)).not.toBeChecked();

    await page.getByLabel("Or edit it").fill("");
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(page.locator("[data-slot=field-error]")).toHaveText("Add a quote for your card");
    await page.getByLabel("Or edit it").fill("Someone actually used what I made.");
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(heading(page)).toHaveText("How should your name appear?");
  });

  test("try a different version, then go back to the previous one with its edits", async ({ page }) => {
    await reachDraft(page);
    await page.getByLabel("Headline").fill("My edited headline");
    await page.getByRole("button", { name: "Try a different version" }).click();
    await expect(page.getByText("New version written.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Headline")).toHaveValue("My internship in Marketing");
    await page.getByRole("button", { name: "Go back to previous version" }).click();
    await expect(page.getByLabel("Headline")).toHaveValue("My edited headline");
    await expect(page.getByText("New version written.")).toHaveCount(0);
  });

  test("the edited draft is kept after a reload", async ({ page }) => {
    await reachDraft(page);
    await page.getByLabel("Headline").fill("Kept after reload");
    await page.waitForResponse((r) => r.url().endsWith("/api/draft") && r.request().method() === "PUT");
    await page.reload();
    await page.getByRole("button", { name: "Start my story" }).click();
    // The draft is complete, so it resumes at the next question.
    await expect(heading(page)).toHaveText("How should your name appear?");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await expect(page.getByLabel("Headline")).toHaveValue("Kept after reload");
  });
});

test.describe("the quote card @layout", () => {
  test("a 160-character quote sets at 18px and never clips (acceptance criterion 11)", async ({ page }) => {
    const quote = "The moment I presented our findings to the whole team and someone asked me a follow-up question, I realised they actually trusted what I had to say about it all";
    expect(quote).toHaveLength(160);
    await reachDraft(page);
    await page.getByLabel("Or edit it").fill(quote);
    const card = page.locator("figure[data-size]");
    await expect(card).toHaveAttribute("data-size", "long");
    await expect(card.getByText(quote)).toHaveCSS("font-size", "18px");
    await expectCardNotClipped(card);
  });
});
