# Background Work V1 Uses In-Process Workers

Accepted. Background Work v1 runs workers inside the MineMusic Server process for local simplicity, but the backend and Job Handler contracts must be shaped so the same Postgres-backed job state can later be processed by a separate worker process. The trade-off is deliberate: v1 avoids deployment overhead while still preventing job logic from depending on server-only in-memory execution.
