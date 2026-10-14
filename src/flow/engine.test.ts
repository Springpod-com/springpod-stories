import { describe, expect, it } from "vitest";
import { chapterProgress, nextId, prevId, reachableId, validationError, visibleQuestions, findQuestion } from "./engine";
import { QUESTIONS, type Question } from "./questions";
import { initialState, type FlowState } from "./state";

const ids = (s: FlowState, questions: Question[] = QUESTIONS) => visibleQuestions(questions, s).map((q) => q.id);

const student: FlowState = {
  ...initialState,
  who: "student",
  age: "18 to 24",
  firstName: "Priya",
  expType: "Internship",
  role: "Marketing",
  nowStatus: "uni",
  mode: "self",
  format: "write",
  written: "I helped the team put together a short report on their customers. By Wednesday I was presenting part of it in the morning meeting, which made me really nervous, but they listened and asked questions. Someone actually used what I made. The hardest thing was asking for help. My advice: say yes to things and ask loads of questions.",
};

/** Walks the flow from the start, following nextId, until it stops moving. */
function walk(s: FlowState, questions: Question[] = QUESTIONS): string[] {
  const path = ["intro"];
  for (;;) {
    const next = nextId(questions, path[path.length - 1]!, s);
    if (next === path[path.length - 1]) return path;
    path.push(next);
  }
}

