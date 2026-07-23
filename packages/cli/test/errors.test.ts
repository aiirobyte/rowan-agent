import { expect, test } from "bun:test";
import { RuntimeError } from "../../agent/src";
import { formatCliError } from "../src/errors";

test("formatCliError gives an actionable incompatible database recovery", () => {
  const error = new RuntimeError("unsupported_store_version", { found: "rowan.agent.runtime:1", supported: "rowan.agent.runtime:2" });
  expect(formatCliError(error)).toContain("Move .rowan/runtime.sqlite aside or start with a new workspace");
  expect(formatCliError(error)).toContain("existing file was not modified");
});

test("formatCliError explains an active Runtime owner", () => {
  const error = new RuntimeError("runtime_already_owned", { expiresAt: "2026-07-24T00:00:00.000Z", retryAfterMs: 250 });
  expect(formatCliError(error)).toContain("Retry in about 250 ms");
});
