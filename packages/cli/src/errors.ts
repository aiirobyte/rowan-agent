import { isRuntimeError } from "../../agent/src";

export function formatCliError(error: unknown, databasePath = ".rowan/runtime.sqlite"): string {
  if (isRuntimeError(error)) {
    if (error.code === "unsupported_store_version") {
      return `Rowan runtime database is incompatible (found ${JSON.stringify(error.details.found)}, supported ${JSON.stringify(error.details.supported)}). Move ${databasePath} aside or start with a new workspace; the existing file was not modified.`;
    }
    if (error.code === "runtime_already_owned") {
      return `Rowan runtime database is currently owned by another process. Retry in about ${error.details.retryAfterMs} ms or stop the active Rowan process.`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
