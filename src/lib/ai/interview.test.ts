import { describe, expect, it } from "vitest";
import { interviewTurn, MarkerFilter, type Generate, type InterviewEvent, type Turn } from "./interview";
import { fallbackClosing, MAX_USER_ANSWERS, type InterviewContext } from "./prompts";

const context: InterviewContext = {
  firstName: "Sam",
  ageBand: "14 to 17",
  expType: "Volunteering",
  organisation: "",
  area: "Children's ward",
  whoLabel: "Student",
  nowText: "At school",
};

async function collect(events: AsyncGenerator<InterviewEvent>) {
  const out: InterviewEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const fake =
  (...chunks: string[]): Generate =>
  async function* () {
    for (const c of chunks) yield c;
  };

const failing: Generate = async function* () {
  yield "Hi Sam, so";
  throw new Error("network");
};

describe("MarkerFilter", () => {
  it("removes markers even when they arrive split across chunks", () => {
    const f = new MarkerFilter();
    const out = ["Thanks Sam, that's ", "everything.[", "[EN", "D]]"].map((c) => f.push(c)).join("") + f.flush();
    expect(out).toBe("Thanks Sam, that's everything.");
    expect(f.ended).toBe(true);
    expect(f.safeguarding).toBe(false);
  });

  it("spots the safeguarding marker", () => {
    const f = new MarkerFilter();
    const out = f.push("Please talk to a trusted adult. [[SAFEGU") + f.push("ARDING]]") + f.flush();
    expect(out).toBe("Please talk to a trusted adult. ");
    expect(f.safeguarding).toBe(true);
  });

  it("lets ordinary square brackets through", () => {
    const f = new MarkerFilter();
    expect(f.push("I used [Excel] and [") + f.push("Word]") + f.flush()).toBe("I used [Excel] and [Word]");
  });
});

describe("interviewTurn", () => {
  it("streams the model's question and strips the end marker", async () => {
    const events = await collect(
      interviewTurn({ context, history: [], generate: fake("Hi Sam! ", "What did a normal day look like?") }),
    );
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")).toBe(
      "Hi Sam! What did a normal day look like?",
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      text: "Hi Sam! What did a normal day look like?",
      ended: false,
      safeguarding: false,
      fallback: false,
    });
  });

  it("ends the interview on [[END]] and flags [[SAFEGUARDING]]", async () => {
    const end = await collect(interviewTurn({ context, history: [], generate: fake("Thanks, Sam.[[END]]") }));
    expect(end.at(-1)).toMatchObject({ text: "Thanks, Sam.", ended: true, safeguarding: false });

    const safe = await collect(
      interviewTurn({ context, history: [], generate: fake("I'm sorry that happened. Please talk to a trusted adult.[[SAFEGUARDING]]") }),
    );
    expect(safe.at(-1)).toMatchObject({ ended: true, safeguarding: true });
  });

  it("uses the fixed questions when no model is configured", async () => {
    const history: Turn[] = [
      { role: "assistant", content: "Hi Sam! What did a normal day look like?" },
      { role: "user", content: "I set up activities." },
    ];
    const events = await collect(interviewTurn({ context, history, generate: null }));
    expect(events.at(-1)).toMatchObject({
      text: "Was there one moment that really stood out? Talk me through what happened.",
      fallback: true,
      ended: false,
    });
  });

  it("replaces a half-streamed reply with a fixed question when the call fails", async () => {
    const events = await collect(interviewTurn({ context, history: [], generate: failing }));
    expect(events.map((e) => e.type)).toEqual(["delta", "replace", "done"]);
    expect(events.at(-1)).toMatchObject({ text: "Hi Sam! What did a normal day look like during your volunteering?", fallback: true });
  });

  it("closes after the last fixed question", async () => {
    const history: Turn[] = Array.from({ length: 6 }, (_, i) => [
      { role: "assistant" as const, content: `Q${i}` },
      { role: "user" as const, content: `A${i}` },
    ]).flat();
    const events = await collect(interviewTurn({ context, history, generate: null }));
    expect(events.at(-1)).toMatchObject({ text: fallbackClosing("Sam"), ended: true });
  });

  it("stops after the maximum number of answers without calling the model", async () => {
    let called = false;
    const spy: Generate = async function* () {
      called = true;
      yield "More?";
    };
    const history: Turn[] = Array.from({ length: MAX_USER_ANSWERS }, () => [
      { role: "assistant" as const, content: "Q" },
      { role: "user" as const, content: "A" },
    ]).flat();
    const events = await collect(interviewTurn({ context, history, generate: spy }));
    expect(called).toBe(false);
    expect(events.at(-1)).toMatchObject({ ended: true });
  });

  it("falls back when the model returns nothing but a marker", async () => {
    const events = await collect(interviewTurn({ context, history: [], generate: fake("[[END]]") }));
    expect(events.at(-1)).toMatchObject({ fallback: true });
  });
});
