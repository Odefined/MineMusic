import type { StreamFn } from "@earendil-works/pi-agent-core";

const fakeUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function assistantTextMessage(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: fakeUsage,
    stopReason: "stop" as const,
    timestamp: 0,
  };
}

export function assistantMessageWithToolCall(id: string, name: string, args: Record<string, unknown>) {
  return {
    role: "assistant" as const,
    content: [{ type: "toolCall" as const, id, name, arguments: args }],
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: fakeUsage,
    stopReason: "toolUse" as const,
    timestamp: 0,
  };
}

export function assistantErrorMessage(reason: "aborted" | "error", errorMessage: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: "" }],
    api: "openai" as const,
    provider: "openai" as const,
    model: "fake",
    usage: fakeUsage,
    stopReason: reason,
    errorMessage,
    timestamp: 0,
  };
}

type FakeAssistantMessage =
  | ReturnType<typeof assistantTextMessage>
  | ReturnType<typeof assistantMessageWithToolCall>
  | ReturnType<typeof assistantErrorMessage>;

export type FakeAssistantMessageEvent =
  | {
      type: "done";
      reason: "length" | "stop" | "toolUse";
      message: FakeAssistantMessage;
    }
  | {
      type: "error";
      reason: "aborted" | "error";
      error: ReturnType<typeof assistantErrorMessage>;
    };

export function fakeAssistantMessageEventStream(event: FakeAssistantMessageEvent): ReturnType<StreamFn> {
  const finalMessage = event.type === "done" ? event.message : event.error;

  return ({
    async *[Symbol.asyncIterator]() {
      yield event;
    },
    result() {
      return Promise.resolve(finalMessage);
    },
  } as unknown) as ReturnType<StreamFn>;
}
