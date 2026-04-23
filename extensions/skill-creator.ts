import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Container,
  type Focusable,
  Input,
  Key,
  matchesKey,
  SelectList,
  Spacer,
  Text,
  type TUI,
  truncateToWidth,
  type SelectItem,
} from "@mariozechner/pi-tui";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  type InferOutput,
  maxLength,
  minLength,
  object,
  optional,
  pipe,
  regex,
  safeParse,
  string,
} from "valibot";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  SubCommands,
} from "../shared/subcommands";

export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:skill", {
    description: "This is for creating a new skill",
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

export const SKILLS_DIRECTORY = join(homedir(), ".pi", "agents", "skills");
export const PROJECT_EDITOR_CONFIG_PATH = join(process.cwd(), ".pi-resource.toml");

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathLikePattern = /^(?:$|~?[/.\\]|[A-Za-z]:[\\/]|\.\.?[\\/]|[^<>:"|?*\r\n]+(?:[\\/][^<>:"|?*\r\n]+)*)$/;
const commaSeparatedAllowedToolsPattern =
  /^(?:$|[a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)$/;

export const RequiredAgentSkillFieldsSchema = object({
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

export const OptionalAgentSkillFrontmatterFieldsSchema = object({
  license: optional(string(), ""),
  compatibility: optional(string(), ""),
  allowedTools: optional(string(), ""),
});

export const OptionalAgentSkillFormFieldsSchema = object({
  license: optional(
    pipe(string(), regex(pathLikePattern, "License must be a valid path")),
    "",
  ),
  compatibility: optional(
    pipe(string(), maxLength(500, "Compatibility must be 500 characters or fewer")),
    "",
  ),
  allowedTools: optional(
    pipe(
      string(),
      regex(
        commaSeparatedAllowedToolsPattern,
        "Allowed tools must be a comma-separated list",
      ),
    ),
    "",
  ),
});

type RequiredAgentSkillFields = InferOutput<typeof RequiredAgentSkillFieldsSchema>;
type OptionalAgentSkillFrontmatterFields = InferOutput<
  typeof OptionalAgentSkillFrontmatterFieldsSchema
>;
type OptionalAgentSkillFormFields = InferOutput<typeof OptionalAgentSkillFormFieldsSchema>;
export type SkillFrontmatterFields =
  RequiredAgentSkillFields & OptionalAgentSkillFrontmatterFields;

type SkillEditorMode = "pi" | "external";

type SkillSubcommand = "create" | "edit" | "delete";

type ParsedSkillCommandArgument = {
  subcommand: SkillSubcommand;
  editMode?: SkillEditorMode;
};

class LabelledInput extends Container {
  #name: string;
  #errorText = new Text("");
  #input = new Input();
  #labelText: Text;
  #theme: Theme;

  constructor(name: string, theme: Theme) {
    super();
    this.#name = name;
    this.#labelText = new Text(name);
    this.addChild(this.#labelText);
    this.addChild(this.#input);
    this.addChild(this.#errorText);
    this.addChild(new Spacer(1));
    this.#theme = theme;
  }

  setError(messages: string[]) {
    this.#errorText.setText(
      messages.map((message) => this.#theme.fg("error", message)).join("\n"),
    );
  }

  clearError() {
    this.#errorText.setText("");
  }

  setFocused(focused: boolean) {
    this.#input.focused = focused;
  }

  setLabelTextPrefix(prefix: string) {
    this.#labelText.setText(this.#theme.fg("accent", `${prefix}${this.#name}`));
  }

  get name() {
    return this.#name;
  }

  get value() {
    return this.#input.getValue();
  }

  handleInput(value: string) {
    this.#input.handleInput(value);
  }
}

export class ConfirmationBox extends Container {
  #confirmed = false;
  #focused = false;
  #tui: TUI;
  #theme: Theme;
  #errorText = new Text("");

  constructor(tui: TUI, theme: Theme) {
    super();
    this.#tui = tui;
    this.#theme = theme;
    this.addChild(this.#errorText);
  }

  get confirmed() {
    return this.#confirmed;
  }

  setFocused(focused: boolean) {
    this.#focused = focused;
  }

  setError(messages: string[]) {
    this.#errorText.setText(
      messages.map((message) => this.#theme.fg("error", message)).join("\n"),
    );
  }

  clearError() {
    this.#errorText.setText("");
  }

  toggle() {
    this.#confirmed = !this.#confirmed;
    this.clearError();
    this.#tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.space)) {
      this.toggle();
    }
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    const box = this.#confirmed ? "[x]" : "[ ]";
    const prefix = this.#focused ? "> " : "  ";
    return [truncateToWidth(`${prefix}${box} Do you want to fill in the next fields?`, width), ...lines];
  }
}

class SkillDetailsForm<TValues extends Record<string, string>> extends Container implements Focusable {
  #activeFieldIndex = 0;
  #labelledInputs: LabelledInput[];
  #done: (value: TValues | null) => void;
  #tui: TUI;
  #focused = false;
  #schema: object;

  get focused() {
    return this.#focused;
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#syncInputFocus();
    this.#updateFieldLabels();
  }

  constructor(
    tui: TUI,
    theme: Theme,
    title: string,
    keys: string[],
    schema: object,
    done: (value: TValues | null) => void,
  ) {
    super();
    this.#done = done;
    this.#tui = tui;
    this.#schema = schema;
    this.#labelledInputs = keys.map((label) => new LabelledInput(label, theme));

    this.#syncInputFocus();

    for (const field of [
      new Text(theme.fg("accent", title)),
      new Spacer(1),
      ...this.#labelledInputs,
      new Text(theme.fg("dim", "Enter next/submit • Tab switch field • Esc cancel")),
    ]) {
      this.addChild(field);
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.#done(null);
      return;
    }

    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) {
      this.#moveFocus(1);
      return;
    }

    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.up)) {
      this.#moveFocus(-1);
      return;
    }

    if (matchesKey(data, Key.enter)) {
      if (this.#activeFieldIndex === this.#labelledInputs.length - 1) {
        this.#submit();
      } else {
        this.#moveFocus(1);
      }
      return;
    }

    const activeInput = this.#labelledInputs[this.#activeFieldIndex];
    activeInput.handleInput(data);
    this.#validateField(activeInput);
    this.#tui.requestRender();
  }

  override invalidate(): void {
    super.invalidate();
    this.#updateFieldLabels();
  }

  #moveFocus(direction: 1 | -1) {
    this.#activeFieldIndex =
      (this.#activeFieldIndex + direction + this.#labelledInputs.length) %
      this.#labelledInputs.length;
    this.#syncInputFocus();
    this.#updateFieldLabels();
    this.#tui.requestRender();
  }

  #submit() {
    const values = this.#getValues();
    const result = safeParse(this.#schema, values);

    if (!result.success) {
      this.#applyValidationIssues(result.issues);
      this.#tui.requestRender();
      return;
    }

    this.#done(result.output as TValues);
  }

  #getValues() {
    return Object.fromEntries(this.#labelledInputs.map((input) => [input.name, input.value]));
  }

  #validateField(input: LabelledInput) {
    const result = safeParse(this.#schema, this.#getValues());

    if (result.success) {
      input.clearError();
      return;
    }

    const messages = result.issues
      .filter((issue) => issue.path?.[0].key === input.name)
      .map((issue) => issue.message);

    if (messages.length > 0) {
      input.setError(messages);
      return;
    }

    input.clearError();
  }

  #applyValidationIssues(issues: { path?: { key: string }[]; message: string }[]) {
    this.#labelledInputs.forEach((input) => {
      const messages = issues
        .filter((issue) => issue.path?.[0].key === input.name)
        .map((issue) => issue.message);

      if (messages.length > 0) {
        input.setError(messages);
        return;
      }

      input.clearError();
    });
  }

  #syncInputFocus() {
    this.#labelledInputs.forEach((input, index) => {
      input.setFocused(this.#focused && index === this.#activeFieldIndex);
    });
  }

  #updateFieldLabels() {
    this.#labelledInputs.forEach((input, index) => {
      input.setLabelTextPrefix(this.#focused && index === this.#activeFieldIndex ? "› " : "  ");
    });
  }
}

