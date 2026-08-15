import type { LlmResponse } from "@rowan-agent/models";

export function routeResponse(
  decision: Array<{ phase: string; reason?: string; payload?: unknown }>,
  content = "done",
): LlmResponse {
  return {
    content,
    toolCalls: [{
      id: "route-test-call",
      name: "route",
      arguments: JSON.stringify({ decision }),
    }],
    stopReason: "tool_use",
  };
}

export function stopResponse(content = "done"): LlmResponse {
  return routeResponse([{ phase: "stop" }], content);
}
