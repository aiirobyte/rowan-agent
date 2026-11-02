import { expect, test } from "bun:test";
import { models, type ExtensionAPI } from "../src/index";
import type { ProviderConfig } from "../src/extensions/types";
import { createExtensionRunner } from "../src/extensions";
import { AgentRuntime, InMemoryStore } from "../src/runtime";

const provider: ProviderConfig = {
  id: "providers-changed-test",
  protocol: "openai-completions",
  baseUrl: "http://localhost",
  apiKey: "test",
  models: [{ id: "m", name: "M" }],
};

async function boundRunner() {
  const runner = createExtensionRunner();
  let api!: ExtensionAPI;
  await runner.loadExtensions([{ path: "<test:providers>", name: "providers", factory: (a) => { api = a; } }]);
  runner.bind();
  return { runner, api };
}

test("register, unregister and unsubscribe", async () => {
  const { runner, api } = await boundRunner();
  let calls = 0;
  const off = runner.onProvidersChanged(() => { calls++; });
  api.models.registerProvider(provider);
  expect(calls).toBe(1);
  api.models.unregisterProvider(provider.id);
  expect(calls).toBe(2);
  off();
  api.models.registerProvider(provider);
  expect(calls).toBe(2);
  await runner.close();
});

test("Extension dispose notifies, and a throwing listener breaks nothing", async () => {
  const { runner, api } = await boundRunner();
  let calls = 0;
  runner.onProvidersChanged(() => { throw new Error("boom"); });
  runner.onProvidersChanged(() => { calls++; });
  api.models.registerProvider(provider);
  expect(calls).toBe(1);
  await runner.close();
  expect(calls).toBe(2);
});

test("provider registration forwards the auth mode to registered models", async () => {
  const { runner, api } = await boundRunner();
  api.models.registerProvider({
    ...provider,
    id: "providers-auth-test",
    apiKey: undefined,
    auth: "none",
  });

  expect(models.getModel("providers-auth-test", "m")).toMatchObject({
    auth: "none",
    apiKey: undefined,
  });

  api.models.unregisterProvider("providers-auth-test");
  await runner.close();
});

test("pending registrations notify once at bind; AgentRuntime delegates", async () => {
  const runner = createExtensionRunner();
  let calls = 0;
  runner.onProvidersChanged(() => { calls++; });
  await runner.loadExtensions([{
    path: "<test:pending>",
    name: "pending",
    factory: (api) => {
      api.models.registerProvider(provider);
      api.models.registerProvider({ ...provider, id: "providers-changed-test-2" });
    },
  }]);
  expect(calls).toBe(0);
  runner.bind();
  expect(calls).toBe(1);
  await runner.close();

  const runtime = await AgentRuntime.init({ store: new InMemoryStore() });
  const off = runtime.onProvidersChanged(() => {});
  expect(typeof off).toBe("function");
  off();
  await runtime.close();
});
