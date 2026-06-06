import {
  createExtensionRuntime,
  type CreateExtensionRuntimeInput,
  type ExtensionRuntime,
} from "../extension/index.js";
import type { RuntimeModule } from "./runtime_module.js";

export type CreateExtensionRuntimeModuleInput = CreateExtensionRuntimeInput & {
  runtime?: ExtensionRuntime;
};

export function createExtensionRuntimeModule(
  input: CreateExtensionRuntimeModuleInput = {},
): RuntimeModule {
  const runtime = input.runtime ?? createExtensionRuntime({
    plugins: input.plugins ?? [],
  });

  return {
    descriptor: {
      id: "extension",
      ownerArea: "extension",
      label: "Extension",
    },
    async initialize() {
      const initialized = await runtime.initialize();

      if (!initialized.ok) {
        return initialized;
      }

      return {
        ok: true,
        value: {},
      };
    },
    stop() {
      return runtime.stop();
    },
  };
}
