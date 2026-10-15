import type { FlowState } from "@/flow/state";
import type { DraftAnswers } from "./story-data";

/** The answers saved with a draft (checked on the server with `draftAnswersSchema`). */
export function pickDraftAnswers(s: FlowState): DraftAnswers {
  return {
    who: s.who,
    age: s.age,
    firstName: s.firstName,
    expType: s.expType,
    role: s.role,
    org: s.org,
    nowStatus: s.nowStatus,
    nowRole: s.nowRole,
    nowCo: s.nowCo,
    nowInd: s.nowInd,
    mode: s.mode,
    format: s.format,
    written: s.written,
    draft: s.draft,
    previousDraft: s.previousDraft,
    display: s.display,
    showCo: s.showCo,
  };
}
