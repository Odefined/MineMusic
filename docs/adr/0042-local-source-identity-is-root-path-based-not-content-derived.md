# ADR-0042: Local Source Identity Is Root-Path-Based, Not Content-Derived

## Status

Accepted.

MineMusic treats a Local Source as a stable Local Source Root id plus a MineMusic-normalized root-relative path, not as a content blob and not as a special product of the intake path that found it. Platform-native filesystem paths are translated at the root boundary; the identity stored by MineMusic is not an absolute OS path. A downloaded file and a scanned file are the same kind of Local Source; the same root id and normalized relative path is the same Local Source, while matching bytes at different root paths are different Local Sources. Content hashes remain non-unique facts for integrity, shared storage, and duplicate suggestions, and must not silently decide source identity or material identity. The root's machine path may change without changing Local Source identity.

The mapping from Local Source Root id to machine path is runtime configuration, not SourceEntity state. SourceEntity stores the root id and normalized relative path; playback, scan, and file operations resolve the current machine path from configuration and fail at that boundary if the root is unavailable.

MineMusic-normalized relative paths use `/` separators, reject absolute paths and drive paths, fold `.` and in-root `..` segments, and reject paths that escape the root. They do not case-fold, resolve symlinks, call filesystem `realpath`, or perform Unicode normalization; those are platform/filesystem behaviors, not MineMusic identity rules.

The `source_local` ref uses a compact opaque key derived from the root id and root-relative path: `source_local:<kind>:ls_<createDeterministicRefDigest([rootId, normalizedRelativePath])>`. That key is only the Ref representation. The Local Source entity keeps the explicit root id and root-relative path facts so the domain identity remains inspectable and does not become another hidden hash identity.

Moving a file to a different root-relative path creates a different Local Source unless an explicit future move/rename command migrates the identity. MineMusic must not infer path moves from matching content hashes during scan or localization.

MineMusic has one Main Local Source Root for its own managed local files, with reserved root id `main`; other configured Local Source Roots are scan roots for user-owned libraries. Localized downloads are written under the Main Local Source Root's `downloads/` subtree. MineMusic-managed download paths are root-relative Local Source paths and must not be derived from content hashes. ADR-0028's content-addressed localize path policy is deprecated because it would make same-byte downloads collapse to the same path and therefore the same Local Source. Managed download paths may use human-readable folders and names such as artist, album, track title, and source key. The source key is a filename-safe short form derived from the provider source ref, for example `refKey(providerSourceRef)` with `:` replaced by `-`; it is only filename disambiguation and traceability, not provider-backed source identity. Once written, metadata corrections do not automatically rename the Local Source path.

If the managed download path already exists, localization succeeds only when the same root-relative path is already registered as the Local Source being requested. An existing registered Local Source at that path is idempotent success; an existing file without matching Local Source registration is a path conflict. Localize does not automatically choose `(2)`-style alternatives; the caller may later request an explicit different path or an explicit move/rename flow.

Missing path metadata is represented explicitly rather than failing localize by default: missing artist or album uses Unknown path components, and a missing title falls back to the source key as the filename stem.

The local-source registration command receives `rootId`, normalized `relativePath`, `contentMd5`, kind, optional material binding, and optional descriptive metadata. It does not receive bare `md5` or platform-native `filePath` as identity inputs. Local-source uniqueness is by kind plus root id plus normalized root-relative path; content hashes are not unique keys.

The old local-file shape is not compatible: local-file Source Entities must not use `providerEntityId` as md5 identity, must not use platform-native `filePath` as identity, and must not use `source_local:<kind>:<md5>` refs. Boundary validation should reject the old shape rather than silently migrating or normalizing it.

Because content hashes are neither Source identity nor Material identity, matching `contentMd5` values do not constrain material binding. Two Local Sources with the same `contentMd5` may bind to the same Material or to different Materials; duplicate detection belongs in a later suggestion/review surface, not in local-source registration.

If the bytes at an existing Local Source path change, local-source registration and localization must not silently update `contentMd5` in place. Content drift is deferred to an explicit future maintenance/reconciliation flow that detects the mismatch and decides how to report or repair it; this ADR does not implement that flow.
