import type { Result } from "../contracts/index.js";
import type { ToolDispatchPort } from "../ports/index.js";
import { stableToolNames, type StableToolName } from "./tools.js";

export type MineMusicStageInterface = {
  tools: Record<StableToolName, (payload: unknown) => Promise<Result<unknown>>>;
};

export type MineMusicStageInterfaceOptions = {
  sessionId: string;
  dispatch: ToolDispatchPort;
};

export function createMineMusicStageInterface({
  sessionId,
  dispatch,
}: MineMusicStageInterfaceOptions): MineMusicStageInterface {
  const tools = Object.fromEntries(
    stableToolNames.map((toolName) => [
      toolName,
      (payload: unknown) =>
        dispatch.call({
          sessionId,
          toolName,
          payload,
        }),
    ]),
  ) as Record<StableToolName, (payload: unknown) => Promise<Result<unknown>>>;

  return { tools };
}
