import { expect, test } from "@playwright/test";

/** PRD 17: start screen images are AVIF or WebP and under 30 KB each, at the size this screen asks for. */
test("the start screen's example portraits are served as AVIF or WebP, under 30 KB each", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Example story/ })).toBeVisible();
  // The candidate each portrait would load at this screen's pixel density (the later ones load lazily).
  // Video stories fill the card with the portrait; the others show it as an avatar.
  await expect(page.locator("article img")).toHaveCount(6);
  const urls = await page.locator("article img").evaluateAll((imgs) =>
    (imgs as HTMLImageElement[]).map((img) => {
      // Width descriptors ("640w") for the card images, density ("2x") for the avatars.
      const candidates = img.srcset
        .split(",")
        .map((c) => c.trim().split(" "))
        .map(([url, d]) => ({ url: url!, d: parseFloat(d!), density: d!.endsWith("x") }))
        .sort((a, b) => a.d - b.d);
      const want = candidates[0]!.density ? devicePixelRatio : img.getBoundingClientRect().width * devicePixelRatio;
      return (candidates.find((c) => c.d >= want) ?? candidates.at(-1))!.url;
    }),
  );
  expect(urls).toHaveLength(6);
  for (const url of urls) {
    const res = await page.request.get(url, { headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
    expect(res.headers()["content-type"], url).toMatch(/^image\/(avif|webp)$/);
    expect((await res.body()).length, url).toBeLessThan(30 * 1024);
  }
});
