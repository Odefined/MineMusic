import type { Ref } from "../contracts/kernel.js";
import type { MusicDatabaseContext } from "../storage/database.js";

export type DownloadJobState = "running" | "completed" | "failed";

export type DownloadJobRecord = {
  jobId: string;
  state: DownloadJobState;
  providerId: string;
  sourceRef: Ref;
  outputPath: string;
  bytesDownloaded: number;
  totalBytes?: number;
  container?: string;
  bitrate?: number;
  sizeBytes?: number;
  md5?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type DownloadJobRepository = {
  get(input: { jobId: string }): Promise<DownloadJobRecord | undefined>;
  insert(record: DownloadJobRecord): Promise<DownloadJobRecord>;
  update(record: DownloadJobRecord): Promise<DownloadJobRecord>;
};

type DownloadJobRow = {
  job_id: string;
  state: string;
  provider_id: string;
  source_ref_namespace: string;
  source_ref_kind: string;
  source_ref_id: string;
  source_ref_label: string | null;
  output_path: string;
  bytes_downloaded: number;
  total_bytes: number | null;
  container: string | null;
  bitrate: number | null;
  size_bytes: number | null;
  md5: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function createDownloadJobRepository(input: {
  db: MusicDatabaseContext;
}): DownloadJobRepository {
  return {
    async get({ jobId }) {
      const row = await input.db.get<DownloadJobRow>(
        `SELECT job_id, state, provider_id, source_ref_namespace, source_ref_kind,
                source_ref_id, source_ref_label, output_path, bytes_downloaded,
                total_bytes, container, bitrate, size_bytes, md5, error_code,
                error_message, created_at, updated_at
         FROM download_jobs
         WHERE job_id = ?`,
        [jobId],
      );

      return row === undefined ? undefined : rowToRecord(row);
    },
    async insert(record) {
      await input.db.run(
        `INSERT INTO download_jobs (
           job_id, state, provider_id, source_ref_namespace, source_ref_kind,
           source_ref_id, source_ref_label, output_path, bytes_downloaded,
           total_bytes, container, bitrate, size_bytes, md5, error_code,
           error_message, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        recordToParams(record),
      );

      return record;
    },
    async update(record) {
      await input.db.run(
        `UPDATE download_jobs
         SET state = ?, bytes_downloaded = ?, total_bytes = ?, container = ?,
             bitrate = ?, size_bytes = ?, md5 = ?, error_code = ?,
             error_message = ?, updated_at = ?
         WHERE job_id = ?`,
        [
          record.state,
          record.bytesDownloaded,
          record.totalBytes ?? null,
          record.container ?? null,
          record.bitrate ?? null,
          record.sizeBytes ?? null,
          record.md5 ?? null,
          record.errorCode ?? null,
          record.errorMessage ?? null,
          record.updatedAt,
          record.jobId,
        ],
      );

      return record;
    },
  };
}

function rowToRecord(row: DownloadJobRow): DownloadJobRecord {
  const sourceRef: Ref = {
    namespace: row.source_ref_namespace,
    kind: row.source_ref_kind,
    id: row.source_ref_id,
    ...(row.source_ref_label === null ? {} : { label: row.source_ref_label }),
  };

  return {
    jobId: row.job_id,
    state: row.state as DownloadJobState,
    providerId: row.provider_id,
    sourceRef,
    outputPath: row.output_path,
    bytesDownloaded: row.bytes_downloaded,
    ...(row.total_bytes === null ? {} : { totalBytes: row.total_bytes }),
    ...(row.container === null ? {} : { container: row.container }),
    ...(row.bitrate === null ? {} : { bitrate: row.bitrate }),
    ...(row.size_bytes === null ? {} : { sizeBytes: row.size_bytes }),
    ...(row.md5 === null ? {} : { md5: row.md5 }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordToParams(record: DownloadJobRecord): readonly (string | number | null)[] {
  return [
    record.jobId,
    record.state,
    record.providerId,
    record.sourceRef.namespace,
    record.sourceRef.kind,
    record.sourceRef.id,
    record.sourceRef.label ?? null,
    record.outputPath,
    record.bytesDownloaded,
    record.totalBytes ?? null,
    record.container ?? null,
    record.bitrate ?? null,
    record.sizeBytes ?? null,
    record.md5 ?? null,
    record.errorCode ?? null,
    record.errorMessage ?? null,
    record.createdAt,
    record.updatedAt,
  ];
}
