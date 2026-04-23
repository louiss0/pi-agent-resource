import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Container,
  SelectList,
  Spacer,
  Text,
  type SelectItem,
  type TUI,
} from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  type InferOutput,
  maxLength,
  minLength,
  object,
  optional,
  pipe,
  regex,
  string,
} from "valibot";
import { ConfirmationBox, Form, LabelledInput } from "../shared/components";
import { parseObjectErrors } from "../shared/parse";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  SubCommands,
} from "../shared/subcommands";

export const SKILLS_DIRECTORY = join(homedir(), ".pi", "agents", "skills");
export const PROJECT_EDITOR_CONFIG_FILE = ".pi-resource.toml";

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathLikePattern =
  /^(?:$|~?[/.\\]|[A-Za-z]:[\\/]|\.\.?[\\/]|[^<>:"|?*\r\n]+(?:[\\/][^<>:"|?*\r\n]+)*)$/;
const commaSeparatedAllowedToolsPattern = /^(?:$|[a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)$/;
const formOverlayOptions = { overlay: true, overlayOptions: { offsetY: -500 } } as const;

const RequiredAgentSkillFieldsSchema = object({
  name: pipe(
    string(),
    minLength(1, "Name is required"),
    maxLength(164, "Name must be 164 characters or fewer"),
    regex(skillNamePattern, "Must be lowercase alphanumeric with dashes only"),
  ),
  description: pipe(
    string(),
    minLength(1, "Description is required"),
    maxLength(1024, "Description must be 1024 characters or fewer"),
  ),
});

const OptionalAgentSkillFormFieldsSchema = object({
  license: optional(pipe(string(), regex(pathLikePattern, "License must be a valid path")), ""),
  compatibility: optional(
    pipe(string(), maxLength(500, "Compatibility must be 500 characters or fewer")),
    "",
  ),
  allowedTools: optional(
    pipe(
      string(),
      regex(commaSeparatedAllowedToolsPattern, "Allowed tools must be a comma-separated list"),
    ),
    "",
  ),
});

type RequiredAgentSkillFields = InferOutput<typeof RequiredAgentSkillFieldsSchema>;
type OptionalAgentSkillFormFields = InferOutput<typeof OptionalAgentSkillFormFieldsSchema>;
type SkillFrontmatterFields = RequiredAgentSkillFields & OptionalAgentSkillFormFields;
type SkillEditorMode = "external";
type SkillSubcommand = "create" | "edit" | "delete";
type ParsedSkillCommandArgument = {
  subcommand: SkillSubcommand;
  editMode?: SkillEditorMode;
};

function createRequiredSkillForm(
  tui: TUI,
  theme: Theme,
  done: (value: (RequiredAgentSkillFields & { confirm: boolean }) | null) => void,
) {
  return new Form<RequiredAgentSkillFields & { confirm: boolean }>(tui, done, {
    title: "Create Skill",
    fields: [
      new LabelledInput("name", theme),
      new LabelledInput("description", theme),
      new ConfirmationBox(theme, "Do you want to fill in the next fields?"),
    ],
    parse: (values) =>
      parseObjectErrors(RequiredAgentSkillFieldsSchema, {
        name: values.name,
        description: values.description,
      }),
    footer: "Enter next/submit | Tab switch field | Esc cancel",
    spacing: 1,
  });
}

function createOptionalSkillForm(
  tui: TUI,
  theme: Theme,
  done: (value: OptionalAgentSkillFormFields | null) => void,
) {
  return new Form<OptionalAgentSkillFormFields>(tui, done, {
    title: "Skill Details",
    fields: [
      new LabelledInput("license", theme),
      new LabelledInput("compatibility", theme),
      new LabelledInput("allowedTools", theme),
    ],
    parse: (values) => parseObjectErrors(OptionalAgentSkillFormFieldsSchema, values),
    footer: "Enter next/submit | Tab switch field | Esc cancel",
    spacing: 1,
  });
}

export function parseSkillCommandArgument(argument: string) {
  const [subcommand, ...flags] = argument.split(/\s+/).filter(Boolean);
  const subcommandResult = SubCommands.parse(subcommand ?? "");

  if (!subcommandResult.success) {
    return {
      success: false as const,
      errorMessage: subcommandResult.errorMessage,
    };
  }

  for (const flag of flags) {
    if (flag !== "--external") {
      return {
        success: false as const,
        errorMessage: `Unknown flag: ${flag}`,
      };
    }
  }

  if (flags.includes("--external") && subcommandResult.output !== "edit") {
    return {
      success: false as const,
      errorMessage: "--external can only be used with edit",
    };
  }

  return {
    success: true as const,
    output: {
      subcommand: subcommandResult.output,
      editMode: flags.includes("--external") ? "external" : undefined,
    } satisfies ParsedSkillCommandArgument,
  };
}

export async function handleCreate(ctx: ExtensionCommandContext) {
  const requiredValues = await ctx.ui.custom<
    (RequiredAgentSkillFields & { confirm: boolean }) | null
  >((tui, theme, _kb, done) => createRequiredSkillForm(tui, theme, done), formOverlayOptions);

  if (!requiredValues) {
    ctx.ui.notify("Skill creation cancelled", "info");
    return;
  }

  let optionalValues: OptionalAgentSkillFormFields = {
    license: "",
    compatibility: "",
    allowedTools: "",
  };

  if (requiredValues.confirm) {
    const submittedOptionalValues = await ctx.ui.custom<OptionalAgentSkillFormFields | null>(
      (tui, theme, _kb, done) => createOptionalSkillForm(tui, theme, done),
      formOverlayOptions,
    );

    if (submittedOptionalValues) {
      optionalValues = submittedOptionalValues;
    }
  }

  try {
    const filePath = await createSkillFile({
      name: requiredValues.name,
      description: requiredValues.description,
      ...optionalValues,
    });

    ctx.ui.notify(`Skill created successfully: ${filePath}`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      ctx.ui.notify(`Skill already exists: ${requiredValues.name}`, "error");
      return;
    }

    throw error;
  }
}

export async function handleEdit(
  ctx: ExtensionCommandContext,
  requestedEditMode?: SkillEditorMode,
) {
  const skillPath = await pickSkillPath(ctx, "Edit Skill");

  if (!skillPath) {
    ctx.ui.notify("Skill edit cancelled", "info");
    return;
  }

  const currentContent = await readSkillFile(skillPath);
  const editMode = await resolveSkillEditMode(requestedEditMode, ctx.cwd || process.cwd());

  if (editMode === "external") {
    const editor = process.env.VISUAL || process.env.EDITOR;

    if (!editor) {
      ctx.ui.notify("Set $VISUAL or $EDITOR to edit skills", "error");
      return;
    }

    await openExternalEditor(editor, skillPath);
  } else {
    const editedContent = await ctx.ui.editor("Edit Skill Markdown", currentContent);

    if (editedContent === undefined) {
      ctx.ui.notify("Skill edit cancelled", "info");
      return;
    }

    await writeFile(skillPath, editedContent, "utf8");
  }

  ctx.ui.notify("Skill updated. Reloading skills...", "info");
  await ctx.reload();
}

export async function handleDelete(ctx: ExtensionCommandContext) {
  const skillPath = await pickSkillPath(ctx, "Delete Skill");

  if (!skillPath) {
    ctx.ui.notify("Skill deletion cancelled", "info");
    return;
  }

  const skillDirectory = dirname(skillPath);
  await rm(skillDirectory, { force: true, recursive: true });
  ctx.ui.notify(`Skill deleted successfully: ${skillDirectory}`);
}

async function resolveSkillEditMode(requestedEditMode?: SkillEditorMode, cwd = process.cwd()) {
  if (requestedEditMode) {
    return requestedEditMode;
  }

  const projectConfig = await readProjectEditorConfig(cwd);
  return projectConfig.skillEditor ?? "pi";
}

async function readProjectEditorConfig(cwd = process.cwd()) {
  try {
    const config = await readFile(join(cwd, PROJECT_EDITOR_CONFIG_FILE), "utf8");
    let isInSkillSection = false;

    for (const line of config.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
        isInSkillSection = trimmedLine === "[skill]";
        continue;
      }

      if (!isInSkillSection) {
        continue;
      }

      const editorMatch = trimmedLine.match(/^editor\s*=\s*"(external)"$/);
      if (editorMatch) {
        return { skillEditor: editorMatch[1] as SkillEditorMode };
      }
    }

    return { skillEditor: undefined };
  } catch {
    return { skillEditor: undefined };
  }
}

