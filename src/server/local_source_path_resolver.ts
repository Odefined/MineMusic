import * as path from "node:path";

// Resolve a MineMusic-normalized root-relative path (forward slashes, no leading
// slash, no ".."/".") under its absolute root. The normalizer guarantees no
// root escape, so splitting on "/" and joining with the OS-aware path.join is
// safe and cross-platform. The containment check below is defense-in-depth at
// the fs boundary: if a future change ever routes an un-normalized path here
// (e.g. "../etc/passwd"), path.resolve detects the lexical escape and throws
// loudly instead of reading outside the root. This is lexical: symlink policy is
// owned by the caller that enumerates or streams files.
export function resolveUnderRoot(rootDir: string, relativePath: string): string {
  const resolved = relativePath.length === 0
    ? rootDir
    : path.join(rootDir, ...relativePath.split("/"));
  const rootResolved = path.resolve(rootDir);
  const targetResolved = path.resolve(resolved);
  // Containment: the target must be the root itself or live under it. When the
  // configured root IS the filesystem root (path.sep), every absolute path is
  // genuinely under it, so the startsWith(rootResolved + sep) check is skipped.
  if (
    targetResolved !== rootResolved &&
    rootResolved !== path.sep &&
    !targetResolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Path '${relativePath}' resolves outside root '${rootDir}'.`);
  }
  return resolved;
}
