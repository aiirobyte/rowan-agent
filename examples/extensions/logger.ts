/**
 * Example: Logger Extension
 *
 * Minimal extension that logs lifecycle events.
 * Place in .rowan/extensions/ to activate.
 *
 * Discovery:
 *   - .rowan/extensions/logger.ts  (single file)
 *   - .rowan/extensions/my-ext/package.json → rowan.extensions field
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function logger(api: ExtensionAPI) {
  // ── Listen-only hooks ──────────────────────────────────────────────────
  api.on("agent_start", () => {
    console.log("[logger] agent started");
  });

  api.on("agent_end", () => {
    console.log("[logger] agent ended");
  });

  api.on("turn_start", () => {
    console.log("[logger] turn started");
  });

  api.on("turn_end", () => {
    console.log("[logger] turn ended");
  });

  // ── Modifiable hooks ───────────────────────────────────────────────────

  // Log tool calls and optionally block them
  api.on("before_tool_call", (event) => {
    console.log(`[logger] tool call: ${event.toolName}`);
    // return { allow: false, reason: "blocked by logger" } to deny
    return { allow: true };
  });

  // Inspect tool results
  api.on("after_tool_call", (event) => {
    console.log(`[logger] tool ${event.toolName} completed`);
    // return modified result to transform output
  });

}
