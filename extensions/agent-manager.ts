import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import {
  InferOutput,
  maxLength,
  minLength,
  object,
  pipe,
  regex,
  string,
} from "valibot";
import { Form, LabelledInput } from "../shared/components";
import { getResourceFileSystem } from "../shared/filesystem";
import { parseObjectErrors } from "../shared/parse";
import {
  notifyWhenUsingDevelopmentExtension,
  registerDevelopmentExtensionNotice,
} from "../shared/runtime";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  SubCommands,
} from "../shared/subcommands";

const extensionName = "resource:agent";
const globalAgentDirectory = join(homedir(), ".pi", "agents");
const localAgentDirectory = join(".pi", "agents");
const formOverlayOptions = { overlay: true, overlayOptions: { offsetY: -500 } } as const;
const agentNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const lowerCommaSeparatedToolsPattern = /^[a-z0-9:-]+(?:\s*,\s*[a-z0-9:-]+)*$/;

const AgentFieldsSchema = object({
  name: pipe(
    string(),
    minLength(1, "Name is required"),
    maxLength(48, "Name must be 48 characters or fewer"),
    regex(agentNamePattern, "Name must be lowercase letters, numbers, and dashes only"),
  ),
  description: pipe(
    string(),
    minLength(35, "Description must be at least 35 characters"),
    maxLength(1024, "Description must be 1024 characters or fewer"),
  ),
  tools: pipe(
    string(),
    minLength(1, "Tools are required"),
    regex(lowerCommaSeparatedToolsPattern, "Tools must be a lowercase comma-separated list"),
  ),
  model: pipe(
    string(),
    minLength(2, "Model must be at least 2 characters"),
    maxLength(128, "Model must be 128 characters or fewer"),
    regex(/^[a-z0-9:-]+$/, "Model must be lowercase"),
  ),
});

type AgentFields = InferOutput<typeof AgentFieldsSchema>;

type AgentChoice = {
  path: string;
  label: string;
};

export function parseAgentFormValues(values: AgentFields) {
  return parseObjectErrors(AgentFieldsSchema, values);
}

export function createAgentForm(tui: TUI, theme: Theme, done: (value: AgentFields | null) => void) {
  return new Form<AgentFields>(tui, done, {
    title: "Create Agent",
    fields: [
      new LabelledInput("name", theme),
      new LabelledInput("description", theme),
      new LabelledInput("tools", theme),
      new LabelledInput("model", theme),
    ],
    parse: parseAgentFormValues,
    footer:
      "* required | Enter next/submit | Tab switch field | Esc cancel\nUse lowercase values. Tools use commas. * appears on the left label. Required fields cannot be removed.",
    spacing: 1,
  });
}

export default (pi: ExtensionAPI) => {
  registerDevelopmentExtensionNotice(pi, extensionName);

  pi.registerCommand("resource:agent", {
    description: "This is for managing agents",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("agent"),
    handler: async (arg, ctx) => {
      notifyWhenUsingDevelopmentExtension(extensionName, ctx);
      const result = SubCommands.parse(arg);
      if (!result.success) {
        ctx.ui.notify(`Invalid command: ${result.errorMessage}`, "error");
        return;
      }

      switch (result.output) {
        case "create":
          await handleCreate(ctx);
          break;
        case "edit":
          await handleEdit(ctx);
          break;
        case "delete":
          await handleDelete(ctx);
          break;
      }
    },
  });
};

export async function handleCreate(ctx: ExtensionContext) {
  const values = await ctx.ui.custom<AgentFields | null>(
    (tui, theme, _keyboard, done) => createAgentForm(tui, theme, done),
    formOverlayOptions,
  );

  if (!values) {
    ctx.ui.notify("Agent creation cancelled", "info");
    return;
  }

  const fileSystem = getResourceFileSystem();
  const filePath = join(globalAgentDirectory, `${values.name}.md`);
  await fileSystem.mkdir(globalAgentDirectory, { recursive: true });
  await fileSystem.writeFile(filePath, renderFrontmatter(values), "utf8");
  ctx.ui.notify("Agent created");
}

export async function handleEdit(ctx: ExtensionContext) {
  const agent = await pickAgent(ctx, "Edit Agent");

  if (!agent) {
    ctx.ui.notify("Agent editing cancelled", "info");
    return;
  }

  const fileSystem = getResourceFileSystem();
  const content = await fileSystem.readFile(agent.path, "utf8");
  const editedContent = await ctx.ui.editor("Edit Agent", content);

  if (editedContent === undefined) {
    ctx.ui.notify("Agent editing cancelled", "info");
    return;
  }

  await fileSystem.writeFile(agent.path, editedContent, "utf8");
  ctx.ui.notify("Agent edited");
}

export async function handleDelete(ctx: ExtensionContext) {
  const agent = await pickAgent(ctx, "Delete Agent");

  if (!agent) {
    ctx.ui.notify("Agent deleting cancelled", "info");
    return;
  }

  await getResourceFileSystem().removeFile(agent.path);
  ctx.ui.notify("Agent deleted");
}

function renderFrontmatter(values: AgentFields) {
  return ["---", ...Object.entries(values).map(([key, value]) => `${key}: ${value}`), "---", ""]
    .join("\n");
}

async function pickAgent(ctx: ExtensionContext, title: string) {
  const choices = await listAgentChoices();

  if (choices.length === 0) {
    ctx.ui.notify("No agents found", "info");
    return null;
  }

  const selectedLabel = await ctx.ui.select(
    title,
    choices.map((choice) => choice.label),
  );

  if (!selectedLabel) {
    return null;
  }

  return choices.find((choice) => choice.label === selectedLabel) ?? null;
}

async function listAgentChoices() {
  const directories = [
    { path: localAgentDirectory, prefix: "local" },
    { path: globalAgentDirectory, prefix: "global" },
  ] as const;

  const choices: AgentChoice[] = [];

  for (const directory of directories) {
    try {
      const names = await getResourceFileSystem().readDirectoryNames(directory.path);
      choices.push(
        ...names.map((name) => ({
          path: join(directory.path, name),
          label: `${directory.prefix}: ${basename(name, ".md")}`,
        })),
      );
    } catch {
      // Ignore missing directories so local and global agents can coexist.
    }
  }

  return choices;
}

