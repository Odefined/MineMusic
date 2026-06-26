// Agent Runtime contract surface. Session Context is Agent Runtime-owned, but
// assembled over the Workbench Interface in-process read model rather than over
// Web/AG-UI wire state.

import type { WorkspaceReadModel } from "./workbench_interface.js";

export type AgentSessionContext = WorkspaceReadModel;
