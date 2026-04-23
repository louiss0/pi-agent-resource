import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, type TUI } from "@mariozechner/pi-tui";
import {
  boolean,
  fallback,
  type InferOutput,
  maxLength,
  minLength,
  object,
  pipe,
  regex,
  safeParse,
  string,
} from "valibot";
import { ConfirmationBox, Form, LabelledInput, type Parse } from "../shared/components";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  SubCommands,
} from "../shared/subcommands";

export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:skill", {
    description: "This is for creating a new skill",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("skill"),
    handler: generateCommandHandlerUsingDeps({}),
  });
};

type Dependencies = Record<string, unknown>;

export function generateCommandHandlerUsingDeps(
  _dependency: Dependencies,
): RegisteredCommand["handler"] {
  return async (arg, ctx) => {
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
        handleEdit(ctx);
        break;
      case "delete":
        handleDelete(ctx);
        break;
    }
  };
};

const RequiredAgentSkillFieldsSchema = object({
  name: pipe(
    string(),
    minLength(1, "Name is required"),
    regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with dashes only"),
  ),
  description: pipe(string(), minLength(1, "Description is required"), maxLength(255)),
});

const RequiredSkillFormSchema = object({
  ...RequiredAgentSkillFieldsSchema.entries,
  confirmation: fallback(boolean(), false),
});

type RequiredAgentSkillFieldsSchema = InferOutput<typeof RequiredAgentSkillFieldsSchema>;
type RequiredSkillFormValues = InferOutput<typeof RequiredSkillFormSchema>;

export function createSkillForm(
  tui: TUI,
  theme: Theme,
  done: (value: RequiredSkillFormValues | null) => void,
) {
  const labelledInputs = Object.keys(RequiredAgentSkillFieldsSchema.entries).map(
    (label) => new LabelledInput(label, theme),
  );
  const confirmationBox = new ConfirmationBox(
    theme,
    "Do you want to fill in the next fields?",
    "confirmation",
  );

  return new Form<RequiredSkillFormValues>(tui, done, {
    title: "Create Skill",
    fields: [...labelledInputs, confirmationBox],
    parse: parseRequiredAgentSkillFields,
    footer: theme.fg("dim", "Enter next/submit • Tab switch field • Esc cancel"),
    spacing: 1,
  });
}

async function handleCreate(ctx: ExtensionContext) {
  const formValues = await ctx.ui.custom<RequiredSkillFormValues | null>(
    (tui, theme, _kb, done) => createSkillForm(tui, theme, done),
    { overlay: true, overlayOptions: { offsetY: -500 } },
  );

  if (!formValues) {
    ctx.ui.notify("Skill creation cancelled", "info");
    return;
  }

  ctx.ui.notify("Skill created successfully");
}

function handleEdit(ctx: ExtensionContext) {
  ctx.ui.notify("Skill edited successfully");
}

function handleDelete(ctx: ExtensionContext) {
  ctx.ui.notify("Skill deleted successfully");
}
