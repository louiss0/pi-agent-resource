import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

import {
  appendPromptSubcommandToOrder,
  buildAgentDocument,
  buildPromptDocument,
  buildPromptGroupIndex,
  buildSkillDocument,
  countMarkdownFiles,
  deleteDirectory,
  deleteFile,
  ensureProjectResourceDirectory,
  listProjectAgents,
  listProjectPrompts,
  listProjectSkills,
  readTextFile,
  removePromptSubcommandFromOrder,
  toRelativeProjectPath,
  type ResourceEntry,
  writeTextFile,
} from "./resource-store.ts";

const actionChoices = ["create", "edit", "delete", "list"] as const;
const resourceChoices = ["agent", "skill", "prompt"] as const;
const promptStyleChoices = ["ungrouped", "grouped"] as const;

const manageProjectResourcesParameters = Type.Object({
  action: Type.Optional(StringEnum(actionChoices)),
  resourceType: Type.Optional(StringEnum(resourceChoices)),
  promptStyle: Type.Optional(StringEnum(promptStyleChoices)),
});

type ResourceAction = typeof actionChoices[number];
type ResourceType = typeof resourceChoices[number];
type PromptStyle = typeof promptStyleChoices[number];
type ManageProjectResourcesParameters = Static<typeof manageProjectResourcesParameters>;
type ResourceWizardHints = Partial<ManageProjectResourcesParameters>;

export default function registerResourceStudio(pi: ExtensionAPI): void {
  pi.registerCommand("resource-studio", {
    description: "Create, edit, delete, and list project-local agents, skills, and prompts",
    handler: async (args, ctx) => {
      const hints = parseCommandHints(args);
      const result = await runResourceWizard(ctx, hints);
      if (result) ctx.ui.notify(result, "info");
    },
  });

  pi.registerTool({
    name: "manage_project_resources",
    label: "Manage Project Resources",
    description: "Create, edit, delete, and list project-local agents, skills, and prompts.",
    promptSnippet: "Create, edit, delete, or inspect project-local Pi agents, skills, and prompts through an interactive wizard.",
    promptGuidelines: [
      "Use this tool when the user wants to create, edit, delete, or inspect project-local Pi agents, skills, or prompts.",
      "For prompts, ask whether the prompt should be grouped or ungrouped when creating a new prompt.",
    ],
    parameters: manageProjectResourcesParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const summary = await runResourceWizard(ctx, params);
      return {
        content: [{ type: "text", text: summary ?? "Resource wizard cancelled." }],
        details: {},
      };
    },
  });
}

async function runResourceWizard(ctx: ExtensionContext, hints: ResourceWizardHints = {}): Promise<string | undefined> {
  if (!ctx.hasUI) throw new Error("manage_project_resources requires an interactive Pi UI session.");

  const action = await pickChoice(ctx, "Choose an action", actionChoices, hints.action);
  if (!action) return undefined;

  if (action === "list") return listResources(ctx.cwd);

  const resourceType = await pickChoice(ctx, "Choose a resource type", resourceChoices, hints.resourceType);
  if (!resourceType) return undefined;

  if (action === "create") {
    if (resourceType === "agent") return createAgent(ctx);
    if (resourceType === "skill") return createSkill(ctx);
    return createPrompt(ctx, hints.promptStyle);
  }

  if (action === "edit") {
    if (resourceType === "agent") return editAgent(ctx);
    if (resourceType === "skill") return editSkill(ctx);
    return editPrompt(ctx);
  }

  if (resourceType === "agent") return deleteAgent(ctx);
  if (resourceType === "skill") return deleteSkill(ctx);
  return deletePrompt(ctx);
}

async function createAgent(ctx: ExtensionContext): Promise<string | undefined> {
  const agentName = await promptForResourceName(ctx, "Agent name", "Use lowercase kebab-case, for example bug-hunter.");
  if (!agentName) return undefined;

  const description = (await ctx.ui.input("Agent description", "Optional short description for frontmatter")) ?? "";
  const agentDirectory = await ensureProjectResourceDirectory(ctx.cwd, [".pi", "agents"]);
  const filePath = path.join(agentDirectory, `${agentName}.md`);
  const existingAgents = await listProjectAgents(ctx.cwd);
  if (existingAgents.some((entry) => entry.name === agentName)) throw new Error(`An agent named ${agentName} already exists.`);

  const editorText = await ctx.ui.editor("Finish the agent document", buildAgentDocument({ description }));
  if (editorText === undefined) return undefined;

  await writeTextFile(filePath, editorText);
  return `Created agent ${agentName} at ${toRelativeProjectPath(ctx.cwd, filePath)}.`;
}

