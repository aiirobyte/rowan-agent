import { expect, test } from "bun:test";
import { TransientRunEventSubscription } from "../../src/runtime/transient-run-events";

test("consecutive tool_call_delta events of one call keep only the latest", () => {
  const subscription = new TransientRunEventSubscription();
  const delta = (providerToolCallId: string, args: string) => ({
    kind: "tool_call_delta", durability: "transient", runId: "run", executionId: "exec", messageId: "msg",
    providerToolCallId, toolName: "edit", arguments: args, args: undefined,
  }) as never;
  subscription.push(delta("a", "{"));
  subscription.push(delta("a", "{\"p"));
  subscription.push(delta("b", "{"));
  expect(subscription.shift()).toMatchObject({ providerToolCallId: "a", arguments: "{\"p" });
  expect(subscription.shift()).toMatchObject({ providerToolCallId: "b" });
  expect(subscription.shift()).toBeUndefined();
});

test("model_retry events are queued and preserved in sequence", () => {
  const subscription = new TransientRunEventSubscription();
  const retry = (attempt: number) => ({
    kind: "model_retry" as const,
    durability: "transient" as const,
    runId: "run" as never,
    executionId: "exec" as never,
    attempt,
    maxRetries: 10,
    delayMs: 5000,
    error: "rate limit",
  });
  subscription.push(retry(1));
  subscription.push(retry(2));
  expect(subscription.shift()).toMatchObject({ kind: "model_retry", attempt: 1, maxRetries: 10 });
  expect(subscription.shift()).toMatchObject({ kind: "model_retry", attempt: 2, maxRetries: 10 });
  expect(subscription.shift()).toBeUndefined();
});
