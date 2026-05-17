import type { Result, ToolName } from "../contracts/index.js";
import type { ToolDispatchPort } from "../ports/index.js";
import { stableToolNames } from "../instruments/index.js";

export type MineMusicToolApi = {
  tools: Record<ToolName, (payload: unknown) => Promise<Result<unknown>>>;
};

type MineMusicToolApiOptions = {
  sessionId: string;
  dispatch: ToolDispatchPort;
};

export function createMineMusicToolApi({
  sessionId,
  dispatch,
}: MineMusicToolApiOptions): MineMusicToolApi {
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
  ) as Record<ToolName, (payload: unknown) => Promise<Result<unknown>>>;

  return { tools };
}