describe("question config", () => {
  it("has unique ids", () => {
    const all = QUESTIONS.map((q) => q.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("puts every chaptered question in one of the four chapters", () => {
    for (const q of QUESTIONS) {
      if (["intro", "stop", "done"].includes(q.kind)) expect(q.chapter).toBeUndefined();
      else expect(q.chapter).toBeDefined();
    }
  });
});

describe("show conditions (PRD 5.3)", () => {
  it("follows the written story path for a student at university", () => {
    expect(walk(student)).toEqual([
      "intro", "who", "age", "name", "exp", "role", "org", "now", "mode", "format", "story", "draft",
      "display", "channels", "email", "confirm", "done",
    ]);
  });

  it("skips the experience type for Springpod students and professionals", () => {
    expect(ids({ ...student, who: "springpod" })).not.toContain("exp");
    expect(ids({ ...student, who: "pro" })).not.toContain("exp");
    expect(ids({ ...student, who: "early" })).toContain("exp");
  });

  it("asks for role, company and industry only when working or on an apprenticeship", () => {
    for (const nowStatus of ["working", "apprentice"] as const) {
      expect(ids({ ...student, nowStatus })).toEqual(expect.arrayContaining(["nowRole", "nowCo", "nowInd"]));
    }
    expect(ids(student)).not.toContain("nowRole");
  });

  it("asks to show the company only when one was given", () => {
    const working: FlowState = { ...student, nowStatus: "working", nowRole: "Producer" };
    expect(ids(working)).not.toContain("showCo");
    expect(ids({ ...working, nowCo: "Northern Media Co" })).toContain("showCo");
  });

  it("adds guidance and transcript for voice notes and videos, and skips format for interviews", () => {
    expect(ids({ ...student, format: "video" })).toEqual(expect.arrayContaining(["guide", "transcript"]));
    expect(ids({ ...student, format: "voice" })).toEqual(expect.arrayContaining(["guide", "transcript"]));
    const interview = ids({ ...student, mode: "interview", format: "interview" });
    expect(interview).not.toContain("format");
    expect(interview).not.toContain("guide");
  });

  it("asks for a parent or carer's email only for 14 to 17 year olds", () => {
    expect(ids({ ...student, age: "14 to 17" })).toContain("parent");
    expect(ids(student)).not.toContain("parent");
  });

  it("sends under 14s to the stop screen and goes no further", () => {
    const young: FlowState = { ...initialState, who: "student", age: "Under 14" };
    expect(nextId(QUESTIONS, "age", young)).toBe("stop");
    expect(reachableId(QUESTIONS, "name", young)).toBe("stop");
  });

  it("changes the flow when a `when` condition changes, with no other code change (acceptance criterion 2)", () => {
    const edited = QUESTIONS.map((q) => (q.id === "org" ? { ...q, when: (s: FlowState) => s.who === "pro" } : q));
    expect(walk(student, edited)).not.toContain("org");
    expect(walk({ ...student, who: "pro" }, edited)).toContain("org");
    expect(walk(student)).toContain("org");
  });
});

describe("navigation", () => {
  it("goes back to the previous visible question, never to the stop screen", () => {
    expect(prevId(QUESTIONS, "name", student)).toBe("age");
    expect(prevId(QUESTIONS, "role", { ...student, who: "springpod" })).toBe("name");
    expect(prevId(QUESTIONS, "who", student)).toBe("intro");
  });

  it("only lets people land on a step once every earlier step is complete", () => {
    expect(reachableId(QUESTIONS, "email", initialState)).toBe("who");
    expect(reachableId(QUESTIONS, "role", { ...student, firstName: "" })).toBe("name");
    expect(reachableId(QUESTIONS, "role", student)).toBe("role");
    expect(reachableId(QUESTIONS, "not-a-step", student)).toBe("draft");
  });
});

describe("validation", () => {
  it("uses the prototype messages", () => {
    expect(validationError(findQuestion(QUESTIONS, "name"), initialState)).toBe("Add your first name");
    expect(validationError(findQuestion(QUESTIONS, "channels"), initialState)).toBe("Choose at least one");
    expect(validationError(findQuestion(QUESTIONS, "email"), { ...initialState, email: "nope" })).toBe(
      "That email doesn't look right. Check it and try again",
    );
    expect(
      validationError(findQuestion(QUESTIONS, "parent"), { ...initialState, email: "a@b.co", parentEmail: "A@B.co " }),
    ).toBe("This needs to be a different email from yours");
    expect(validationError(findQuestion(QUESTIONS, "confirm"), { ...initialState, marketing: true })).toBe(
      "Tick the first box to confirm it's your experience",
    );
  });

  it("lets optional questions be skipped", () => {
    expect(validationError(findQuestion(QUESTIONS, "org"), initialState)).toBeNull();
    expect(validationError(findQuestion(QUESTIONS, "nowCo"), initialState)).toBeNull();
  });

  it("starts with nothing pre-ticked (acceptance criterion 4)", () => {
    expect(Object.values(initialState.channels).some(Boolean)).toBe(false);
    expect(initialState.terms).toBe(false);
    expect(initialState.marketing).toBe(false);
  });
});

describe("answer side effects", () => {
  const set = (id: string, s: FlowState, v: string) => {
    const q = findQuestion(QUESTIONS, id);
    if (q.kind !== "single") throw new Error("not single");
    return q.set(s, v);
  };

  it("sets the experience type for Springpod students and professionals, and clears it when switching away", () => {
    const springpod = set("who", initialState, "springpod");
    expect(springpod.expType).toBe("Springpod virtual programme");
    expect(set("who", springpod, "student").expType).toBe("");
    expect(set("who", initialState, "pro").expType).toBe("My first job");
  });

  it("clears current role details when no longer working", () => {
    const working = { ...student, nowStatus: "working" as const, nowRole: "Producer", nowCo: "Co", nowInd: "Law", showCo: true };
    expect(set("now", working, "uni")).toMatchObject({ nowRole: "", nowCo: "", nowInd: "", showCo: null });
  });

  it("sets the format for interviews and clears it when switching back", () => {
    const interview = set("mode", student, "interview");
    expect(interview.format).toBe("interview");
    expect(set("mode", interview, "self").format).toBe("");
  });
});

describe("chapter progress", () => {
  it("fills earlier chapters and part of the current one", () => {
    const fills = chapterProgress(QUESTIONS, "role", student).map((c) => c.fill);
    // Experience has exp, role, org, now for this person: role is 2 of 4.
    expect(fills).toEqual([100, 50, 0, 0]);
  });

  it("shows nothing on the start screen", () => {
    expect(chapterProgress(QUESTIONS, "intro", student).map((c) => c.fill)).toEqual([0, 0, 0, 0]);
  });
});
