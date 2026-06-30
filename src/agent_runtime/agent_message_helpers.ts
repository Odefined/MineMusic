import type { AgentMessage } from "@earendil-works/pi-agent-core";

// Returns the last assistant message in `messages`, searching from the end. Shared
// by the Main and Radio agent run paths, which both read the final assistant
// turn's stop reason to detect failure/abort.
export function finalAssistantMessage(
  messages: readonly AgentMessage[],
): Extract<AgentMessage, { role: "assistant" }> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}
