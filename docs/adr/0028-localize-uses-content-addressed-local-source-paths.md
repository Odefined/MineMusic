# Localize Uses Content-Addressed Local Source Paths

Deprecated by ADR-0042.

Accepted. `music_data_platform.localize_provider_source` stores localized audio at content-addressed canonical paths such as `<root>/tracks/<md5-prefix>/<md5>.<ext>` rather than track, artist, or album names. Human-readable music names remain metadata for presentation and export, not storage identity. The handler writes to a staging path, verifies the downloaded file, computes the actual md5, and then moves to the final path. An existing matching final file is idempotent success; an existing different final file is a storage collision or corruption failure and must not be overwritten.
