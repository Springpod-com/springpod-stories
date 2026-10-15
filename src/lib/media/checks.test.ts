import { describe, expect, it } from "vitest";
import { evaluateChecks, verdict, type CheckId, type MediaFacts } from "./checks";

const MB = 1048576;
const loud = { silent: false as const, rmsDb: -20, peak: 0.8, clipRatio: 0, silentRatio: 0.1 };

const video: MediaFacts = {
  kind: "video",
  mimeType: "video/mp4",
  fileName: "story.mp4",
  sizeBytes: 40 * MB,
  durationS: 60,
  width: 1080,
  height: 1920,
  brightness: 120,
  audio: loud,
};

const voice: MediaFacts = {
  kind: "voice",
  mimeType: "audio/mp4",
  fileName: "story.m4a",
  sizeBytes: 3 * MB,
  durationS: 90,
  audio: loud,
};

const state = (f: MediaFacts, id: CheckId) => evaluateChecks(f).find((c) => c.id === id)?.state;
const detail = (f: MediaFacts, id: CheckId) => evaluateChecks(f).find((c) => c.id === id)?.detail;

describe("media checks (PRD 7.1, acceptance criterion 5)", () => {
  it("passes a good video and a good voice note", () => {
    expect(verdict(evaluateChecks(video))).toBe("pass");
    expect(verdict(evaluateChecks(voice))).toBe("pass");
    expect(evaluateChecks(video).map((c) => c.id)).toEqual(["format", "length", "size", "orientation", "quality", "light", "sound"]);
    expect(evaluateChecks(voice).map((c) => c.id)).toEqual(["format", "length", "size", "volume", "clarity", "silence"]);
  });

  describe("file type", () => {
    it("accepts video/* or mp4, mov, m4v, webm, 3gp by name", () => {
      for (const name of ["a.mp4", "a.MOV", "a.m4v", "a.webm", "a.3gp"]) {
        expect(state({ ...video, mimeType: "", fileName: name }, "format")).toBe("pass");
      }
      expect(state({ ...video, mimeType: "video/quicktime", fileName: "IMG_0001" }, "format")).toBe("pass");
      expect(state({ ...video, mimeType: "", fileName: "a.avi" }, "format")).toBe("fail");
      expect(state({ ...video, mimeType: "image/png", fileName: "a.png" }, "format")).toBe("fail");
    });

    it("accepts audio/* or m4a, mp3, wav, aac, ogg, webm, caf, amr, 3gp by name", () => {
      for (const name of ["a.m4a", "a.mp3", "a.wav", "a.aac", "a.ogg", "a.webm", "a.caf", "a.amr", "a.3gp"]) {
        expect(state({ ...voice, mimeType: "", fileName: name }, "format")).toBe("pass");
      }
      expect(state({ ...voice, mimeType: "application/pdf", fileName: "a.pdf" }, "format")).toBe("fail");
    });

    it("doesn't judge the length of a file it can't recognise", () => {
      expect(state({ ...video, mimeType: "text/plain", fileName: "a.txt" }, "length")).toBe("warn");
    });
  });

  describe("length", () => {
    it("video: fails under 10s, passes 10 to 90s, warns to 120s, fails over", () => {
      expect(state({ ...video, durationS: 9.4 }, "length")).toBe("fail");
      expect(state({ ...video, durationS: 10 }, "length")).toBe("pass");
      expect(state({ ...video, durationS: 90 }, "length")).toBe("pass");
      expect(state({ ...video, durationS: 100 }, "length")).toBe("warn");
      expect(detail({ ...video, durationS: 100 }, "length")).toBe("1:40 is slightly long. We'll use the first 1:30.");
      expect(state({ ...video, durationS: 120 }, "length")).toBe("warn");
      expect(state({ ...video, durationS: 121 }, "length")).toBe("fail");
    });

    it("voice: fails under 20s, passes 20s to 3:00, warns to 3:15, fails over", () => {
      expect(state({ ...voice, durationS: 19 }, "length")).toBe("fail");
      expect(state({ ...voice, durationS: 20 }, "length")).toBe("pass");
      expect(state({ ...voice, durationS: 180 }, "length")).toBe("pass");
      expect(state({ ...voice, durationS: 190 }, "length")).toBe("warn");
      expect(state({ ...voice, durationS: 196 }, "length")).toBe("fail");
    });
  });

  it("file size: video fails over 250 MB, voice over 25 MB", () => {
    expect(state({ ...video, sizeBytes: 250 * MB }, "size")).toBe("pass");
    expect(state({ ...video, sizeBytes: 251 * MB }, "size")).toBe("fail");
    expect(state({ ...voice, sizeBytes: 25 * MB }, "size")).toBe("pass");
    expect(state({ ...voice, sizeBytes: 26 * MB }, "size")).toBe("fail");
  });

  it("orientation: portrait or square pass, landscape warns", () => {
    expect(state({ ...video, width: 1080, height: 1920 }, "orientation")).toBe("pass");
    expect(state({ ...video, width: 1080, height: 1080 }, "orientation")).toBe("pass");
    expect(state({ ...video, width: 1920, height: 1080 }, "orientation")).toBe("warn");
  });

  it("picture quality: short side 720 or more passes, otherwise warns", () => {
    expect(state({ ...video, width: 720, height: 1280 }, "quality")).toBe("pass");
    expect(state({ ...video, width: 480, height: 854 }, "quality")).toBe("warn");
    expect(state({ ...video, width: 360, height: 640 }, "quality")).toBe("warn");
  });

  it("lighting: under 55 warns too dark, over 225 warns too bright", () => {
    expect(state({ ...video, brightness: 54 }, "light")).toBe("warn");
    expect(detail({ ...video, brightness: 54 }, "light")).toMatch(/dark/);
    expect(state({ ...video, brightness: 55 }, "light")).toBe("pass");
    expect(state({ ...video, brightness: 226 }, "light")).toBe("warn");
    expect(detail({ ...video, brightness: 226 }, "light")).toMatch(/bright/);
  });

  it("video sound: silent fails, under -38 dBFS warns quiet, clipping over 0.2% warns", () => {
    expect(state({ ...video, audio: { silent: true } }, "sound")).toBe("fail");
    expect(state({ ...video, audio: { ...loud, rmsDb: -39 } }, "sound")).toBe("warn");
    expect(state({ ...video, audio: { ...loud, clipRatio: 0.003 } }, "sound")).toBe("warn");
    expect(state({ ...video, audio: { ...loud, clipRatio: 0.002 } }, "sound")).toBe("pass");
  });

  it("voice volume: peak under 0.05 fails (even when also quiet), RMS under -40 warns", () => {
    expect(state({ ...voice, audio: { ...loud, peak: 0.04, rmsDb: -55 } }, "volume")).toBe("fail");
    expect(state({ ...voice, audio: { ...loud, rmsDb: -41 } }, "volume")).toBe("warn");
    expect(state({ ...voice, audio: { silent: true } }, "volume")).toBe("fail");
  });

  it("voice clarity warns on clipping; talking time warns when over 60% is silent", () => {
    expect(state({ ...voice, audio: { ...loud, clipRatio: 0.01 } }, "clarity")).toBe("warn");
    expect(state({ ...voice, audio: { ...loud, silentRatio: 0.61 } }, "silence")).toBe("warn");
    expect(state({ ...voice, audio: { ...loud, silentRatio: 0.6 } }, "silence")).toBe("pass");
  });

  it("warns, never fails, when the browser can't decode the file", () => {
    const undecodable: MediaFacts = { ...video, durationS: null, width: null, height: null, brightness: null, audio: null };
    const checks = evaluateChecks(undecodable);
    expect(checks.filter((c) => c.state === "fail")).toEqual([]);
    expect(verdict(checks)).toBe("warn");
    expect(detail(undecodable, "length")).toBe("We couldn't read the length. We'll check it after you send it.");

    const voiceChecks = evaluateChecks({ ...voice, durationS: null, audio: null });
    expect(voiceChecks.filter((c) => c.state === "fail")).toEqual([]);
  });

  it("gives the verdict: any fail fails, warnings only warn", () => {
    expect(verdict([{ state: "pass" }, { state: "warn" }])).toBe("warn");
    expect(verdict([{ state: "warn" }, { state: "fail" }])).toBe("fail");
  });
});