export class SkillForm extends Container implements Focusable {
  #activeFieldIndex = 0;
  #requiredAgentSkillFieldsKeys = Object.keys(RequiredAgentSkillFieldsSchema.entries);
  #labelledInputs: LabelledInput[];
  #confirmationBox: ConfirmationBox;
  #done: (value: (RequiredAgentSkillFields & { confirm: boolean }) | null) => void;
  #tui: TUI;
  #focused = false;

  get focused() {
    return this.#focused;
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#syncInputFocus();
    this.#updateFieldLabels();
  }

  constructor(
    tui: TUI,
    theme: Theme,
    done: (value: (RequiredAgentSkillFields & { confirm: boolean }) | null) => void,
  ) {
    super();
    this.#done = done;
    this.#tui = tui;

    this.#labelledInputs = this.#requiredAgentSkillFieldsKeys.map(
      (label) => new LabelledInput(label, theme),
    );
    this.#confirmationBox = new ConfirmationBox(tui, theme);

    this.#syncInputFocus();

    for (const field of [
      new Text(theme.fg("accent", "Create Skill")),
      new Spacer(1),
      ...this.#labelledInputs,
      this.#confirmationBox,
      new Spacer(1),
      new Text(theme.fg("dim", "Enter next/submit • Tab switch field • Esc cancel")),
    ]) {
      this.addChild(field);
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.#done(null);
      return;
    }

    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) {
      this.#moveFocus(1);
      return;
    }

    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.up)) {
      this.#moveFocus(-1);
      return;
    }

    if (this.#activeFieldIndex >= this.#labelledInputs.length) {
      if (matchesKey(data, Key.space)) {
        this.#confirmationBox.handleInput(data);
      }

      if (matchesKey(data, Key.enter)) {
        this.#submit();
        this.#tui.requestRender();
      }

      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.#moveFocus(1);
      return;
    }

    const activeInput = this.#labelledInputs[this.#activeFieldIndex];
    activeInput.handleInput(data);
    this.#validateField(activeInput);
    this.#tui.requestRender();
  }

  override invalidate(): void {
    super.invalidate();
    this.#updateFieldLabels();
  }

  #moveFocus(direction: 1 | -1) {
    this.#activeFieldIndex =
      (this.#activeFieldIndex + direction + this.#focusableFieldCount) %
      this.#focusableFieldCount;
    this.#syncInputFocus();
    this.#updateFieldLabels();
    this.#tui.requestRender();
  }

  get #focusableFieldCount() {
    return this.#labelledInputs.length + 1;
  }

  #submit() {
    const values = this.#getValues();
    const result = safeParse(RequiredAgentSkillFieldsSchema, values);

    if (!result.success) {
      this.#labelledInputs.forEach((input) => {
        const messages = result.issues
          .filter((issue) => issue.path?.[0].key === input.name)
          .map((issue) => issue.message);

        if (messages.length > 0) {
          input.setError(messages);
          return;
        }

        input.clearError();
      });

      this.#tui.requestRender();
      return;
    }

    this.#confirmationBox.clearError();
    this.#done({ ...result.output, confirm: this.#confirmationBox.confirmed });
  }

  #getValues() {
    return Object.fromEntries(this.#labelledInputs.map((input) => [input.name, input.value]));
  }

  #validateField(input: LabelledInput) {
    const result = safeParse(RequiredAgentSkillFieldsSchema, this.#getValues());

    if (result.success) {
      input.clearError();
      return;
    }

    const messages = result.issues
      .filter((issue) => issue.path?.[0].key === input.name)
      .map((issue) => issue.message);

    if (messages.length > 0) {
      input.setError(messages);
      return;
    }

    input.clearError();
  }

  #syncInputFocus() {
    this.#labelledInputs.forEach((input, index) => {
      input.setFocused(this.#focused && index === this.#activeFieldIndex);
    });
    this.#confirmationBox.setFocused(
      this.#focused && this.#activeFieldIndex === this.#labelledInputs.length,
    );
  }

  #updateFieldLabels() {
    this.#labelledInputs.forEach((input, index) => {
      const isActiveField = this.#focused && index === this.#activeFieldIndex;
      input.setLabelTextPrefix(isActiveField ? "› " : "  ");
    });
  }
}

