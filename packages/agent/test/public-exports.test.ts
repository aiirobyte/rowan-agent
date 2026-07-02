import { expect, test } from "bun:test";
import * as agentExports from "../src/index";

test("public value exports snapshot", () => {
  const exportNames = Object.keys(agentExports).sort();

  // Core API
  expect(exportNames).toContain("Agent");
  expect(typeof agentExports.Agent.loadSkills).toBe("function");
  expect(typeof agentExports.Agent.loadPhases).toBe("function");
  expect(typeof agentExports.Agent.loadExtensions).toBe("function");
  expect(exportNames).toContain("createMessage");
  expect(exportNames).toContain("createId");
  expect(exportNames).toContain("createTimestamp");

  // Session
  expect(exportNames).toContain("LocalJsonlSessionManager");
  expect(exportNames).toContain("createSession");
  expect(exportNames).toContain("appendUserTurn");

  // Tools / skills / env
  expect(exportNames).toContain("createCoreTools");
  expect(exportNames).toContain("resolveWorkspacePaths");
  expect(exportNames).toContain("resolveInWorkspace");

  // Prompt / context
  expect(exportNames).toContain("buildSystemPrompt");
  expect(exportNames).toContain("buildModelRequest");
  expect(exportNames).toContain("conversationMessages");
  expect(exportNames).toContain("latestUserInput");
  expect(exportNames).toContain("serializeSkills");

  // Extensions
  expect(exportNames).toContain("ExtensionRunner");
  expect(exportNames).toContain("HooksManager");
  expect(exportNames).toContain("createExtensionAPI");
  expect(exportNames).toContain("createExtensionRunner");

  // Snapshot total count (value exports only)
  expect(exportNames).toEqual(expect.arrayContaining([
    "Agent", "ExtensionRunner", "HooksManager",
    "LocalJsonlSessionManager",
    "appendUserTurn", "buildModelRequest", "buildSystemPrompt", "conversationMessages",
    "createCoreTools", "createExtensionAPI", "createExtensionRunner", "createId", "createMessage",
    "createSession", "createSourceInfo", "createTimestamp",
    "latestUserInput", "resolveInWorkspace",
    "resolveWorkspacePaths", "serializeSkills",
  ]));
});
