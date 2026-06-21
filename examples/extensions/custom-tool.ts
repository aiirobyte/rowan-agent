/**
 * Example: Custom Tool Extension
 *
 * Registers an LLM-callable tool that the model can invoke.
 * Place in .rowan/extensions/ to activate.
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function customTool(api: ExtensionAPI) {
  api.registerTool({
    name: "read_changelog",
    description: "Read the project CHANGELOG.md and return its contents",
    parameters: {
      type: "object",
      properties: {
        maxLines: {
          type: "number",
          description: "Maximum lines to return (default: 50)",
        },
      },
    },
    execute: async (args) => {
      const { maxLines = 50 } = args as { maxLines?: number };
      try {
        const result = await api.context.exec("head", [
          "-n",
          String(maxLines),
          "CHANGELOG.md",
        ]);
        return {
          content: [{ type: "text", text: result.stdout }],
        };
      } catch {
        return {
          content: [{ type: "text", text: "CHANGELOG.md not found" }],
          isError: true,
        };
      }
    },
  });
}
