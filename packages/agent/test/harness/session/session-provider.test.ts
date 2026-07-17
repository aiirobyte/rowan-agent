import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemorySessionProvider,
  LocalJsonlSessionProvider,
} from "../../../src/harness/session";

const sessionInput = {
  systemPrompt: "Test system",
  input: "hello",
};

test("InMemorySessionProvider creates and opens Sessions", async () => {
  const provider = new InMemorySessionProvider();
  const created = await provider.create(sessionInput);

  expect(await provider.open(created.getSessionId())).toBe(created);
  expect(await provider.open("ses_missing")).toBeUndefined();
});

test("LocalJsonlSessionProvider creates and opens Sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "rowan-session-provider-"));
  const provider = new LocalJsonlSessionProvider(join(root, "sessions"));

  try {
    const created = await provider.create(sessionInput);
    const opened = await provider.open(created.getSessionId());

    expect(opened?.getSessionId()).toBe(created.getSessionId());
    expect(await provider.open("ses_missing")).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
