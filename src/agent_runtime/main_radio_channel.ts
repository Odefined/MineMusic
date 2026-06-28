import type { RadioNotifyRequest } from "../contracts/agent_runtime.js";

export type MainRadioNotifyChannel = {
  notify(input: RadioNotifyRequest): Promise<void>;
};

export function createInMemoryMainRadioNotifyChannel(): MainRadioNotifyChannel & {
  readonly notifications: readonly RadioNotifyRequest[];
} {
  // PR3 substrate default: Server Host owns the channel, while durable Main
  // surfacing/event-log consumption lands after the Radio runtime path exists.
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
