import type { StageError } from "../contracts/kernel.js";

export type StageToolFailureSurface =
  | "tool_result_error"
  | "invalid_request"
  | "internal_failure";

export function classifyStageToolFailure(error: StageError): StageToolFailureSurface {
  if (error.area !== "stage_interface") {
    return "tool_result_error";
  }

  switch (error.code) {
    case "stage_interface.invalid_input":
    case "stage_interface.ask_required":
    case "stage_interface.denied_by_policy":
    case "stage_interface.tool_timeout":
      return "tool_result_error";
    case "stage_interface.tool_not_found":
      return "invalid_request";
    case "stage_interface.invalid_output":
    case "stage_interface.undeclared_tool_error":
    case "stage_interface.execution_gate_failed":
    case "stage_interface.tool_handler_failed":
      return "internal_failure";
    default:
      return "internal_failure";
  }
}
