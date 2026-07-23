import { expect, test } from "bun:test";
import * as agentExports from "../src/index";
import { publicValueExports } from "../scripts/public-interface";

test("public value exports snapshot", () => {
  const exportNames = Object.keys(agentExports).sort();

  expect(exportNames).toEqual([...publicValueExports].sort());
  expect(typeof agentExports.AgentRuntime.init).toBe("function");
  expect(typeof agentExports.loadSkills).toBe("function");
  expect(typeof agentExports.loadPhases).toBe("function");
  expect(typeof agentExports.loadExtensions).toBe("function");
});
