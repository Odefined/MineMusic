// Server Host composition helper that binds the real production ports into the
// Stage Interface Tool Context Factory. This file owns the port names and the
// factory-build call; `host.ts` only instantiates this helper and exposes a thin
// accessor, so `host.ts` stays free of context-composition logic (Server Host
// stays thin).
//
// The handle minting port is bound LAZILY: the factory is built at Server Host
// creation time, before the Music Data Platform module is initialized, so it
// closes over a thin proxy that resolves the real port from the owning module on
// first use (after `start()`). This mirrors the lazy-port pattern used by the
// Music Experience server shim (`lazyCandidateCommitCommand`).

import type { HandleMintingPort } from "../contracts/stage_interface.js";
import {
  createConservativeStageToolExecutionGate,
  createMemoryStageToolAuditPort,
} from "../effect_boundary/index.js";
import {
  createStageToolContextFactory,
  type StageToolContextFactory,
} from "../stage_interface/index.js";
import type { MusicDataPlatformRuntimeModule } from "./music_data_platform_runtime_module.js";

export type CreateStageToolContextAssemblyInput = {
  musicDataPlatformModule: Pick<MusicDataPlatformRuntimeModule, "handleMinting">;
  ownerScope?: string;
};

export function createStageToolContextAssembly(
  input: CreateStageToolContextAssemblyInput,
): StageToolContextFactory {
  // Both HandleMintingPort methods share one lazy-resolution guard so the
  // fail-loud invariant cannot drift between mint() and resolve().
  const resolveHandleMintingPort = (): HandleMintingPort => {
    const port = input.musicDataPlatformModule.handleMinting();
    if (port === undefined) {
      throw new Error("Stage Tool Context factory used before Music Data Platform initialization.");
    }
    return port;
  };

  const lazyHandleMinting: HandleMintingPort = {
    async mint(mintInput) {
      return resolveHandleMintingPort().mint(mintInput);
    },
    async resolve(resolveInput) {
      return resolveHandleMintingPort().resolve(resolveInput);
    },
  };

  // A single audit port is shared by the conservative gate and the per-call
  // context so gate decisions and ctx.audit records land in the same buffer.
  const audit = createMemoryStageToolAuditPort();
  return createStageToolContextFactory({
    ownerScope: input.ownerScope ?? "local",
    clock: () => new Date().toISOString(),
    handleMinting: lazyHandleMinting,
    executionGate: createConservativeStageToolExecutionGate({ audit }),
    audit,
  });
}
