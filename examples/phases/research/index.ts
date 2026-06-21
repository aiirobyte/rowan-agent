/**
 * Example: Phase with factory pattern
 *
 * The factory runs when the phase is loaded. Use it to register hooks,
 * tools, or modify behavior before the phase executes.
 *
 * The PHASE.md in this directory defines the phase metadata and system prompt.
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default async function(api: ExtensionAPI) {
  api.on("before_phase", () => {
    console.log("[research] phase starting");
  });

  api.on("after_phase", () => {
    console.log("[research] phase completed");
  });
}
