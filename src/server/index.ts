import { createStageRuntime } from "../stage_core/index.js";
import { createStageInterface } from "../stage_interface/index.js";

export function createServerHostRuntime() {
  const stageInterface = createStageInterface({
    instruments: [],
    tools: [],
  });

  return createStageRuntime({ interface: stageInterface });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = createServerHostRuntime();
  console.log(JSON.stringify(runtime.snapshot(), null, 2));
}