export class SkillOptionalFieldsForm extends SkillDetailsForm<OptionalAgentSkillFormFields> {
  constructor(
    tui: TUI,
    theme: Theme,
    done: (value: OptionalAgentSkillFormFields | null) => void,
  ) {
    super(
      tui,
      theme,
      "Skill Details",
      ["license", "compatibility", "allowedTools"],
      OptionalAgentSkillFormFieldsSchema,
      done,
    );
  }
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

  const hasExternalFlag = flags.includes("--external");
  const hasPiFlag = flags.includes("--pi-editor");

  if (hasExternalFlag && hasPiFlag) {
    return {
      success: false as const,
      errorMessage: "Use either --external or --pi-editor, not both",
    };
  }

  for (const flag of flags) {
    if (flag !== "--external" && flag !== "--pi-editor") {
      return {
        success: false as const,
        errorMessage: `Unknown flag: ${flag}`,
      };
    }
  }

  return {
    success: true as const,
    output: {
      subcommand: subcommandResult.output,
      editMode: hasExternalFlag ? "external" : hasPiFlag ? "pi" : undefined,
    } satisfies ParsedSkillCommandArgument,
  };
}

export async function handleCreate(ctx: ExtensionCommandContext) {
  const requiredValues = await ctx.ui.custom<(RequiredAgentSkillFields & { confirm: boolean }) | null>(
    (tui, theme, _kb, done) => new SkillForm(tui, theme, done),
    { overlay: true, overlayOptions: { offsetY: -500 } },
  );

  if (!requiredValues) {
    ctx.ui.notify("Skill creation cancelled", "info");
    return;
  }

  let optionalValues: OptionalAgentSkillFrontmatterFields = {
    license: "",
    compatibility: "",
    allowedTools: "",
  };

  if (requiredValues.confirm) {
    const submittedOptionalValues = await ctx.ui.custom<OptionalAgentSkillFormFields | null>(
      (tui, theme, _kb, done) => new SkillOptionalFieldsForm(tui, theme, done),
      { overlay: true, overlayOptions: { offsetY: -500 } },
    );

    if (!submittedOptionalValues) {
      ctx.ui.notify("Skill creation cancelled", "info");
      return;
    }

    optionalValues = {
      license: submittedOptionalValues.license,
      compatibility: submittedOptionalValues.compatibility,
      allowedTools: submittedOptionalValues.allowedTools,
    };
  }

  const filePath = await createSkillFile({
    name: requiredValues.name,
    description: requiredValues.description,
    ...optionalValues,
  });

  ctx.ui.notify(`Skill created successfully: ${filePath}`);
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
  const editMode = await resolveSkillEditMode(requestedEditMode);

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

  await rm(skillPath, { force: true });
  ctx.ui.notify(`Skill deleted successfully: ${skillPath}`);
}

