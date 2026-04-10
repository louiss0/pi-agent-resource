import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

import {
  buildAgentDocument,
  buildPromptDocument,
  buildSkillDocument,
  isValidResourceName,
  listProjectPrompts,
  readPromptGroupOrder,
  removePromptSubcommandFromOrder,
} from "../@extensions/resource-studio/resource-store.ts";

test("isValidResourceName accepts lowercase kebab-case names", () => {
  assert.equal(isValidResourceName("my-skill"), true);
  assert.equal(isValidResourceName("review-agent-2"), true);
  assert.equal(isValidResourceName("MySkill"), false);
  assert.equal(isValidResourceName("bad name"), false);
  assert.equal(isValidResourceName("bad--name"), false);
});

test("buildSkillDocument creates Agent Skills compliant frontmatter", () => {
  const document = buildSkillDocument({
    name: "release-checklist",
    description: "Guides release preparation and verification.",
    license: "MIT",
    compatibility: "Requires git and npm.",
  });

  assert.match(document, /^---\nname: release-checklist\ndescription: Guides release preparation and verification\./);
  assert.match(document, /license: MIT/);
  assert.match(document, /compatibility: Requires git and npm\./);
  assert.match(document, /# release-checklist/);
});

test("buildAgentDocument and buildPromptDocument include optional descriptions", () => {
  const agent = buildAgentDocument({
    description: "Investigates failures before proposing fixes.",
  });
  const prompt = buildPromptDocument({
    description: "Review staged changes for defects.",
  });

  assert.match(agent, /description: Investigates failures before proposing fixes\./);
  assert.match(prompt, /description: Review staged changes for defects\./);
});

test("listProjectPrompts discovers flat prompts, groups, and subcommands", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "resource-studio-"));
  const promptDirectory = path.join(temporaryDirectory, ".pi", "prompts");
  const groupDirectory = path.join(promptDirectory, "review");

  try {
    await mkdir(groupDirectory, { recursive: true });
    await writeFile(path.join(promptDirectory, "summarize.md"), "---\ndescription: Summarize code\n---\nBody\n");
    await writeFile(path.join(groupDirectory, "_index.md"), "---\ntype: group\ndescription: Review helpers\norder: [security, summary]\n---\n");
    await writeFile(path.join(groupDirectory, "summary.md"), "---\ndescription: Summary\n---\nBody\n");
    await writeFile(path.join(groupDirectory, "security.md"), "---\ndescription: Security\n---\nBody\n");

    const prompts = await listProjectPrompts(temporaryDirectory);

    assert.deepEqual(
      prompts.map((entry) => ({ kind: entry.kind, command: entry.command })),
      [
        { kind: "group", command: "/review" },
        { kind: "subcommand", command: "/review security" },
        { kind: "subcommand", command: "/review summary" },
        { kind: "flat", command: "/summarize" },
      ],
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("removePromptSubcommandFromOrder updates the group order without touching other entries", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "resource-studio-"));
  const indexFilePath = path.join(temporaryDirectory, "_index.md");

  try {
    await writeFile(indexFilePath, "---\ntype: group\ndescription: Review helpers\norder: [summary, security, fix]\n---\n");

    await removePromptSubcommandFromOrder(indexFilePath, "security");

    const updatedDocument = await readFile(indexFilePath, "utf8");
    assert.deepEqual(readPromptGroupOrder(updatedDocument), ["summary", "fix"]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
