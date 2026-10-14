import { nowText } from "@/flow/display";
import { WHO } from "@/flow/options";
import { firstName, type FlowState } from "@/flow/state";
import type { PersonContext } from "./prompts";

/** The person details the prompts need, from their answers. */
export function personContext(state: FlowState): PersonContext {
  return {
    firstName: firstName(state),
    ageBand: state.age,
    expType: state.expType,
    organisation: state.org.trim(),
    area: state.role.trim() || "an unspecified area",
    whoLabel: WHO.find((w) => w.value === state.who)?.label ?? "",
    nowText: nowText(state),
  };
}
