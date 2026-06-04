/**
 * Source info — tracks where an extension registration came from.
 */

export interface SourceInfo {
  /** Source type: "local" for filesystem, "builtin" for built-in, etc. */
  source: string;
  /** Base directory for resolving relative paths. */
  baseDir?: string;
  /** Display name for error messages. */
  displayName?: string;
}

export function createSourceInfo(
  extensionPath: string,
  options: { source?: string; baseDir?: string } = {},
): SourceInfo {
  const source = options.source ?? (extensionPath.startsWith("<") ? "synthetic" : "local");
  const displayName = extensionPath.startsWith("<")
    ? extensionPath.slice(1, -1)
    : extensionPath.split("/").pop() ?? extensionPath;

  return {
    source,
    baseDir: options.baseDir,
    displayName,
  };
}
