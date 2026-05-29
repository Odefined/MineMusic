export function normalizeHandbookPaths({
  handbookPath,
  handbookPaths = [],
}: {
  handbookPath?: string;
  handbookPaths?: string[];
}): string[] {
  return [...new Set([
    ...(handbookPath === undefined ? [] : [handbookPath]),
    ...handbookPaths,
  ].map((path) => path.trim()).filter((path) => path.length > 0))];
}
