import { createId, createTimestamp } from "../../utils";
import type { JsonValue } from "../../runtime-events";
import type { ExecutionState } from "../../loop/types";
import { assertJsonValue, canonicalJson } from "../../runtime/json";

export type RunInteractionKind = "user_input" | "permission" | "elicitation" | "confirmation";
export type RunInteractionStatus = "pending" | "answered" | "denied" | "cancelled" | "expired";

export type RunInteraction = Readonly<{
  id: string;
  phase: string;
  kind: RunInteractionKind;
  prompt: string;
  payload?: JsonValue;
  createdAt: string;
  status: RunInteractionStatus;
  toolCallId?: string;
}>;

export type RunInteractionRequest = Readonly<{
  id?: string;
  kind: RunInteractionKind;
  prompt: string;
  payload?: JsonValue;
  toolCallId?: string;
}>;

export type RunInteractionState = Readonly<{
  requests: readonly RunInteraction[];
  answers: Readonly<Record<string, JsonValue>>;
  checkpoint?: JsonValue;
}>;

export type RunInteractionDriver = Readonly<{
  signal: AbortSignal;
  request(input: RunInteractionRequest): RunInteraction;
  pending(): readonly RunInteraction[];
  answers(): ReadonlyMap<string, JsonValue>;
  checkpoint(): JsonValue | undefined;
  clearCheckpoint(): void;
  suspend(input?: Readonly<{ checkpoint?: JsonValue }>): never;
}>;

export class RunInteractionCancelledError extends Error {
  readonly code = "run_interaction_cancelled" as const;

  constructor() {
    super("Run interaction work was cancelled.");
    this.name = "RunInteractionCancelledError";
  }
}

export class RunInteractionBoundary extends Error {
  constructor(
    readonly state: ExecutionState,
    readonly interactions: readonly RunInteraction[],
  ) {
    super("Run interactions require host input.");
    this.name = "RunInteractionBoundary";
  }
}

export function createRunInteractionDriver(
  state: ExecutionState,
  phase: string,
  signal?: AbortSignal,
): RunInteractionDriver {
  const stored = state.runInteractions ?? (state as any).phaseInteractions;
  const requests = new Map<string, RunInteraction>(
    stored?.requests.map((request: RunInteraction) => [request.id, { ...request }]) ?? [],
  );
  const answers = new Map<string, JsonValue>(Object.entries(stored?.answers ?? {}));
  const usedRequestIds = new Set<string>();
  let checkpoint = stored?.checkpoint;

  const snapshot = (): RunInteractionState => ({
    requests: [...requests.values()].map((request) => ({
      ...request,
      status: answers.has(request.id) ? "answered" : request.status,
    })),
    answers: Object.fromEntries(answers),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  });

  const sync = (): void => {
    state.runInteractions = snapshot();
  };

  const assertActive = (): void => {
    if (signal?.aborted) throw new RunInteractionCancelledError();
  };

  // Re-entry after a resume asks again with the same metadata; only a request
  // still open (pending or answered) and, for tool calls, from the same call
  // is that one. A cancelled or expired request, or another call's approval,
  // never stands in for a new ask.
  const matchingStoredRequest = (input: Readonly<{
    kind: RunInteractionKind;
    prompt: string;
    payload?: JsonValue;
    toolCallId?: string;
  }>): RunInteraction | undefined => {
    const fingerprint = interactionFingerprint(input);
    return [...requests.values()].find((request) =>
      !usedRequestIds.has(request.id)
      && (answers.has(request.id) || request.status === "pending")
      && request.toolCallId === input.toolCallId
      && interactionFingerprint(request) === fingerprint);
  };

  return {
    signal: signal ?? new AbortController().signal,
    request(input): RunInteraction {
      assertActive();
      if (input.id !== undefined && input.id.trim().length === 0) {
        throw new TypeError("Run interaction id must be non-empty.");
      }
      if (input.prompt.trim().length === 0) {
        throw new TypeError("Run interaction prompt must be non-empty.");
      }
      if (!(RUN_INTERACTION_KINDS as readonly string[]).includes(input.kind)) {
        throw new TypeError(`Unsupported Run interaction kind: ${String(input.kind)}.`);
      }
      if (input.payload !== undefined) assertJsonValue(input.payload, "Run interaction payload");
      const matched = input.id === undefined ? matchingStoredRequest(input) : undefined;
      const id = input.id ?? matched?.id ?? createId("interaction");
      const existing = requests.get(id);
      if (existing) {
        if (interactionFingerprint(existing) !== interactionFingerprint(input)) {
          throw new Error(`Run interaction ${id} was requested with different metadata.`);
        }
        usedRequestIds.add(id);
        return {
          ...existing,
          status: answers.has(id) ? "answered" : existing.status,
        };
      }
      const request: RunInteraction = {
        id,
        phase,
        kind: input.kind,
        prompt: input.prompt,
        ...(input.payload === undefined ? {} : { payload: input.payload }),
        ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
        createdAt: createTimestamp(),
        status: "pending",
      };
      requests.set(id, request);
      usedRequestIds.add(id);
      sync();
      return request;
    },

    pending(): readonly RunInteraction[] {
      return [...requests.values()]
        .filter((request) => request.status === "pending" && !answers.has(request.id))
        .map((request) => ({ ...request, status: "pending" as const }));
    },

    answers(): ReadonlyMap<string, JsonValue> {
      return new Map(answers);
    },

    checkpoint(): JsonValue | undefined {
      return checkpoint;
    },

    clearCheckpoint(): void {
      checkpoint = undefined;
      sync();
    },

    suspend(input = {}): never {
      assertActive();
      const pending = this.pending();
      if (pending.length === 0) throw new Error("Cannot suspend without pending Run interactions.");
      if (input.checkpoint !== undefined) checkpoint = input.checkpoint;
      state.status = "suspended";
      sync();
      throw new RunInteractionBoundary(state, pending);
    },
  };
}

const RUN_INTERACTION_KINDS: readonly RunInteractionKind[] = [
  "user_input",
  "permission",
  "elicitation",
  "confirmation",
];

function interactionFingerprint(value: Readonly<{
  kind: RunInteractionKind;
  prompt: string;
  payload?: JsonValue;
}>): string {
  return canonicalJson({
    kind: value.kind,
    prompt: value.prompt,
    payload: value.payload ?? null,
  });
}
