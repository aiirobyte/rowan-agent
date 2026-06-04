import type { ExtensionAPI } from "../../../../extensions";

export default function(api: ExtensionAPI) {
  api.registerPhase({
    ...api.manifest?.phase,
    id: "execute",

    prompt: {
      instructions: [
        "Phase: execute",
        "",
        "Execute the task by calling the appropriate tools.",
        "If more tool calls are needed, continue calling tools.",
        "If execution is complete, respond with a brief summary and call the 'route' tool.",
      ],
    },

    async run(context, input) {
      context.incrementAttempt();

      const maxAttempts = context.maxAttempts ?? 2;

      let collected;
      try {
        collected = await context.turn(() => context.model.invoke({ input }));
      } catch (error) {
        // Model errors - check if we should retry
        if (context.state.attempt < maxAttempts) {
          return {
            message: "Execution error, retrying.",
            route: "execute",
          };
        }
        return {
          message: "Execution error, no retries remaining.",
          route: "stop",
        };
      }

      // Check if collection was stopped due to abort
      if (collected.stopReason === "aborted") {
        return { message: collected.text, route: "stop", toolCalls: collected.toolCalls };
      }

      // Execute non-route tool calls and store results (execution-scoped)
      const nonRouteToolCalls = collected.toolCalls.filter(t => t.name !== "route");
      if (nonRouteToolCalls.length > 0) {
        // Store assistant message with tool calls (execution-scoped, not streamed to CLI)
        const assistantMsgId = context.messages.start("assistant", collected.text || "", {
          kind: "model_message",
          phase: "execute",
          scope: "execution",
          toolCalls: nonRouteToolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
        });
        await context.messages.end(assistantMsgId);

        for (const toolCall of nonRouteToolCalls) {
          await context.toolExecution.start(toolCall.id, toolCall.name, toolCall.args);

          const result = await context.tools.execute({ toolCall });

          await context.toolExecution.end(result.toolCallId, result.toolName, result, !result.ok);

          const toolResultContent = JSON.stringify({
            toolName: result.toolName,
            ok: result.ok,
            content: result.content,
            ...(result.error ? { error: result.error } : {}),
          });
          const toolMsgId = context.messages.start("tool", toolResultContent, {
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            scope: "execution",
            isError: !result.ok,
          });
          await context.messages.end(toolMsgId);
        }

        // Tools were executed, continue in execute phase
        return { message: collected.text ?? "", route: "continue", toolCalls: collected.toolCalls };
      }

      // No tools called - execution complete, return toolCalls for framework route extraction
      return { message: collected.text ?? "", route: "chat", toolCalls: collected.toolCalls };
    },
  });
}