async function createSkill(ctx: ExtensionContext): Promise<string | undefined> {
  const skillName = await promptForResourceName(ctx, "Skill name", "Use lowercase kebab-case to satisfy the Agent Skills spec.");
  if (!skillName) return undefined;

  const description = await promptForRequiredText(ctx, "Skill description", "Required by the Agent Skills spec.");
  if (!description) return undefined;

  const license = (await ctx.ui.input("Skill license", "Optional, for example MIT")) ?? "";
  const compatibility = (await ctx.ui.input("Skill compatibility", "Optional environment requirements")) ?? "";
  const skillDirectory = await ensureProjectResourceDirectory(ctx.cwd, [".pi", "skills"]);
  const filePath = path.join(skillDirectory, skillName, "SKILL.md");
  const existingSkills = await listProjectSkills(ctx.cwd);
  if (existingSkills.some((entry) => entry.name === skillName)) throw new Error(`A skill named ${skillName} already exists.`);

  const editorText = await ctx.ui.editor(
    "Finish the skill document",
    buildSkillDocument({ name: skillName, description, license, compatibility }),
  );
  if (editorText === undefined) return undefined;

  await writeTextFile(filePath, editorText);
  return `Created skill ${skillName} at ${toRelativeProjectPath(ctx.cwd, filePath)}.`;
}

async function createPrompt(ctx: ExtensionContext, promptStyleHint?: PromptStyle): Promise<string | undefined> {
  const promptStyle = await pickChoice(ctx, "Choose a prompt style", promptStyleChoices, promptStyleHint);
  if (!promptStyle) return undefined;
  return promptStyle === "ungrouped" ? createFlatPrompt(ctx) : createGroupedPrompt(ctx);
}

async function createFlatPrompt(ctx: ExtensionContext): Promise<string | undefined> {
  const promptName = await promptForResourceName(ctx, "Prompt name", "Use lowercase kebab-case, for example review.");
  if (!promptName) return undefined;

  const description = (await ctx.ui.input("Prompt description", "Optional menu description")) ?? "";
  const promptDirectory = await ensureProjectResourceDirectory(ctx.cwd, [".pi", "prompts"]);
  const filePath = path.join(promptDirectory, `${promptName}.md`);
  const existingPrompts = await listProjectPrompts(ctx.cwd);
  if (existingPrompts.some((entry) => entry.kind === "flat" && entry.name === promptName)) throw new Error(`An ungrouped prompt named ${promptName} already exists.`);

  const editorText = await ctx.ui.editor("Finish the prompt document", buildPromptDocument({ description }));
  if (editorText === undefined) return undefined;

  await writeTextFile(filePath, editorText);
  return `Created prompt /${promptName} at ${toRelativeProjectPath(ctx.cwd, filePath)}.`;
}

