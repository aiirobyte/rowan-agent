import { expect, test } from "bun:test";
import * as agentExports from "../src/index";
import * as runtimeExports from "../src/runtime";
import {
  authorValueExports,
  runtimeValueExports,
} from "../scripts/public-interface";

test("authoring public value exports snapshot", () => {
  const exportNames = Object.keys(agentExports).sort();

  expect(exportNames).toEqual([...authorValueExports].sort());
  expect(typeof agentExports.models).toBe("object");
  expect(typeof agentExports.RunInteractionBoundary).toBe("function");
  expect(typeof agentExports.RunInteractionCancelledError).toBe("function");
});

test("runtime public value exports snapshot", () => {
  const exportNames = Object.keys(runtimeExports).sort();

  expect(exportNames).toEqual([...runtimeValueExports].sort());
  expect(typeof runtimeExports.AgentRuntime.init).toBe("function");
  expect(typeof runtimeExports.createCoreTools).toBe("function");
  expect(typeof runtimeExports.loadSkills).toBe("function");
  expect(typeof runtimeExports.loadPhases).toBe("function");
  expect(typeof runtimeExports.loadExtensions).toBe("function");
  expect(typeof runtimeExports.parseFrontmatter).toBe("function");
});

test("models.X reachable from @rowan-agent/agent", () => {
  expect(agentExports.models).toBeDefined();
  expect(typeof agentExports.models.registerModel).toBe("function");
  expect(typeof agentExports.models.getModel).toBe("function");
});
