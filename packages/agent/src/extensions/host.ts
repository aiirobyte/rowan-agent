import type { JsonObject, JsonValue } from "../runtime-events";
import { assertJsonValue } from "../runtime/json";
import type { ExtensionHost, ScopeRef } from "./types";

export class InMemoryExtensionHost implements ExtensionHost {
  private readonly configs = new Map<string, Map<string, JsonObject>>();
  private readonly agentState = new Map<string, Map<string, Map<string, JsonValue>>>();
  private readonly globalState = new Map<string, Map<string, JsonValue>>();
  private readonly listeners = new Set<(extensionId: string, scope: ScopeRef) => void>();

  constructor(options: {
    configs?: Record<string, Record<string, JsonObject>>;
    agentState?: Record<string, Record<string, Record<string, JsonValue>>>;
    globalState?: Record<string, Record<string, JsonValue>>;
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
    if (options.globalState) {
      for (const [extId, stateMap] of Object.entries(options.globalState)) {
        const map = new Map<string, JsonValue>();
        for (const [key, val] of Object.entries(stateMap)) {
          assertJsonValue(val);
          map.set(key, structuredClone(val));
        }
        this.globalState.set(extId, map);
      }
    }
  }

  setConfig(extensionId: string, config: JsonObject | null, scope: ScopeRef = []): void {
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
    this.notifyConfigChanged(extensionId, scope);
  }

  getConfig(extensionId: string, scope: ScopeRef = []): JsonObject | null {
    let merged: Record<string, JsonValue> | null = null;
    const globalConfig = this.configs.get("global")?.get(extensionId);
    if (globalConfig) {
      merged = { ...globalConfig };
    }
    for (let i = 1; i <= scope.length; i++) {
      const subScope = scope.slice(0, i);
      const key = scopeToKey(subScope);
      const layerConfig = this.configs.get(key)?.get(extensionId);
      if (layerConfig) {
        merged = { ...(merged ?? {}), ...layerConfig };
      }
    }
    return merged ? (structuredClone(merged) as JsonObject) : null;
  }

  onConfigChanged(listener: (extensionId: string, scope: ScopeRef) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyConfigChanged(extensionId: string, scope: ScopeRef = []): void {
    for (const listener of this.listeners) {
      try {
        listener(extensionId, scope);
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

  getGlobalState(extensionId: string, key: string): JsonValue | undefined {
    const val = this.globalState.get(extensionId)?.get(key);
    return val !== undefined ? structuredClone(val) : undefined;
  }

  setGlobalState(extensionId: string, key: string, value: JsonValue): void {
    assertJsonValue(value);
    let extMap = this.globalState.get(extensionId);
    if (!extMap) {
      extMap = new Map();
      this.globalState.set(extensionId, extMap);
    }
    extMap.set(key, structuredClone(value));
  }

  deleteGlobalState(extensionId: string, key: string): void {
    this.globalState.get(extensionId)?.delete(key);
  }
}

export function scopeToKey(scope: ScopeRef): string {
  if (scope.length === 0) return "global";
  return scope.map((layer) => `${layer.kind}:${layer.id}`).join("/");
}
