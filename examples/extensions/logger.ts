/**
 * Example: Logger Extension
 *
 * Minimal extension that logs Tool decisions.
 * Place in .rowan/extensions/ to activate.
 *
 * Discovery:
 *   - .rowan/extensions/logger.ts  (single file)
 *   - .rowan/extensions/my-ext/package.json → rowan.extensions field
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function logger(api: ExtensionAPI) {
  api.on("before_tool_call", (event) => {
    console.log(`[logger] tool call: ${event.tool.name}`);
    // return { allow: false, reason: "blocked by logger" } to deny
    return { allow: true };
  });

  // Inspect tool results
  api.on("after_tool_call", (event) => {
    console.log(`[logger] tool ${event.tool.name} completed`);
    // return modified result to transform output
  });

}