async function createGroupedPrompt(ctx: ExtensionContext): Promise<string | undefined> {
  const promptDirectory = await ensureProjectResourceDirectory(ctx.cwd, [".pi", "prompts"]);
  const existingPrompts = await listProjectPrompts(ctx.cwd);
  const existingGroups = existingPrompts.filter((entry) => entry.kind === "group");
  const creationModeChoices = existingGroups.length > 0 ? ["new-group", "existing-group"] as const : ["new-group"] as const;
  const creationMode = await pickChoice(ctx, "Create a new group or add a subcommand?", creationModeChoices, creationModeChoices[0]);
  if (!creationMode) return undefined;

  if (creationMode === "existing-group") {
    const selectedGroup = await pickEntry(ctx, "Choose a prompt group", existingGroups);
    if (!selectedGroup?.directoryPath) return undefined;

    const subcommandName = await promptForResourceName(ctx, "Subcommand name", "Use lowercase kebab-case, for example summary.");
    if (!subcommandName) return undefined;

    if (existingPrompts.some((entry) => entry.kind === "subcommand" && entry.groupName === selectedGroup.name && entry.name === subcommandName)) {
      throw new Error(`/${selectedGroup.name} ${subcommandName} already exists.`);
    }

    const description = (await ctx.ui.input("Subcommand description", "Optional menu description")) ?? "";
    const subcommandFilePath = path.join(selectedGroup.directoryPath, `${subcommandName}.md`);
    const editorText = await ctx.ui.editor("Finish the grouped prompt subcommand", buildPromptDocument({ description }));
    if (editorText === undefined) return undefined;

    await writeTextFile(subcommandFilePath, editorText);
    await appendPromptSubcommandToOrder(selectedGroup.filePath, subcommandName);
    return `Created prompt /${selectedGroup.name} ${subcommandName} at ${toRelativeProjectPath(ctx.cwd, subcommandFilePath)}.`;
  }

  const groupName = await promptForResourceName(ctx, "Prompt group name", "Use lowercase kebab-case, for example review.");
  if (!groupName) return undefined;

  if (existingGroups.some((entry) => entry.name === groupName) || existingPrompts.some((entry) => entry.kind === "flat" && entry.name === groupName)) {
    throw new Error(`A prompt named ${groupName} already exists.`);
  }

  const groupDescription = (await ctx.ui.input("Group description", "Optional group description for _index.md")) ?? "";
  const subcommandName = await promptForResourceName(ctx, "First subcommand name", "Use lowercase kebab-case, for example summary.");
  if (!subcommandName) return undefined;

  const subcommandDescription = (await ctx.ui.input("Subcommand description", "Optional menu description")) ?? "";
  const groupDirectory = path.join(promptDirectory, groupName);
  const indexFilePath = path.join(groupDirectory, "_index.md");
  const subcommandFilePath = path.join(groupDirectory, `${subcommandName}.md`);
  const editorText = await ctx.ui.editor("Finish the grouped prompt subcommand", buildPromptDocument({ description: subcommandDescription }));
  if (editorText === undefined) return undefined;

  await writeTextFile(indexFilePath, buildPromptGroupIndex({ description: groupDescription, order: [subcommandName] }));
  await writeTextFile(subcommandFilePath, editorText);
  return `Created prompt group /${groupName} with /${groupName} ${subcommandName}.`;
}

async function editAgent(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose an agent to edit", await listProjectAgents(ctx.cwd));
  return entry ? editMarkdownFile(ctx, entry.filePath, `Edit agent ${entry.name}`) : undefined;
}

async function editSkill(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose a skill to edit", await listProjectSkills(ctx.cwd));
  return entry ? editMarkdownFile(ctx, entry.filePath, `Edit skill ${entry.name}`) : undefined;
}

async function editPrompt(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose a prompt resource to edit", await listProjectPrompts(ctx.cwd));
  return entry ? editMarkdownFile(ctx, entry.filePath, `Edit ${entry.command}`) : undefined;
}

async function editMarkdownFile(ctx: ExtensionContext, filePath: string, title: string): Promise<string | undefined> {
  const currentContent = await readTextFile(filePath);
  const updatedContent = await ctx.ui.editor(title, currentContent);
  if (updatedContent === undefined) return undefined;
  await writeTextFile(filePath, updatedContent);
  return `Updated ${toRelativeProjectPath(ctx.cwd, filePath)}.`;
}

async function deleteAgent(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose an agent to delete", await listProjectAgents(ctx.cwd));
  if (!entry) return undefined;
  if (!(await ctx.ui.confirm("Delete agent?", `${entry.name} will be removed from this project.`))) return undefined;
  await deleteFile(entry.filePath);
  return `Deleted agent ${entry.name}.`;
}

async function deleteSkill(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose a skill to delete", await listProjectSkills(ctx.cwd));
  if (!entry?.directoryPath) return undefined;
  if (!(await ctx.ui.confirm("Delete skill?", `${entry.name} and its skill directory will be removed.`))) return undefined;
  await deleteDirectory(entry.directoryPath);
  return `Deleted skill ${entry.name}.`;
}

