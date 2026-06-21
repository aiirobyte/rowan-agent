/**
 * Example: Phase Registration Extension
 *
 * Registers a custom phase programmatically (instead of via PHASE.md).
 * Useful for dynamic phases whose behavior depends on runtime state.
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function reviewPhase(api: ExtensionAPI) {
  // ── Register a phase with a run function ───────────────────────────────
  api.registerPhase({
    id: "quick-review",
    name: "Quick Review",
    description: "Fast code review focusing on obvious issues",
    tools: ["read_file", "list_files"],

    // run() takes over from the LLM — you control execution entirely
    async run(context, execution) {
      const payload = context.state.payload as { files?: string[] } | undefined;
      const files = payload?.files ?? [];

      if (files.length === 0) {
        return {
          message: "No files to review",
          route: "stop",
        };
      }

      // Return route: "continue" to loop, "stop" to end, or a phase id
      return {
        message: `Reviewed ${files.length} files`,
        route: "stop",
        payload: { reviewed: files.length },
      };
    },
  });

  // ── Hook into phase lifecycle ──────────────────────────────────────────
  api.on("before_phase", (event) => {
    if (event.phaseId === "quick-review") {
      console.log("[review-phase] starting quick review");
    }
    // return { skip: { route: "stop", message: "skipped" } } to skip
    // return { abort: { success: false, reason: "..." } } to abort
  });
}
