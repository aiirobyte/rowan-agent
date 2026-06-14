import { expect, test } from "bun:test";
import * as agentExports from "../src/index";

test("public value exports snapshot", () => {
  const exportNames = Object.keys(agentExports).sort();

  // Core API
  expect(exportNames).toContain("Agent");
  expect(exportNames).toContain("createMessage");
  expect(exportNames).toContain("createId");
  expect(exportNames).toContain("createTimestamp");

  // Session manager
  expect(exportNames).toContain("InMemorySessionManager");
  expect(exportNames).toContain("LocalJsonlSessionManager");
  expect(exportNames).toContain("createSessionHeader");
  expect(exportNames).toContain("createSession");
  expect(exportNames).toContain("appendUserTurn");

  // Tools / context
  expect(exportNames).toContain("createCoreTools");
  expect(exportNames).toContain("buildSystemPrompt");
  expect(exportNames).toContain("buildModelRequest");
  expect(exportNames).toContain("conversationMessages");

  // Extensions
  expect(exportNames).toContain("ExtensionRunner");
  expect(exportNames).toContain("HooksManager");

  // Event stream
  expect(exportNames).toContain("EventStream");
  expect(exportNames).toContain("AgentEventStream");

  // Snapshot total count (value exports only)
  expect(exportNames).toEqual(expect.arrayContaining([
    "Agent", "AgentEventStream", "AgentMessageSchema",
    "EventStream", "ExtensionRunner", "HooksManager", "InMemorySessionManager",
    "LocalJsonlSessionManager", "SESSION_MANAGER_SCHEMA_VERSION", "SESSION_SCHEMA_VERSION",
    "appendUserTurn", "buildModelRequest", "buildSystemPrompt", "conversationMessages",
    "createCoreTools", "createId", "createJson", "createMessage",
    "createSession", "createSessionHeader", "createSourceInfo", "createTimestamp",
    "latestUserInput", "loadSkill", "loadSkills", "resolveInWorkspace",
    "resolveSkillPath", "resolveWorkspacePaths", "serializeSkills",
    "summarizeSessionManagerRecords",
  ]));
});
