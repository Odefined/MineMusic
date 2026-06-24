# ADR-0043: Trusted Local Scan Deletes Disappeared Sources Without Material Cascade

## Status

Accepted; grilled 2026-06-25.

A Local Source discovered through a Scan Root is current filesystem-backed
truth, not a permanent absence tombstone. When and only when a Trusted Complete
Scan proves that its root-relative path has disappeared, Music Data Platform
atomically deletes the Scan Root membership, source-material binding, and Local
Source record. It does not cascade into the Material, owner relations,
Collection membership, or other Sources. Partial, cancelled, failed,
root-unavailable, or directory-incomplete scans cannot authorize this deletion.

MineMusic deliberately keeps no path-to-former-Material restore tombstone. If
the same path later reappears, its deterministic Local Source ref is recreated
from current file facts and, because the former binding no longer exists, it
receives a new Material; old owner facts are not transferred. Orphan Material
cleanup remains a separate explicit maintenance concern. This accepts orphaned
identity history in exchange for keeping scan reconciliation narrow, avoiding
implicit resurrection, and preventing file disappearance from deleting shared
music or user-owned facts.