async function deletePrompt(ctx: ExtensionContext): Promise<string | undefined> {
  const entry = await pickEntry(ctx, "Choose a prompt resource to delete", await listProjectPrompts(ctx.cwd));
  if (!entry) return undefined;

  if (entry.kind === "group" && entry.directoryPath) {
    if (!(await ctx.ui.confirm("Delete prompt group?", `${entry.command} and every subcommand in the group will be removed.`))) return undefined;
    await deleteDirectory(entry.directoryPath);
    return `Deleted prompt group ${entry.command}.`;
  }

  if (entry.kind === "subcommand" && entry.directoryPath && entry.indexFilePath) {
    if (!(await ctx.ui.confirm("Delete prompt subcommand?", `${entry.command} will be removed from its group.`))) return undefined;
    await deleteFile(entry.filePath);
    await removePromptSubcommandFromOrder(entry.indexFilePath, entry.name);

    const remainingMarkdownFiles = await countMarkdownFiles(entry.directoryPath);
    if (remainingMarkdownFiles === 0) {
      await deleteDirectory(entry.directoryPath);
      return `Deleted ${entry.command} and removed its empty group directory.`;
    }

    return `Deleted prompt subcommand ${entry.command}.`;
  }

  if (!(await ctx.ui.confirm("Delete prompt?", `${entry.command} will be removed from this project.`))) return undefined;
  await deleteFile(entry.filePath);
  return `Deleted prompt ${entry.command}.`;
}

async function listResources(cwd: string): Promise<string> {
  const [agents, skills, prompts] = await Promise.all([
    listProjectAgents(cwd),
    listProjectSkills(cwd),
    listProjectPrompts(cwd),
  ]);

  return [
    "Project-local PI resources",
    "",
    formatSection("Agents", agents.map((entry) => `${entry.name} — ${toRelativeProjectPath(cwd, entry.filePath)}`)),
    formatSection("Skills", skills.map((entry) => `${entry.command} — ${toRelativeProjectPath(cwd, entry.filePath)}`)),
    formatSection("Prompts", prompts.map((entry) => `${entry.command} — ${toRelativeProjectPath(cwd, entry.filePath)}`)),
  ].join("\n").trim();
}

function formatSection(title: string, rows: string[]): string {
  return rows.length === 0 ? `${title}:\n- none` : `${title}:\n${rows.map((row) => `- ${row}`).join("\n")}`;
}

async function promptForResourceName(ctx: ExtensionContext, title: string, placeholder: string): Promise<string | undefined> {
  while (true) {
    const value = await ctx.ui.input(title, placeholder);
    if (value === undefined) return undefined;

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      ctx.ui.notify("A name is required.", "warning");
      continue;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedValue)) {
      ctx.ui.notify("Use lowercase kebab-case without spaces or repeated hyphens.", "warning");
      continue;
    }

    return trimmedValue;
  }
}

async function promptForRequiredText(ctx: ExtensionContext, title: string, placeholder: string): Promise<string | undefined> {
  while (true) {
    const value = await ctx.ui.input(title, placeholder);
    if (value === undefined) return undefined;
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      ctx.ui.notify("This field is required.", "warning");
      continue;
    }
    return trimmedValue;
  }
}

async function pickChoice<TChoice extends string>(
  ctx: ExtensionContext,
  title: string,
  choices: readonly TChoice[],
  preferredChoice?: TChoice,
): Promise<TChoice | undefined> {
  if (preferredChoice && choices.includes(preferredChoice)) return preferredChoice;
  const choice = await ctx.ui.select(title, [...choices]);
  return choice as TChoice | undefined;
}

async function pickEntry(ctx: ExtensionContext, title: string, entries: ResourceEntry[]): Promise<ResourceEntry | undefined> {
  if (entries.length === 0) {
    ctx.ui.notify("No matching project-local resources were found.", "warning");
    return undefined;
  }

  const labelToEntry = new Map(entries.map((entry) => [entry.label, entry]));
  const choice = await ctx.ui.select(title, entries.map((entry) => entry.label));
  return choice ? labelToEntry.get(choice) : undefined;
}

function parseCommandHints(args = ""): {
  action?: ResourceAction;
  resourceType?: ResourceType;
  promptStyle?: PromptStyle;
} {
  const words = args.split(/\s+/).map((word) => word.trim().toLowerCase()).filter(Boolean);
  return {
    action: actionChoices.find((choice) => words.includes(choice)),
    resourceType: resourceChoices.find((choice) => words.includes(choice)),
    promptStyle: promptStyleChoices.find((choice) => words.includes(choice)),
  };
}
