import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { confirmLinkFor } from "./outbox";

/** A unique address per test run, so parallel tests don't read each other's emails. */
const uniqueEmail = (name: string, info: TestInfo) =>
  `${name}.${info.project.name}.${info.workerIndex}.${Date.now()}@example.com`;

/** Everything in the quote card sits inside its edges (PRD 5.4: never clip, the card grows). */
async function expectCardNotClipped(card: Locator) {
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

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

async function pick(page: Page, name: string | RegExp) {
  await page.getByRole("radio", { name }).click();
}

async function answer(page: Page, value: string, button: "Continue" | "Skip" = "Continue") {
  await page.getByRole("textbox").fill(value);
  await page.getByRole("button", { name: button }).click();
}

async function startAs(page: Page, who: string, age: string, name = "Priya") {
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

test.describe("public flow", () => {
  test("start screen shows the example stories and the start button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Example stories", { exact: true })).toBeVisible();
    await expect(heading(page)).toHaveText("Share your work experience story");
    await expect(page.getByRole("button", { name: "Start my story" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Springpod" })).toBeVisible();
  });

  test("a student can click through every question, send the story and confirm their email", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail("priya", testInfo);
    await startAs(page, "Student", "18 to 24");
    await expect(heading(page)).toHaveText("Nice to meet you, Priya. What kind of experience was it?");
    await pick(page, "Internship");
    await expect(heading(page)).toHaveText("What area or job was it in?");

    // Validation on press, with the prototype message
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("[data-slot=field-error]")).toHaveText("Add the area or job");
    await answer(page, "Marketing");

    await expect(heading(page)).toHaveText("Which organisation was it with?");
    await page.getByRole("button", { name: "Skip" }).click();

    await expect(heading(page)).toHaveText("What are you doing now?");
    await pick(page, "At university");
    await expect(heading(page)).toHaveText("How do you want to tell your story?");
    await pick(page, /^Tell it myself/);
    await expect(heading(page)).toHaveText("How would you like to tell it?");
    await pick(page, /^Write it/);

    await expect(heading(page)).toHaveText("Tell us what happened");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await page.getByRole("button", { name: "Looks good" }).click();

    await expect(heading(page)).toHaveText("How should your name appear?");
    await expect(page.getByText("Community story")).toBeVisible();
    await pick(page, "First name (Priya)");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(heading(page)).toHaveText("Where can we share it?");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("[data-slot=field-error]")).toHaveText("Choose at least one");
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(heading(page)).toHaveText("What's your email?");
    await answer(page, "not-an-email");
    await expect(page.locator("[data-slot=field-error]")).toHaveText("That email doesn't look right. Check it and try again");
    await answer(page, email);

    await expect(heading(page)).toHaveText("Almost done. Please confirm.");
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(page.locator("[data-slot=field-error]")).toHaveText("Tick the first box to confirm it's your experience");
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();

    await expect(heading(page)).toHaveText("Thanks, Priya. Your story is in.");
    await expect(page.getByText("Check your email to confirm it's you.")).toBeVisible();

    // The magic link from the email confirms it, and opening it again is harmless.
    const link = confirmLinkFor(email);
    expect(link).toBeTruthy();
    for (let i = 0; i < 2; i++) {
      await page.goto(link!);
      await expect(heading(page)).toHaveText("Email confirmed");
    }
    await page.goto("/confirm/not-a-real-link");
    await expect(heading(page)).toHaveText("This link doesn't work");
  });

  test("answers are saved as people go and pick up again after a reload", async ({ page }) => {
    await startAs(page, "Student", "18 to 24");
    await pick(page, "Internship");
    await expect(heading(page)).toHaveText("What area or job was it in?");
    await page.getByRole("textbox").fill("Marketing");
    // Autosave waits for a short pause in typing.
    await page.waitForResponse((r) => r.url().endsWith("/api/draft") && r.request().method() === "PUT");

    await page.reload();
    await page.getByRole("button", { name: "Start my story" }).click();
    // Resumes at the first question still needing an answer. The organisation is optional, so it moves past it.
    await expect(heading(page)).toHaveText("What are you doing now?");
    await expect(page.getByText("Copy needed (G2)")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page)).toHaveText("What area or job was it in?");
    await expect(page.getByRole("textbox")).toHaveValue("Marketing");

    // Start again clears the saved answers
    await page.reload();
    await page.getByRole("button", { name: "Start my story" }).click();
    await page.getByRole("button", { name: "Start again" }).click();
    await expect(heading(page)).toHaveText("Which best describes you?");
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    expect((await page.request.get("/api/draft")).status()).toBe(204);
  });

  test("nothing is saved for under 14s (PRD 9.1)", async ({ page }) => {
    await startAs(page, "Student", "18 to 24");
    await expect(heading(page)).toHaveText(/What kind of experience was it\?/);
    await expect.poll(async () => (await page.request.get("/api/draft")).status()).toBe(200);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await pick(page, "Under 14");
    await expect(heading(page)).toHaveText("Stories are open to people aged 14 and over");
    await expect.poll(async () => (await page.request.get("/api/draft")).status()).toBe(204);
  });

  test("nothing is pre-ticked on the sharing and confirm screens (acceptance criterion 4)", async ({ page }) => {
    await startAs(page, "Springpod student", "25 or over");
    await answer(page, "Software");
    await answer(page, "", "Skip");
    await pick(page, "Working");
    await answer(page, "Developer");
    await answer(page, "", "Skip");
    await pick(page, "Technology");
    await pick(page, /^Interview me/);
    await expect(heading(page)).toHaveText("Your interview");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await expect(page.getByText("Verified by Springpod")).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await pick(page, "No name");
    await page.getByRole("button", { name: "Continue" }).click();
    for (const name of ["On Springpod", "On springpod.com", "On our blog", "On social media"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "false");
    }
    await page.getByRole("button", { name: /^On our blog/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, "sam@example.com"); // not submitted in this test
    await expect(page.getByRole("button", { name: /^This is my own experience/ })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /^Email me early careers opportunities/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("under 14s see the stop screen and can change their age", async ({ page }) => {
    await startAs(page, "Student", "Under 14");
    await expect(heading(page)).toHaveText("Stories are open to people aged 14 and over");
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
    await page.getByRole("button", { name: "Change my age" }).click();
    await expect(heading(page)).toHaveText("How old are you?");
  });

  test("14 to 17 year olds are asked for a different parent or carer email", async ({ page }) => {
    await startAs(page, "Student", "14 to 17", "Amara");
    await pick(page, "School work experience week");
    await answer(page, "Vet practice");
    await answer(page, "", "Skip");
    await pick(page, "At school");
    await pick(page, /^Tell it myself/);
    await pick(page, /^Video/);
    await expect(heading(page)).toHaveText("How to film a great video");
    await page.getByRole("button", { name: "I'm ready to film" }).click();
    await expect(heading(page)).toHaveText("Film your video");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page)).toHaveText("Check your transcript");
    await page.getByRole("button", { name: "Write up my story" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await pick(page, "First initial (A.)");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^On Springpod/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, "amara@example.com");
    await expect(heading(page)).toHaveText("What's your parent or carer's email?");
    await answer(page, "AMARA@example.com");
    await expect(page.locator("[data-slot=field-error]")).toHaveText("This needs to be a different email from yours");
    await answer(page, "parent@example.com");
    await expect(heading(page)).toHaveText("Almost done. Please confirm.");
  });

  test("people in work are asked about their role, company and industry, and whether to show the company", async ({
    page,
  }, testInfo) => {
    await startAs(page, "Working professional", "25 or over", "Tom");
    await expect(heading(page)).toHaveText("What field was your first job in, Tom?");
    await answer(page, "Construction");
    await answer(page, "", "Skip");
    await pick(page, "Working");
    await expect(heading(page)).toHaveText("What's your current role?");
    await answer(page, "Site Manager");
    await expect(heading(page)).toHaveText("Where do you work?");
    await answer(page, "Northern Build Co");
    await expect(heading(page)).toHaveText("Which industry is that in?");
    await pick(page, "Construction and engineering");
    await pick(page, /^Interview me/);
    await expect(heading(page)).toHaveText("Your interview");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Looks good" }).click();
    await pick(page, "First name (Tom)");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page)).toHaveText("Can we say you work at Northern Build Co?");
    await expect(page.getByText("Now Site Manager", { exact: true })).toBeVisible();
    await pick(page, "Yes, show it");
    await expect(page.getByText("Now Site Manager at Northern Build Co")).toBeVisible();
    // The card grows instead of clipping (PRD 5.4)
    const card = page.locator("figure[data-size]");
    await expectCardNotClipped(card);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^On Springpod/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, uniqueEmail("tom", testInfo));
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(heading(page)).toHaveText("Thanks, Tom. Your story is in.");
    await expectCardNotClipped(page.locator("figure[data-size]"));
  });

  test("the back arrow and the browser back button both return to the previous question", async ({ page }) => {
    await startAs(page, "Student", "18 to 24");
    await expect(heading(page)).toHaveText(/What kind of experience was it\?/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page)).toHaveText("What's your first name?");
    await expect(page.getByRole("textbox")).toHaveValue("Priya");
    await page.goBack();
    await expect(heading(page)).toHaveText("How old are you?");
    await expect(page.getByRole("radio", { name: "18 to 24" })).toHaveAttribute("aria-checked", "true");
    await page.goForward();
    await expect(heading(page)).toHaveText("What's your first name?");
  });

  test("answer buttons follow the keyboard model (arrows, Home, End)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start my story" }).click();
    await page.getByRole("radio", { name: /^Springpod student/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /^Student/ })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("radio", { name: /^Working professional/ })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("radio", { name: /^Springpod student/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(heading(page)).toHaveText("How old are you?");
  });
});

test.describe("layout @layout", () => {
  test("no horizontal scroll on the start screen or a question", async ({ page }) => {
    await page.goto("/");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Start my story" }).click();
    await expect(heading(page)).toHaveText("Which best describes you?");
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
