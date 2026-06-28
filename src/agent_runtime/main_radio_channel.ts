import type { RadioNotifyRequest } from "../contracts/agent_runtime.js";

export type MainRadioNotifyChannel = {
  notify(input: RadioNotifyRequest): Promise<void>;
};

export function createInMemoryMainRadioNotifyChannel(): MainRadioNotifyChannel & {
  readonly notifications: readonly RadioNotifyRequest[];
} {
  const notifications: RadioNotifyRequest[] = [];
  return {
    get notifications() {
      return notifications;
    },
    async notify(input) {
      notifications.push(input);
    },
  };
}
