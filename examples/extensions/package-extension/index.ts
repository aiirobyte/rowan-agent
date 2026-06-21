/**
 * Example: Package-based Extension
 *
 * Discovered via package.json "rowan" manifest field.
 * Can bundle multiple extensions in a single directory.
 *
 * The manifest's phase field auto-registers a phase when
 * the extension is loaded — no explicit registerPhase() needed.
 */
import type { ExtensionAPI } from "@rowan-agent/agent";

export default function databaseExtension(api: ExtensionAPI) {
  api.registerTool({
    name: "query_db",
    description: "Execute a read-only SQL query against the project database",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL SELECT query to execute",
        },
      },
      required: ["sql"],
    },
    execute: async (args) => {
      const { sql } = args as { sql: string };

      // Safety: only allow SELECT
      if (!/^\s*select/i.test(sql)) {
        return {
          content: [{ type: "text", text: "Only SELECT queries are allowed" }],
          isError: true,
        };
      }

      try {
        const result = await api.context.exec("sqlite3", [
          "-json",
          "data.db",
          sql,
        ]);
        return {
          content: [{ type: "text", text: result.stdout }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Query failed: ${err}` }],
          isError: true,
        };
      }
    },
  });
}
