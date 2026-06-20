# Background Work Uses pg-boss Behind An Adapter

Accepted. Background Work first uses `pg-boss` behind a MineMusic-owned backend adapter because MineMusic already depends on Postgres and should not reimplement queue state, claiming, retry, delayed execution, or worker lifecycle. Domain areas, Stage Interface, and Music Data Platform must depend only on the MineMusic Background Work port, not on `pg-boss` APIs or tables.
