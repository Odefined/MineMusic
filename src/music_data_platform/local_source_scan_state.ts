// Phase 26 Local Source Scan batch state machine (D18, D19, D30, D43). Pure
// rules shared by commands, the advance handler, and tests so the transition
// contract lives in one place. The owning command still performs the actual
// durable transition inside a transaction; this module only answers "is this
// transition allowed" and classifies statuses.

export type LocalSourceScanBatchStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "completed"
  | "completed_with_issues"
  | "failed"
  | "cancelled";

export type LocalSourceScanBatchPhase =
  | "discovering"
  | "processing"
  | "reconciling";

// Non-terminal statuses that occupy the per-root active-batch slot (D11). A
// root may hold at most one batch in any of these statuses.
export const ACTIVE_LOCAL_SOURCE_SCAN_BATCH_STATUSES: ReadonlySet<LocalSourceScanBatchStatus> = new Set([
  "queued",
  "running",
  "cancel_requested",
]);

export const TERMINAL_LOCAL_SOURCE_SCAN_BATCH_STATUSES: ReadonlySet<LocalSourceScanBatchStatus> = new Set([
  "completed",
  "completed_with_issues",
  "failed",
  "cancelled",
]);

export function isTerminalScanBatchStatus(status: LocalSourceScanBatchStatus): boolean {
  return TERMINAL_LOCAL_SOURCE_SCAN_BATCH_STATUSES.has(status);
}

export function isActiveScanBatchStatus(status: LocalSourceScanBatchStatus): boolean {
  return ACTIVE_LOCAL_SOURCE_SCAN_BATCH_STATUSES.has(status);
}

// Cancellation is accepted only while a batch is queued, or running in
// discovering/processing (D18, D43). Once reconciling, cancellation returns
// invalid-state so a cancelled batch cannot have deleted only part of its
// trusted disappearance set. Repeating cancellation against cancel_requested
// or cancelled is idempotent (the caller sees the same state, not an error).
export function canRequestScanCancellation(
  status: LocalSourceScanBatchStatus,
  phase: LocalSourceScanBatchPhase | undefined,
): boolean {
  if (status === "queued") {
    return true;
  }
  if (status === "running") {
    return phase === "discovering" || phase === "processing";
  }
  return false;
}

export function isCancelIdempotentStatus(status: LocalSourceScanBatchStatus): boolean {
  return status === "cancel_requested" || status === "cancelled";
}

// Phase moves only forward while running (D30).
const PHASE_ORDER: readonly LocalSourceScanBatchPhase[] = [
  "discovering",
  "processing",
  "reconciling",
];

export function phaseOrder(phase: LocalSourceScanBatchPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function canAdvancePhase(
  from: LocalSourceScanBatchPhase,
  to: LocalSourceScanBatchPhase,
): boolean {
  return phaseOrder(to) > phaseOrder(from);
}
