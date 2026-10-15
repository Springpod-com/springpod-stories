import { afterEach, describe, expect, it, vi } from "vitest";
import { trackServer } from "./server/track";
import { entrySource, track } from "./track";

describe("tracking (PRD 16)", () => {
  afterEach(() => {
    delete window.dataLayer;
    vi.unstubAllEnvs();
    window.history.replaceState(null, "", "/");
  });

  it("puts events in the data layer in the gtag format", () => {
    track("question_answered", { question: "who", chapter: "about", value: "student" });
    const entry = Array.from(window.dataLayer?.[0] as ArrayLike<unknown>);
    expect(entry).toEqual(["event", "question_answered", { question: "who", chapter: "about", value: "student" }]);
  });

  it("reads the utm source, or calls it direct", () => {
    expect(entrySource()).toBe("direct");
    window.history.replaceState(null, "", "/?utm_source=school-newsletter");
    expect(entrySource()).toBe("school-newsletter");
  });

  it("sends server events to the Measurement Protocol only when configured, with the story id as client id", async () => {
    const send = vi.fn(async () => new Response(null, { status: 204 }));
    await trackServer("story-1", "admin_status_changed", { status: "approved" }, send);
    expect(send).not.toHaveBeenCalled();

    vi.stubEnv("GA4_MEASUREMENT_ID", "G-TEST");
    vi.stubEnv("GA4_API_SECRET", "secret");
    await trackServer("story-1", "admin_status_changed", { status: "approved" }, send);
    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("measurement_id=G-TEST");
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "story-1",
      events: [{ name: "admin_status_changed", params: { status: "approved" } }],
    });
  });

  it("never throws when sending fails", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-TEST");
    vi.stubEnv("GA4_API_SECRET", "secret");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(trackServer("story-1", "email_confirmed", {}, async () => Promise.reject(new Error("offline")))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