async function createSkillFile(fields: SkillFrontmatterFields) {
  const skillDirectory = join(SKILLS_DIRECTORY, fields.name);
  const skillPath = join(skillDirectory, "SKILL.md");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(skillPath, renderSkillMarkdown(fields), {
    encoding: "utf8",
    flag: "wx",
  });
  return skillPath;
}

function renderSkillMarkdown(fields: SkillFrontmatterFields) {
  const frontmatter = [
    "---",
    `name: ${formatYamlValue(fields.name)}`,
    `description: ${formatYamlValue(fields.description)}`,
    ...(fields.license ? [`license: ${formatYamlValue(fields.license)}`] : []),
    ...(fields.compatibility
      ? [`compatibility: ${formatYamlValue(fields.compatibility)}`]
      : []),
    ...(fields.allowedTools ? [`allowed-tools: ${formatYamlValue(fields.allowedTools)}`] : []),
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${humanizeSkillName(fields.name)}\n\n${fields.description}\n`;
}

function isAlreadyExistsError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function formatYamlValue(value: string) {
  const yamlSpecialCharacters = [
    ":",
    "#",
    "'",
    '"',
    "{",
    "}",
    "[",
    "]",
    ",",
    "&",
    "*",
    "!",
    "?",
    "|",
    ">",
    "@",
    "`",
    "%",
  ];
  const includesYamlSpecialCharacter = yamlSpecialCharacters.some((character) =>
    value.includes(character),
  );
  const canUsePlainValue =
    value.length > 0 &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    !/^[\s]|[\s]$/.test(value) &&
    !includesYamlSpecialCharacter;

  if (canUsePlainValue) {
    return value;
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function humanizeSkillName(name: string) {
  return name
    .split("-")
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join(" ");
}

async function pickSkillPath(ctx: ExtensionContext, title: string) {
  const skillNames = await listSkillNames();

  if (skillNames.length === 0) {
    ctx.ui.notify("No skills found", "info");
    return null;
  }

  return ctx.ui.custom<string | null>(
    (tui, theme, _kb, done) => {
      const items: SelectItem[] = skillNames.map((skillName) => ({
        value: skillName,
        label: skillName,
      }));

      const selectList = new SelectList(items, Math.min(items.length, 8), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      });

      selectList.onSelect = (item) => done(join(SKILLS_DIRECTORY, item.value, "SKILL.md"));
      selectList.onCancel = () => done(null);

      const container = new Container();
      container.addChild(new Text(theme.fg("accent", title)));
      container.addChild(new Spacer(1));
      container.addChild(selectList);
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", "^v navigate | enter select | esc cancel")));

      return {
        render: (width) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          selectList.handleInput(data);
          tui.requestRender();
        },
      } satisfies Component;
    },
    formOverlayOptions,
  );
}

