import type { StreamFn } from "@rowan-agent/models";
import type { AgentDefinition } from "../../src/harness/definitions";
import type { Phase } from "../../src/harness/phases/types";
import type { ResourceView } from "../../src/runtime/resource-registry";
import type { AgentConfiguration } from "../../src/runtime/configuration-snapshot";
import type { AgentRuntime, LoadInput } from "../../src/runtime";

/** A view that reads no source. */
export const EMPTY_VIEW: ResourceView = { agents: [], tools: [], skills: [], phases: [] };

/** The source a test's own resources are registered under. */
export const TEST_SOURCE = "test.source";

/**
 * The source the Runtime registers its core Tool and Phases under. A view that
 * needs the route Tool or the core Phases must list it.
 */
export const CORE_SOURCE = "rowan.core";

type Loaded<T extends (input: never) => unknown> =
  NonNullable<Parameters<T>[0]["values"]>[number];
type SeededResources = Readonly<{
  agents?: readonly AgentDefinition[];
  skills?: readonly Loaded<AgentRuntime["loadSkills"]>[];
  phases?: readonly Phase[];
  tools?: readonly Loaded<AgentRuntime["loadTools"]>[];
}>;

/**
 * Register a test's resources on the Runtime — the way a Host registers them —
 * and return the view that reads exactly those sources.
 *
 * @example
 * const runtime = await AgentRuntime.init({ store: new InMemoryStore(), concurrency: 1 });
 * const view = await seedResources(runtime, { agents: [definition], phases: [phase] });
 * await runtime.createAgent(configuration({ stream, view, definition: definition.name }));
 */
export async function seedResources(
  runtime: AgentRuntime,
  input: SeededResources & Readonly<{ core?: boolean }> = {},
): Promise<ResourceView> {
  const seeded: Array<keyof SeededResources> = [];
  if (input.agents?.length) {
    await runtime.loadAgents({ sourceId: TEST_SOURCE, values: input.agents } satisfies LoadInput<AgentDefinition>);
    seeded.push("agents");
  }
  if (input.skills?.length) {
    await runtime.loadSkills({ sourceId: TEST_SOURCE, values: input.skills });
    seeded.push("skills");
  }
  if (input.phases?.length) {
    await runtime.loadPhases({ sourceId: TEST_SOURCE, values: input.phases } satisfies LoadInput<Phase>);
    seeded.push("phases");
  }
  if (input.tools?.length) {
    await runtime.loadTools({ sourceId: TEST_SOURCE, values: input.tools });
    seeded.push("tools");
  }
  // A view may only name sources that exist for a kind. The Runtime's own
  // assembly supplies the core Tools; the core source is listed for its Phases.
  const ids = (kind: keyof SeededResources): readonly string[] => {
    const fromCore = input.core && kind === "phases" ? [CORE_SOURCE] : [];
    return seeded.includes(kind) ? [...fromCore, TEST_SOURCE] : fromCore;
  };
  return { agents: ids("agents"), tools: ids("tools"), skills: ids("skills"), phases: ids("phases") };
}

type ConfigurationInput = Readonly<{
  identity: string;
  /** The Definition name the view resolves; its source must be in the view. */
  definition: string;
  view: ResourceView;
  model: NonNullable<AgentConfiguration["model"]>;
  stream?: StreamFn;
  cwd?: string;
  maxAttempts?: number;
  contexts?: AgentConfiguration["contexts"];
  additionalContexts?: AgentConfiguration["additionalContexts"];
}>;

/** Build the configuration request shape the public Runtime seam takes. */
export function configuration(input: ConfigurationInput): AgentConfiguration {
  const { identity, definition, view, ...rest } = input;
  return {
    identity,
    definition: { name: definition },
    resourceView: view,
    ...rest,
  } as AgentConfiguration;
}

/** The Definition a test Agent runs as, unless it says otherwise. */
export function testDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "test",
    description: "Test Agent.",
    prompt: "Test",
    ...overrides,
  };
}

/** Create one Agent from resources registered the Host way. */
export async function createAgentWith(
  runtime: AgentRuntime,
  input: Readonly<{
    identity: string;
    stream: StreamFn;
    definition?: Partial<AgentDefinition>;
    skills?: readonly Loaded<AgentRuntime["loadSkills"]>[];
    phases?: readonly Phase[];
    tools?: readonly Loaded<AgentRuntime["loadTools"]>[];
    /** List the Runtime's core Tool and Phase source in the view. */
    core?: boolean;
    maxAttempts?: number;
    contexts?: AgentConfiguration["contexts"];
    options?: Readonly<{ idempotencyKey?: string }>;
  }>,
): ReturnType<AgentRuntime["createAgent"]> {
  const definition = testDefinition(input.definition);
  const view = await seedResources(runtime, {
    agents: [definition],
    core: input.core === true,
    ...(input.skills ? { skills: input.skills } : {}),
    ...(input.phases ? { phases: input.phases } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
  });
  return runtime.createAgent(configuration({
    identity: input.identity,
    definition: definition.name,
    view,
    model: { provider: "test", id: "model" },
    stream: input.stream,
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.contexts === undefined ? {} : { contexts: input.contexts }),
  }), input.options ?? {});
}

/**
 * Create one Agent whose Definition selects the given Phases as its entry, with
 * the core resources in the view.
 */
export function createPhaseAgent(
  runtime: AgentRuntime,
  input: Readonly<{
    identity: string;
    stream: StreamFn;
    phases: Readonly<{ phases: Map<string, Phase>; entryPhaseId: string | null }>;
    maxAttempts?: number;
    options?: Readonly<{ idempotencyKey?: string }>;
  }>,
): ReturnType<AgentRuntime["createAgent"]> {
  const values = [...input.phases.phases.values()];
  return createAgentWith(runtime, {
    identity: input.identity,
    stream: input.stream,
    phases: values,
    core: true,
    definition: { phases: { entryPhaseId: input.phases.entryPhaseId, phaseIds: values.map(({ name }) => name) } },
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.options === undefined ? {} : { options: input.options }),
  });
}
