import { expect, test } from "@playwright/test";
import { answer, heading, pick, sentEvents, uniqueEmail, writeStory } from "./helpers";

test.describe("tracking (PRD 16)", () => {
  test("the flow sends each event with fixed values only, never what people typed", async ({ page }, info) => {
    const email = uniqueEmail("zelda", info);
    await page.goto("/?utm_source=school-newsletter");
    await page.getByRole("button", { name: "Start my story" }).click();
    await pick(page, /^Student/);
    await pick(page, "18 to 24");
    await answer(page, "Zelda");
    await pick(page, "Internship");
    await answer(page, "Zookeeping");
    await page.getByRole("button", { name: "Skip" }).click();
    await pick(page, "At university");
    await pick(page, /^Tell it myself/);
    await pick(page, /^Write it/);
    await writeStory(page);
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?");
    await page.getByRole("button", { name: "Looks good" }).click();
    await pick(page, "First name (Zelda)");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, email);
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(heading(page)).toHaveText("Thanks, Zelda. Your story is in.");

    const events = await sentEvents(page);
    const named = (name: string) => events.filter((e) => e.name === name);
    expect(named("story_start")).toEqual([{ name: "story_start", source: "school-newsletter" }]);
    expect(named("question_answered")).toContainEqual({ name: "question_answered", question: "who", chapter: "about", value: "student" });
    expect(named("question_answered")).toContainEqual({ name: "question_answered", question: "role", chapter: "experience" });
    expect(named("mode_selected")).toEqual([{ name: "mode_selected", value: "self" }]);
    expect(named("format_selected")).toEqual([{ name: "format_selected", value: "write" }]);
    expect(named("draft_generated")).toHaveLength(1);
    expect(named("quote_selected")).toEqual([{ name: "quote_selected", option: "0" }]);
    expect(named("story_submitted")).toEqual([
      { name: "story_submitted", mode: "self", format: "write", age_band: "18 to 24", channels: 4 },
    ]);
    // The name, the job, the email and the story never leave the page.
    const all = JSON.stringify(events);
    for (const typed of ["Zelda", "Zookeeping", email, "nervous"]) expect(all).not.toContain(typed);
  });

  test("under 14s are counted as blocked", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start my story" }).click();
    await pick(page, /^Student/);
    await pick(page, "Under 14");
    await expect(page.getByRole("button", { name: "Change my age" })).toBeVisible();
    expect((await sentEvents(page)).filter((e) => e.name === "story_blocked_under14")).toHaveLength(1);
  });
});
