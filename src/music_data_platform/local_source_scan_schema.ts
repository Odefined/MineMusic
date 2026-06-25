import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

// Phase 26 Local Source Scan durable data model. Five tables own root
// descriptors, batch run boundaries, retry/checkpoint work, current root/path
// membership, and durable issue detail. No absolute path, parser payload, or
// job-backend record is ever stored here (D24, D33). See the plan's Durable
// Data Model section for the column-by-column contract.

export const musicDataPlatformLocalSourceScanSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.local_source_scan_v1",
  async apply(context) {
    // Stable Scan Root descriptors. root_id is the durable identity; the
    // machine-specific rootDir never lives here (D24). One row per registered
    // root; startup registration rejects durable roots missing from current
    // config (D39).
    await context.run(`
      CREATE TABLE IF NOT EXISTS local_source_scan_roots (
        root_id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        label TEXT NOT NULL,
        config_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // One durable run boundary per scan. status tracks the lifecycle state
    // machine; phase tracks the forward-only discovering -> processing ->
    // reconciling sub-phase while running. Counters are fixed at finalization.
    await context.run(`
      CREATE TABLE IF NOT EXISTS local_source_scan_batches (
        batch_id TEXT PRIMARY KEY,
        root_id TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        config_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL,
        phase TEXT,
        advance_generation INTEGER NOT NULL,
        discovered_count INTEGER NOT NULL,
        processed_count INTEGER NOT NULL,
        imported_count INTEGER NOT NULL,
        unchanged_count INTEGER NOT NULL,
        drifted_count INTEGER NOT NULL,
        unstable_count INTEGER NOT NULL,
        failed_count INTEGER NOT NULL,
        deletion_candidate_count INTEGER NOT NULL,
        deleted_count INTEGER NOT NULL,
        failure_code TEXT,
        failure_message TEXT,
        cancel_requested_at TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(root_id) REFERENCES local_source_scan_roots(root_id)
      )
    `);

    // At most one active (non-terminal) batch per root (D11). A partial unique
    // index makes startScan idempotent at the database boundary: a concurrent
    // start whose insert hits this constraint is caught and returned as
    // scan_already_active; terminal batches drop out so a fresh scan can start.
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS local_source_scan_batches_active_root_uniq
      ON local_source_scan_batches(root_id)
      WHERE status IN ('queued', 'running', 'cancel_requested')
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS local_source_scan_batches_root_id_idx
      ON local_source_scan_batches(root_id)
    `);

    // Durable retry/checkpoint work for one batch. The root directory uses an
    // explicit directory work representation; discovery is complete only when no
    // pending directory work remains and every included directory was listed
    // successfully (D10, D30). Ordinary successful rows are deleted after
    // terminal summary (D26); issue evidence lives in local_source_scan_issues
    // and current item state in local_source_scan_items.
    await context.run(`
      CREATE TABLE IF NOT EXISTS local_source_scan_work_items (
        batch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        entry_kind TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        status TEXT NOT NULL,
        size_bytes BIGINT,
        modified_at_ms BIGINT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(batch_id, relative_path),
        UNIQUE(batch_id, sequence),
        FOREIGN KEY(batch_id) REFERENCES local_source_scan_batches(batch_id)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS local_source_scan_work_items_pending_idx
      ON local_source_scan_work_items(batch_id, status, sequence)
    `);

    // Current root/path management state (D25). Only active rows with a current
    // Source binding project into Owner Catalog. source_ref_key is absent for a
    // path that has not produced a Local Source yet, and for a failed item whose
    // parse failed before registration; the partial unique index permits many
    // null-key items to coexist.
    await context.run(`
      CREATE TABLE IF NOT EXISTS local_source_scan_items (
        root_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        source_ref_key TEXT,
        state TEXT NOT NULL,
        observed_size_bytes BIGINT,
        observed_modified_at_ms BIGINT,
        observed_content_md5 TEXT,
        first_seen_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        last_batch_id TEXT NOT NULL,
        PRIMARY KEY(root_id, relative_path),
        FOREIGN KEY(root_id) REFERENCES local_source_scan_roots(root_id)
      )
    `);

    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS local_source_scan_items_source_ref_key_uniq
      ON local_source_scan_items(source_ref_key)
      WHERE source_ref_key IS NOT NULL
    `);

    // Durable issue detail (D33). No parser payload, stack trace, absolute path,
    // or generic serialized error is stored. Issue cursor identity is batch id
    // plus stable sequence.
    await context.run(`
      CREATE TABLE IF NOT EXISTS local_source_scan_issues (
        batch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        issue_kind TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(batch_id, sequence),
        FOREIGN KEY(batch_id) REFERENCES local_source_scan_batches(batch_id)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS local_source_scan_issues_batch_id_idx
      ON local_source_scan_issues(batch_id)
    `);
  },
};
