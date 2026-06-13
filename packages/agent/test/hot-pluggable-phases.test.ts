import { expect, test, describe } from "bun:test";
import { parseFrontmatter, isExplicitPath, inferResourceName, resolveResourcePath } from "../src/harness/loader";
import { createExtensionAPI } from "../src/harness/phases/extension-api-impl";
import type { Phase, PhaseFrontmatter } from "../src/harness/phases/types";
import type { ExtensionAPI, ChatParams, ChatResult } from "../src/harness/phases/extension-api";

// ============================================================================
// Loader Tests
// ============================================================================

describe("parseFrontmatter", () => {
  test("parses basic key-value pairs", () => {
    const raw = `---
id: review
name: Code Review
description: Review code changes
---

Body content here.`;

    const result = parseFrontmatter<PhaseFrontmatter>(raw);
    expect(result.frontmatter.id).toBe("review");
    expect(result.frontmatter.name).toBe("Code Review");
    expect(result.frontmatter.description).toBe("Review code changes");
    expect(result.body).toContain("Body content here.");
  });

  test("parses arrays in bracket notation", () => {
    const raw = `---
id: test
tools: [read, grep, glob]
skills: [code-review, security]
---

Content`;

    const result = parseFrontmatter<PhaseFrontmatter>(raw);
    expect(result.frontmatter.tools).toEqual(["read", "grep", "glob"]);
    expect(result.frontmatter.skills).toEqual(["code-review", "security"]);
  });

  test("parses boolean values", () => {
    const raw = `---
id: entry-phase
entry: true
---

Content`;

    const result = parseFrontmatter<PhaseFrontmatter>(raw);
    expect(result.frontmatter.entry).toBe(true);
  });

  test("handles missing frontmatter", () => {
    const raw = "No frontmatter here.";
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(raw);
  });
});

describe("isExplicitPath", () => {
  test("returns false for simple names", () => {
    expect(isExplicitPath("review")).toBe(false);
    expect(isExplicitPath("my-phase")).toBe(false);
  });

  test("returns true for paths with separators", () => {
    expect(isExplicitPath("./phases/review")).toBe(true);
    expect(isExplicitPath("../other/phase")).toBe(true);
  });

  test("returns true for paths with extensions", () => {
    expect(isExplicitPath("phase.md")).toBe(true);
    expect(isExplicitPath("custom-phase.ts")).toBe(true);
  });
});

describe("inferResourceName", () => {
  test("infers name from marker file", () => {
    expect(inferResourceName("/path/to/review/PHASE.md", "PHASE.md")).toBe("review");
    expect(inferResourceName("/path/to/my-skill/SKILL.md", "SKILL.md")).toBe("my-skill");
  });

  test("infers name from regular file", () => {
    expect(inferResourceName("/path/to/custom-phase.md", "PHASE.md")).toBe("custom-phase");
    expect(inferResourceName("/path/to/config.json", "PHASE.md")).toBe("config");
  });
});

// ============================================================================
// ExtensionAPI Tests
// ============================================================================

describe("ExtensionAPI", () => {
  function createTestPhase(): Phase {
    return {
      id: "test",
      name: "Test Phase",
      description: "A test phase",
      entry: false,
      filePath: "/test/PHASE.md",
      baseDir: "/test",
      content: "Test content",
      buildPrompt: () => "Test prompt",
    };
  }

  function createTestContext() {
    return {
      phase: createTestPhase(),
      currentPhaseId: "test",
      messages: [],
      availablePhases: ["test", "other"],
      model: {
        async chat(params: ChatParams): Promise<ChatResult> {
          return { content: "Response" };
        },
      },
      executeStep: async (action: unknown) => ({ result: "ok" }),
      runLoop: async () => ({
        iterations: 1,
        finalPhase: "stop",
        reason: "natural" as const,
      }),
      phaseRegistry: new Map<string, Phase>(),
      turnNumber: 1,
    };
  }

  test("getCurrentPhase returns current phase id", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    expect(api.getCurrentPhase()).toBe("test");
  });

  test("getPhaseContent returns phase body content", () => {
    const context = createTestContext();
    const phase = createTestPhase();
    phase.content = "Phase body content";
    context.phaseRegistry.set("test", phase);

    const api = createExtensionAPI(context);
    expect(api.getPhaseContent("test")).toBe("Phase body content");
    expect(api.getPhaseContent("nonexistent")).toBe("");
  });

  test("getContext returns agent context snapshot", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    const ctx = api.getContext();
    expect(ctx.currentPhase).toBe("test");
    expect(ctx.availablePhases).toEqual(["test", "other"]);
    expect(ctx.turnNumber).toBe(1);
  });

  test("setNextPhase stores suggested next phase", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    expect(api.__getNextPhase()).toBeUndefined();
    api.setNextPhase("other");
    expect(api.__getNextPhase()).toBe("other");
  });

  test("injectPrompt accumulates prompts", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    expect(api.__getInjectedPrompts()).toEqual([]);
    api.injectPrompt("First prompt");
    api.injectPrompt("Second prompt");
    expect(api.__getInjectedPrompts()).toEqual(["First prompt", "Second prompt"]);
  });

  test("onPhaseEnter registers callbacks", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    let called = false;
    api.onPhaseEnter(() => { called = true; });

    expect(api.__getEnterCallbacks()).toHaveLength(1);
  });

  test("onPhaseExit registers callbacks", () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    let called = false;
    api.onPhaseExit(() => { called = true; });

    expect(api.__getExitCallbacks()).toHaveLength(1);
  });

  test("model.chat delegates to context model", async () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    const result = await api.model.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.content).toBe("Response");
  });

  test("executeStep delegates to context", async () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    const result = await api.executeStep({ action: "test" });
    expect(result).toEqual({ result: "ok" });
  });

  test("runLoop delegates to context", async () => {
    const context = createTestContext();
    const api = createExtensionAPI(context);

    const result = await api.runLoop({ maxIterations: 5 });
    expect(result.iterations).toBe(1);
    expect(result.reason).toBe("natural");
  });
});

// ============================================================================
// PhaseState Tests
// ============================================================================

describe("PhaseState", () => {
  test("Phase type has correct structure", () => {
    const phase: Phase = {
      id: "review",
      name: "Code Review",
      description: "Review code",
      entry: true,
      target: "verify",
      filePath: "/phases/review/PHASE.md",
      baseDir: "/phases/review",
      content: "Review content",
      buildPrompt: () => "Review prompt",
      tools: ["read", "grep"],
      skills: ["code-review"],
    };

    expect(phase.id).toBe("review");
    expect(phase.entry).toBe(true);
    expect(phase.target).toBe("verify");
    expect(phase.tools).toEqual(["read", "grep"]);
  });
});
