import { createId, createTimestamp } from "../../utils";
import type { JsonValue } from "../../runtime-events";
import type { ExecutionState } from "../../loop/types";
import { assertJsonValue, canonicalJson } from "../../runtime/json";

export type PhaseInteractionKind = "user_input" | "permission" | "elicitation" | "confirmation";
export type PhaseInteractionStatus = "pending" | "answered" | "denied" | "cancelled" | "expired";

export type PhaseInteraction = Readonly<{
  id: string;
  phase: string;
  kind: PhaseInteractionKind;
  prompt: string;
  payload?: JsonValue;
  createdAt: string;
  status: PhaseInteractionStatus;
}>;

export type PhaseInteractionState = Readonly<{
  requests: readonly PhaseInteraction[];
  answers: Readonly<Record<string, JsonValue>>;
  checkpoint?: JsonValue;
}>;

export type PhaseInteractionDriver = Readonly<{
  signal: AbortSignal;
  request(input: Readonly<{
    id?: string;
    kind: PhaseInteractionKind;
    prompt: string;
    payload?: JsonValue;
  }>): PhaseInteraction;
  pending(): readonly PhaseInteraction[];
  answers(): ReadonlyMap<string, JsonValue>;
  suspend(input?: Readonly<{ checkpoint?: JsonValue }>): never;
}>;

export class PhaseInteractionCancelledError extends Error {
  readonly code = "phase_interaction_cancelled" as const;

  constructor() {
    super("Phase interaction work was cancelled.");
    this.name = "PhaseInteractionCancelledError";
  }
}

export class PhaseInteractionBoundary extends Error {
  constructor(
    readonly state: ExecutionState,
    readonly interactions: readonly PhaseInteraction[],
  ) {
    super("Phase interactions require host input.");
    this.name = "PhaseInteractionBoundary";
  }
}

export function createPhaseInteractionDriver(
  state: ExecutionState,
  phase: string,
  signal?: AbortSignal,
): PhaseInteractionDriver {
  const stored = state.phaseInteractions;
  const requests = new Map<string, PhaseInteraction>(
    stored?.requests.map((request) => [request.id, { ...request }]) ?? [],
  );
  const answers = new Map<string, JsonValue>(Object.entries(stored?.answers ?? {}));
  const usedRequestIds = new Set<string>();
  let checkpoint = stored?.checkpoint;

  const snapshot = (): PhaseInteractionState => ({
    requests: [...requests.values()].map((request) => ({
      ...request,
      status: answers.has(request.id) ? "answered" : request.status,
    })),
    answers: Object.fromEntries(answers),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  });

  const sync = (): void => {
    state.phaseInteractions = snapshot();
  };

  const assertActive = (): void => {
    if (signal?.aborted) throw new PhaseInteractionCancelledError();
  };

  const matchingStoredRequest = (input: Readonly<{
    kind: PhaseInteractionKind;
    prompt: string;
    payload?: JsonValue;
  }>): PhaseInteraction | undefined => {
    const fingerprint = interactionFingerprint(input);
    return [...requests.values()].find((request) =>
      !usedRequestIds.has(request.id)
      && interactionFingerprint(request) === fingerprint);
  };

  return {
    signal: signal ?? new AbortController().signal,
    request(input): PhaseInteraction {
      assertActive();
      if (input.id !== undefined && input.id.trim().length === 0) {
        throw new TypeError("Phase interaction id must be non-empty.");
      }
      if (input.prompt.trim().length === 0) {
        throw new TypeError("Phase interaction prompt must be non-empty.");
      }
      if (!(PHASE_INTERACTION_KINDS as readonly string[]).includes(input.kind)) {
        throw new TypeError(`Unsupported Phase interaction kind: ${String(input.kind)}.`);
      }
      if (input.payload !== undefined) assertJsonValue(input.payload, "Phase interaction payload");
      const matched = input.id === undefined ? matchingStoredRequest(input) : undefined;
      const id = input.id ?? matched?.id ?? createId("interaction");
      const existing = requests.get(id);
      if (existing) {
        if (interactionFingerprint(existing) !== interactionFingerprint(input)) {
          throw new Error(`Phase interaction ${id} was requested with different metadata.`);
        }
        usedRequestIds.add(id);
        return {
          ...existing,
          status: answers.has(id) ? "answered" : existing.status,
        };
      }
      const request: PhaseInteraction = {
        id,
        phase,
        kind: input.kind,
        prompt: input.prompt,
        ...(input.payload === undefined ? {} : { payload: input.payload }),
        createdAt: createTimestamp(),
        status: "pending",
      };
      requests.set(id, request);
      usedRequestIds.add(id);
      sync();
      return request;
    },

    pending(): readonly PhaseInteraction[] {
      return [...requests.values()]
        .filter((request) => request.status === "pending" && !answers.has(request.id))
        .map((request) => ({ ...request, status: "pending" as const }));
    },

    answers(): ReadonlyMap<string, JsonValue> {
      return new Map(answers);
    },

    suspend(input = {}): never {
      assertActive();
      const pending = this.pending();
      if (pending.length === 0) throw new Error("Cannot suspend without pending Phase interactions.");
      if (input.checkpoint !== undefined) checkpoint = input.checkpoint;
      state.status = "suspended";
      sync();
      throw new PhaseInteractionBoundary(state, pending);
    },
  };
}

const PHASE_INTERACTION_KINDS: readonly PhaseInteractionKind[] = [
  "user_input",
  "permission",
  "elicitation",
  "confirmation",
];

function interactionFingerprint(value: Readonly<{
  kind: PhaseInteractionKind;
  prompt: string;
  payload?: JsonValue;
}>): string {
  return canonicalJson({
    kind: value.kind,
    prompt: value.prompt,
    payload: value.payload ?? null,
  });
}
