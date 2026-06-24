import type { Result } from "../contracts/kernel.js";
import type { MusicDatabase } from "../storage/database.js";
import { DEFAULT_OWNER_SCOPE } from "./owner_scope.js";
import { isMusicDataPlatformError } from "./errors.js";
import type { LocalSourceScanFilesystemPort } from "./local_source_scan_filesystem_port.js";
import type { LocalSourceScanCommands } from "./local_source_scan_commands.js";
import type { LocalSourceScanBatchRecord } from "./local_source_scan_records.js";
import {
  createLocalSourceScanReadPort,
  toLocalSourceScanBatchSummary,
  type LocalSourceScanBatchSummary,
  type LocalSourceScanIssuePage,
  type LocalSourceScanRootSummary,
} from "./local_source_scan_read_model.js";

// Phase 26 Local Source Scan caller-facing service (D34). Five operations over
// roots, batches, status, cancellation, and paginated issues. Slice 26B wires
// every read plus start/cancel; the self-driving advance job is added in 26C,
// so a freshly started batch remains queued until the advance handler drives
// it. Job submission will compose this service without changing its contract.
//
// One failure channel: expected caller failures (unknown root, unavailable root,
// active conflict, unknown batch, invalid cancellation/cursor) are Result;
// corrupt state and broken invariants throw at the owning boundary.

export type LocalSourceScanStartScanInput = { rootId: string };
export type LocalSourceScanGetStatusInput = { batchId: string };
export type LocalSourceScanCancelInput = { batchId: string };
export type LocalSourceScanListIssuesInput = {
  batchId: string;
  cursor?: string;
  limit: number;
};

export type LocalSourceScanService = {
  listRoots(): Promise<readonly LocalSourceScanRootSummary[]>;
  startScan(input: LocalSourceScanStartScanInput): Promise<Result<{ batchId: string }>>;
  getScanStatus(input: LocalSourceScanGetStatusInput): Promise<Result<LocalSourceScanBatchSummary>>;
  requestScanCancellation(input: LocalSourceScanCancelInput): Promise<Result<LocalSourceScanBatchSummary>>;
  listScanIssues(input: LocalSourceScanListIssuesInput): Promise<Result<LocalSourceScanIssuePage>>;
};

export type CreateLocalSourceScanServiceInput = {
  database: MusicDatabase;
  filesystemPort: LocalSourceScanFilesystemPort;
  commands: LocalSourceScanCommands;
  ownerScope?: string;
  now?: () => string;
};

export function createLocalSourceScanService(input: CreateLocalSourceScanServiceInput): LocalSourceScanService {
  const ownerScope = input.ownerScope ?? DEFAULT_OWNER_SCOPE;
  const now = input.now ?? (() => new Date().toISOString());
  const read = createLocalSourceScanReadPort({ db: input.database.context() });

  return {
    async listRoots() {
      return await read.listRootSummaries({ ownerScope, filesystemPort: input.filesystemPort });
    },

    async startScan({ rootId }) {
      const configured = await read.getRoot({ rootId, ownerScope });
      if (!configured) {
        return fail("music_data.scan_root_not_configured", `Scan root '${rootId}' is not configured.`, false);
      }
      // D40: when unavailability is known at start, return retryable
      // scan_root_unavailable without creating a batch.
      const availability = await input.filesystemPort.checkRoot({ rootId });
      if (!availability.ok || availability.value.availability !== "available") {
        return fail("music_data.scan_root_unavailable", `Scan root '${rootId}' path is currently unavailable.`, true);
      }
      return await input.commands.startBatch({ rootId, ownerScope, now: now() });
    },

    async getScanStatus({ batchId }) {
      const summary = await read.getBatchSummary({ batchId });
      if (summary === undefined) {
        return fail("music_data.scan_batch_not_found", `Scan batch '${batchId}' was not found.`, false);
      }
      return ok(summary);
    },

    async requestScanCancellation({ batchId }) {
      const result = await input.commands.requestCancellation({ batchId, now: now() });
      if (!result.ok) {
        return result;
      }
      return ok(toSummary(result.value));
    },

    async listScanIssues(scanInput) {
      try {
        const page = await read.listIssues(scanInput);
        return ok(page);
      } catch (cause) {
        if (isMusicDataPlatformError(cause) && cause.code === "music_data.scan_issue_cursor_invalid") {
          return fail(cause.code, cause.message, false);
        }
        throw cause;
      }
    },
  };
}

function toSummary(batch: LocalSourceScanBatchRecord): LocalSourceScanBatchSummary {
  return toLocalSourceScanBatchSummary(batch);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: string, message: string, retryable: boolean): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable,
    },
  };
}
