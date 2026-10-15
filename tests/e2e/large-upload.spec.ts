import { existsSync, statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openStory, signIn } from "./admin-helpers";
import { answer, heading, pick, startAs, uniqueEmail } from "./helpers";
import { confirmLinkFor } from "./outbox";

/**
 * Acceptance criteria 6 and 7, opt-in because it moves 200 MB and takes several minutes:
 *   bash scripts/make-large-video.sh && pnpm test:upload
 * A 90 second portrait video of about 200 MB is uploaded over a throttled 4G connection that drops
 * part way through; the upload carries on from where it was, and the server checks, transcript and
 * converted video reach the admin within 2 minutes of the upload finishing.
 */
const FILE = ".cache/media/large-video.webm";
// Throttled 4G: 20 Mbps down, 8 Mbps up, 70 ms round trip (a typical UK 4G connection).
const FOUR_G = { offline: false, latency: 70, downloadThroughput: (20e6 / 8) | 0, uploadThroughput: (8e6 / 8) | 0 };
const OFFLINE_FOR_MS = 20_000;
const PROCESSING_LIMIT_MS = 2 * 60_000;

test.describe("a large video upload @slow", () => {
  test.skip(!existsSync(FILE), `Run scripts/make-large-video.sh first to make ${FILE}`);
  test.setTimeout(30 * 60_000);

  test("200 MB over throttled 4G survives a dropped connection, resumes, and is processed within 2 minutes", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "Once is enough");
    expect(statSync(FILE).size).toBeGreaterThan(195e6);
    const email = uniqueEmail("large", info);

    await startAs(page, "Student", "18 to 24", "Lena");
    await pick(page, "Internship");
    await answer(page, "Children's ward");
    await answer(page, "", "Skip");
    await pick(page, "At university");
    await pick(page, /^Tell it myself/);
    await pick(page, /^Video/);
    await page.getByRole("button", { name: "I'm ready to film" }).click();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", FOUR_G);

    // Every part sent, and every part stored.
    const sent = new Map<number, number>();
    const stored = new Set<number>();
    const partOf = (url: string) => Number(new URL(url).searchParams.get("partNumber"));
    page.on("request", (r) => {
      if (r.method() === "PUT" && r.url().includes("partNumber=")) sent.set(partOf(r.url()), (sent.get(partOf(r.url())) ?? 0) + 1);
    });
    page.on("response", (r) => {
      if (r.request().method() === "PUT" && r.url().includes("partNumber=") && r.ok()) stored.add(partOf(r.url()));
    });

    const created = page.waitForResponse((r) => r.url().endsWith("/api/media") && r.request().method() === "POST");
    await page.getByTestId("upload-input").setInputFiles(FILE);
    const { mediaId, partCount } = (await (await created).json()) as { mediaId: string; partCount: number };
    // Too big to decode the sound in the browser, so that check is a tip and the server checks it (PRD 7.1).
    await expect(page.locator("[data-verdict=pass], [data-verdict=warn]")).toBeVisible({ timeout: 5 * 60_000 });
    await page.getByRole("button", { name: "Use this video" }).click();
    await expect(heading(page)).toHaveText("Check your transcript");

    // Drop the connection once a few parts are stored, then bring it back.
    await expect.poll(() => stored.size, { timeout: 10 * 60_000, intervals: [1000] }).toBeGreaterThanOrEqual(Math.ceil(partCount / 3));
    const storedBeforeDrop = new Set(stored);
    await cdp.send("Network.emulateNetworkConditions", { ...FOUR_G, offline: true });
    await page.waitForTimeout(OFFLINE_FOR_MS);
    await cdp.send("Network.emulateNetworkConditions", FOUR_G);

    const completed = await page.waitForResponse((r) => r.url().endsWith(`/api/media/${mediaId}/complete`), { timeout: 20 * 60_000 });
    expect(completed.ok()).toBe(true);
    const uploadedAt = Date.now();
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // Resumed, not restarted: parts stored before the drop were sent once.
    expect(stored.size).toBe(partCount);
    for (const n of storedBeforeDrop) expect(sent.get(n), `part ${n}`).toBe(1);
    const resent = [...sent.values()].reduce((a, b) => a + b, 0) - partCount;

    // The person gets their transcript once the checks and speech to text are done.
    await expect
      .poll(
        async () => {
          const m = await (await page.request.get(`/api/media/${mediaId}`)).json();
          return m.status === "ready" && Boolean(m.serverChecks?.length) && Boolean(m.transcript);
        },
        { timeout: PROCESSING_LIMIT_MS, intervals: [2000] },
      )
      .toBe(true);
    const transcriptS = Math.round((Date.now() - uploadedAt) / 1000);

    // Send the story and see it all in the admin.
    await expect(page.getByRole("textbox")).not.toHaveValue("", { timeout: 30_000 });
    await page.getByRole("button", { name: "Write up my story" }).click();
    await expect(heading(page)).toHaveText("Here's your story. Does it sound like you?", { timeout: 30_000 });
    const headline = `Story by Lena ${Date.now()}`;
    await page.getByLabel("Headline").fill(headline);
    await page.getByRole("button", { name: "Looks good" }).click();
    await pick(page, "First name (Lena)");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /^On Springpod/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await answer(page, email);
    await page.getByRole("button", { name: /^This is my own experience/ }).click();
    await page.getByRole("button", { name: "Send my story" }).click();
    await expect(heading(page)).toContainText("Your story is in.");
    await page.goto(confirmLinkFor(email)!);

    // In the admin: the server's checks, the transcript and the converted video, all within 2 minutes
    // of the upload finishing (acceptance criterion 7).
    await signIn(page);
    await openStory(page, headline);
    await expect(async () => {
      await page.reload();
      await expect(page.locator("video")).toHaveAttribute("src", /%2Fnormalised|\/normalised/, { timeout: 1000 });
    }).toPass({ timeout: Math.max(1000, PROCESSING_LIMIT_MS - (Date.now() - uploadedAt)), intervals: [2000] });
    const convertedS = Math.round((Date.now() - uploadedAt) / 1000);
    expect(convertedS * 1000).toBeLessThanOrEqual(PROCESSING_LIMIT_MS);
    await expect(page.getByText("Transcript", { exact: true })).toBeVisible();
    // The server's checks, not only the browser's.
    await expect(page.getByText("Automated", { exact: true })).toBeVisible();

    const timings = `${partCount} parts, ${resent} sent again after the drop; transcript after ${transcriptS}s, all in the admin after ${convertedS}s`;
    info.annotations.push({ type: "timings", description: timings });
    console.log(timings);
  });
});
