import type { Outcome } from "@rowan-agent/agent";

export function formatJsonOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatOutcomeOutput(outcome: Outcome): string {
  return formatJsonOutput(outcome);
}
