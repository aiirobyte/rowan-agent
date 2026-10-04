import type { JsonObject, JsonValue } from "../runtime-events";
import { assertJsonValue } from "../runtime/json";
import type { ExtensionHost, ScopeRef } from "./types";

export class InMemoryExtensionHost implements ExtensionHost {
  private readonly configs = new Map<string, Map<string, JsonObject>>();
  private readonly agentState = new Map<string, Map<string, Map<string, JsonValue>>>();
  private readonly listeners = new Set<(scope: ScopeRef) => void>();

  constructor(options: {
    configs?: Record<string, Record<string, JsonObject>>;
    agentState?: Record<string, Record<string, Record<string, JsonValue>>>;
  } = {}) {
    if (options.configs) {
      for (const [scopeKey, extMap] of Object.entries(options.configs)) {
        const map = new Map<string, JsonObject>();
        for (const [extId, cfg] of Object.entries(extMap)) {
          assertJsonValue(cfg);
          map.set(extId, structuredClone(cfg));
        }
        this.configs.set(scopeKey, map);
      }
    }
    if (options.agentState) {
      for (const [agentId, extMap] of Object.entries(options.agentState)) {
        const agentMap = new Map<string, Map<string, JsonValue>>();
        for (const [extId, stateMap] of Object.entries(extMap)) {
          const map = new Map<string, JsonValue>();
          for (const [key, val] of Object.entries(stateMap)) {
            assertJsonValue(val);
            map.set(key, structuredClone(val));
          }
          agentMap.set(extId, map);
        }
        this.agentState.set(agentId, agentMap);
      }
    }
  }

  setConfig(extensionId: string, config: JsonObject | null, scope: ScopeRef = { kind: "global" }): void {
    const scopeKey = scopeToKey(scope);
    if (!this.configs.has(scopeKey)) {
      this.configs.set(scopeKey, new Map());
    }
    const scopeConfigs = this.configs.get(scopeKey)!;
    if (config === null) {
      scopeConfigs.delete(extensionId);
    } else {
      assertJsonValue(config);
      scopeConfigs.set(extensionId, structuredClone(config));
    }
    this.notifyConfigChanged(scope);
  }

  getConfig(extensionId: string, scope: ScopeRef = { kind: "global" }): JsonObject | null {
    const globalConfig = this.configs.get("global")?.get(extensionId);
    let merged: Record<string, JsonValue> | null = globalConfig ? { ...globalConfig } : null;

    if (scope.kind === "team" || scope.kind === "project") {
      const teamConfig = this.configs.get(`team:${scope.teamId}`)?.get(extensionId);
      if (teamConfig) {
        merged = { ...(merged ?? {}), ...teamConfig };
      }
    }
    if (scope.kind === "project") {
      const projectConfig = this.configs.get(`project:${scope.teamId}:${scope.projectId}`)?.get(extensionId);
      if (projectConfig) {
        merged = { ...(merged ?? {}), ...projectConfig };
      }
    }
    return merged ? (structuredClone(merged) as JsonObject) : null;
  }

  onConfigChanged(listener: (scope: ScopeRef) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyConfigChanged(scope: ScopeRef = { kind: "global" }): void {
    for (const listener of this.listeners) {
      try {
        listener(scope);
      } catch {
        // Listener failure must not stop other notifications
      }
    }
  }

  getAgentState(extensionId: string, agentId: string, key: string): JsonValue | undefined {
    const val = this.agentState.get(agentId)?.get(extensionId)?.get(key);
    return val !== undefined ? structuredClone(val) : undefined;
  }

  setAgentState(extensionId: string, agentId: string, key: string, value: JsonValue): void {
    assertJsonValue(value);
    let agentMap = this.agentState.get(agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.agentState.set(agentId, agentMap);
    }
    let extMap = agentMap.get(extensionId);
    if (!extMap) {
      extMap = new Map();
      agentMap.set(extensionId, extMap);
    }
    extMap.set(key, structuredClone(value));
  }

  deleteAgentState(extensionId: string, agentId: string, key: string): void {
    this.agentState.get(agentId)?.get(extensionId)?.delete(key);
  }
}

export function scopeToKey(scope: ScopeRef): string {
  switch (scope.kind) {
    case "global":
      return "global";
    case "team":
      return `team:${scope.teamId}`;
    case "project":
      return `project:${scope.teamId}:${scope.projectId}`;
  }
}

export function resolveScopeFromMetadata(metadata?: Readonly<Record<string, unknown>>): ScopeRef {
  if (metadata) {
    const teamId = typeof metadata.teamId === "string" ? metadata.teamId : undefined;
    const projectId = typeof metadata.projectId === "string" ? metadata.projectId : undefined;
    if (teamId && projectId) {
      return { kind: "project", teamId, projectId };
    }
    if (teamId) {
      return { kind: "team", teamId };
    }
  }
  return { kind: "global" };
}