async function listSkillNames() {
  try {
    const entries = await readdir(SKILLS_DIRECTORY, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function openExternalEditor(editor: string, filePath: string) {
  const editorCommand = parseExternalEditorCommand(editor);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(editorCommand.command, [...editorCommand.args, filePath], {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Editor exited with code ${code ?? "unknown"}`));
    });
  });
}

function parseExternalEditorCommand(editor: string) {
  const parts = tokenizeCommandLine(editor);
  const [command, ...args] = parts;

  if (!command) {
    throw new Error("Set $VISUAL or $EDITOR to edit skills");
  }

  return { command, args };
}

function tokenizeCommandLine(commandLine: string) {
  const parts: string[] = [];
  let token = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index];
    const nextCharacter = commandLine[index + 1];

    if (quote) {
      if (
        character === "\\" &&
        quote === '"' &&
        (nextCharacter === '"' || nextCharacter === "\\")
      ) {
        token += nextCharacter;
        index += 1;
        continue;
      }

      if (character === quote) {
        quote = null;
        continue;
      }

      token += character;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (token.length > 0) {
        parts.push(token);
        token = "";
      }
      continue;
    }

    if (
      character === "\\" &&
      (nextCharacter === '"' || nextCharacter === "'" || nextCharacter === "\\")
    ) {
      token += nextCharacter;
      index += 1;
      continue;
    }

    token += character;
  }

  if (quote) {
    throw new Error("Unterminated quote in $VISUAL or $EDITOR");
  }

  if (token.length > 0) {
    parts.push(token);
  }

  return parts;
}

async function readSkillFile(filePath: string) {
  return readFile(filePath, "utf8");
}

export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:skill", {
    description: "This is for managing skills",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("skill"),
    handler: async (arg, ctx) => {
      const result = parseSkillCommandArgument(arg);

      if (!result.success) {
        ctx.ui.notify(`Invalid command: ${result.errorMessage}`, "error");
        return;
      }

      switch (result.output.subcommand) {
        case "create":
          await handleCreate(ctx);
          break;
        case "edit":
          await handleEdit(ctx, result.output.editMode);
          break;
        case "delete":
          await handleDelete(ctx);
          break;
      }
    },
  });
};
