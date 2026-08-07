/**
 * Example: Phase Registration Extension
 *
 * Registers a Phase directory Bundle with its PHASE.md and executable code.
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default async function reviewPhase(api: ExtensionAPI) {
  // The path is resolved relative to this extension file's directory.
  await api.registerPhase("./quick-review");

  // ── Hook into phase lifecycle ──────────────────────────────────────────
  api.on("before_phase", (event) => {
    if (event.phaseId === "quick-review") {
      console.log("[review-phase] starting quick review");
    }
    // return { skip: { route: "stop", message: "skipped" } } to skip
    // return { abort: { success: false, reason: "..." } } to abort
  });
}
