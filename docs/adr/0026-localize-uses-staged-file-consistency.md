# Localize Uses Staged File Consistency

Accepted. `music_data_platform.localize_provider_source` does not treat file writes and Postgres writes as one atomic transaction. The localize handler uses staged file writes, verification, finalization, cleanup, and later reconciliation for orphan staged files because the alternative would either fake atomicity or push file ownership into the Background Work Backend.