export async function resolveSkillEditMode(requestedEditMode?: SkillEditorMode) {
  if (requestedEditMode) {
    return requestedEditMode;
  }

  const projectConfig = await readProjectEditorConfig();
  return projectConfig.skillEditor ?? "pi";
}

export async function readProjectEditorConfig() {
  try {
    const config = await readFile(PROJECT_EDITOR_CONFIG_PATH, "utf8");
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

      const editorMatch = trimmedLine.match(/^editor\s*=\s*"(pi|external)"$/);
      if (editorMatch) {
        return { skillEditor: editorMatch[1] as SkillEditorMode };
      }
    }

    return { skillEditor: undefined };
  } catch {
    return { skillEditor: undefined };
  }
}

export async function createSkillFile(fields: SkillFrontmatterFields) {
  const skillDirectory = join(SKILLS_DIRECTORY, fields.name);
  const skillPath = join(skillDirectory, "SKILL.md");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(skillPath, renderSkillMarkdown(fields), "utf8");
  return skillPath;
}

export function renderSkillMarkdown(fields: SkillFrontmatterFields) {
  const frontmatter = [
    "---",
    `name: ${formatYamlValue(fields.name)}`,
    `description: ${formatYamlValue(fields.description)}`,
    ...(fields.license ? [`license: ${formatYamlValue(fields.license)}`] : []),
    ...(fields.compatibility ? [`compatibility: ${formatYamlValue(fields.compatibility)}`] : []),
    ...(fields.allowedTools ? [`allowed-tools: ${formatYamlValue(fields.allowedTools)}`] : []),
    "---",
  ].join("\n");

  return `${frontmatter}\n\n# ${humanizeSkillName(fields.name)}\n\n${fields.description}\n`;
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

  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
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
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));

    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    } satisfies Component;
  }, { overlay: true, overlayOptions: { offsetY: -500 } });
}

export async function listSkillNames() {
  try {
    const entries = await readdir(SKILLS_DIRECTORY, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function openExternalEditor(editor: string, filePath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [filePath], { stdio: "inherit", shell: true });

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

export async function readSkillFile(filePath: string) {
  return readFile(filePath, "utf8");
}
