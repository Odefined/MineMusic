import {
  createProjectionMaintenanceRunner,
  type ProjectionMaintenanceRunSummary,
} from "../music_data_platform/index.js";
import type { MusicDatabase } from "../storage/index.js";

type DefaultTimerHandle = ReturnType<typeof globalThis.setTimeout>;

const DEFAULT_PROJECTION_MAINTENANCE_INTERVAL_MS = 1000;
const DEFAULT_PROJECTION_MAINTENANCE_BATCH_LIMIT = 100;
const MIN_PROJECTION_MAINTENANCE_INTERVAL_MS = 100;
const MAX_PROJECTION_MAINTENANCE_INTERVAL_MS = 60000;
const MIN_PROJECTION_MAINTENANCE_BATCH_LIMIT = 1;
const MAX_PROJECTION_MAINTENANCE_BATCH_LIMIT = 1000;
const PROJECTION_MAINTENANCE_TICK_FAILURE_CODE =
  "server_host.music_data_platform_projection_maintenance_tick_failed";

export type ProjectionMaintenanceSchedulerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchLimit: number;
};

export type ProjectionMaintenanceSchedulerDependencies<TimerHandle = DefaultTimerHandle> = {
  now: () => string;
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

export type ProjectionMaintenanceSchedulerSnapshot = {
  enabled: boolean;
  running: boolean;
  lastRunAt?: string;
  lastSummary?: ProjectionMaintenanceRunSummary;
  lastError?: {
    code: string;
    message: string;
  };
};

export type CreateProjectionMaintenanceSchedulerInput<TimerHandle = DefaultTimerHandle> = {
  database: MusicDatabase;
  config?: Partial<ProjectionMaintenanceSchedulerConfig>;
  dependencies?: Partial<ProjectionMaintenanceSchedulerDependencies<TimerHandle>>;
};

export type ProjectionMaintenanceScheduler = {
  start(): void;
  stop(): Promise<void>;
  snapshot(): ProjectionMaintenanceSchedulerSnapshot;
};

export function createProjectionMaintenanceScheduler<TimerHandle = DefaultTimerHandle>(
  input: CreateProjectionMaintenanceSchedulerInput<TimerHandle>,
): ProjectionMaintenanceScheduler {
  const config = normalizeProjectionMaintenanceSchedulerConfig(input.config);
  const dependencies = normalizeProjectionMaintenanceSchedulerDependencies(input.dependencies);
  const state: {
    started: boolean;
    scheduledHandle: TimerHandle | undefined;
    inFlightTick: Promise<void> | undefined;
    snapshot: ProjectionMaintenanceSchedulerSnapshot;
  } = {
    started: false,
    scheduledHandle: undefined,
    inFlightTick: undefined,
    snapshot: {
      enabled: config.enabled,
      running: false,
    },
  };

  return {
    start() {
      if (!config.enabled || state.started) {
        return;
      }

      state.started = true;
      scheduleTick(0);
    },
    async stop() {
      state.started = false;
      clearScheduledTick();
      await state.inFlightTick;
    },
    snapshot() {
      return {
        ...state.snapshot,
        ...(state.snapshot.lastSummary === undefined
          ? {}
          : { lastSummary: { ...state.snapshot.lastSummary } }),
        ...(state.snapshot.lastError === undefined
          ? {}
          : { lastError: { ...state.snapshot.lastError } }),
      };
    },
  };

  function scheduleTick(delayMs: number): void {
    if (!state.started || !config.enabled) {
      return;
    }

    const handle = dependencies.setTimeout(() => {
      if (state.scheduledHandle === handle) {
        state.scheduledHandle = undefined;
      }

      if (!state.started) {
        return;
      }

      scheduleTick(config.intervalMs);
      void runTick();
    }, delayMs);

    state.scheduledHandle = handle;
  }

  function clearScheduledTick(): void {
    if (state.scheduledHandle === undefined) {
      return;
    }

    dependencies.clearTimeout(state.scheduledHandle);
    state.scheduledHandle = undefined;
  }

  function runTick(): Promise<void> | undefined {
    if (!state.started || !config.enabled || state.snapshot.running) {
      return undefined;
    }

    state.snapshot.running = true;
    const inFlightTick = Promise.resolve().then(() => {
      const runAt = dependencies.now();
      state.snapshot.lastRunAt = runAt;
      const summary = createProjectionMaintenanceRunner({
        database: input.database,
        now: runAt,
      }).runProjectionMaintenance({
        limit: config.batchLimit,
      });

      state.snapshot.lastSummary = summary;
      delete state.snapshot.lastError;
    }).catch((error) => {
      state.snapshot.lastError = compactProjectionMaintenanceTickError(error);
    }).finally(() => {
      state.snapshot.running = false;

      if (state.inFlightTick === inFlightTick) {
        state.inFlightTick = undefined;
      }
    });

    state.inFlightTick = inFlightTick;
    return inFlightTick;
  }
}

function normalizeProjectionMaintenanceSchedulerConfig(
  config: Partial<ProjectionMaintenanceSchedulerConfig> | undefined,
): ProjectionMaintenanceSchedulerConfig {
  return {
    enabled: normalizeOptionalBoolean(
      config?.enabled,
      "enabled",
      true,
    ),
    intervalMs: normalizeOptionalInteger({
      value: config?.intervalMs,
      field: "intervalMs",
      minimum: MIN_PROJECTION_MAINTENANCE_INTERVAL_MS,
      maximum: MAX_PROJECTION_MAINTENANCE_INTERVAL_MS,
      defaultValue: DEFAULT_PROJECTION_MAINTENANCE_INTERVAL_MS,
    }),
    batchLimit: normalizeOptionalInteger({
      value: config?.batchLimit,
      field: "batchLimit",
      minimum: MIN_PROJECTION_MAINTENANCE_BATCH_LIMIT,
      maximum: MAX_PROJECTION_MAINTENANCE_BATCH_LIMIT,
      defaultValue: DEFAULT_PROJECTION_MAINTENANCE_BATCH_LIMIT,
    }),
  };
}

function normalizeProjectionMaintenanceSchedulerDependencies<TimerHandle>(
  dependencies: Partial<ProjectionMaintenanceSchedulerDependencies<TimerHandle>> | undefined,
): ProjectionMaintenanceSchedulerDependencies<TimerHandle> {
  return {
    now: dependencies?.now ?? (() => new Date().toISOString()),
    setTimeout: dependencies?.setTimeout
      ?? (globalThis.setTimeout as unknown as ProjectionMaintenanceSchedulerDependencies<TimerHandle>["setTimeout"]),
    clearTimeout: dependencies?.clearTimeout
      ?? (globalThis.clearTimeout as unknown as ProjectionMaintenanceSchedulerDependencies<TimerHandle>["clearTimeout"]),
  };
}

function normalizeOptionalBoolean(
  value: boolean | undefined,
  field: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw invalidProjectionMaintenanceSchedulerConfig(
      `${field} must be a boolean when provided.`,
    );
  }

  return value;
}

function normalizeOptionalInteger(input: {
  value: number | undefined;
  field: string;
  minimum: number;
  maximum: number;
  defaultValue: number;
}): number {
  if (input.value === undefined) {
    return input.defaultValue;
  }

  if (!Number.isInteger(input.value) || input.value < input.minimum || input.value > input.maximum) {
    throw invalidProjectionMaintenanceSchedulerConfig(
      `${input.field} must be an integer between ${input.minimum} and ${input.maximum}.`,
    );
  }

  return input.value;
}

function compactProjectionMaintenanceTickError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      code: PROJECTION_MAINTENANCE_TICK_FAILURE_CODE,
      message: error.message,
    };
  }

  return {
    code: PROJECTION_MAINTENANCE_TICK_FAILURE_CODE,
    message: "Projection Maintenance scheduler tick failed with a non-Error exception.",
  };
}

function invalidProjectionMaintenanceSchedulerConfig(message: string): Error {
  return new Error(`Projection Maintenance scheduler config invalid: ${message}`);
}
