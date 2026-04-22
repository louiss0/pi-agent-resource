import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, type TUI } from "@mariozechner/pi-tui";
import {
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
}
const RequiredAgentSkillFieldsSchema = object({
  name: pipe(
    string(),
    minLength(1, "Name is required"),
    regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with dashes only"),
  ),
  description: pipe(string(), minLength(1, "Description is required"), maxLength(255)),
});

type RequiredAgentSkillFieldsSchema = InferOutput<typeof RequiredAgentSkillFieldsSchema>;
type RequiredAgentSkillFormValues = RequiredAgentSkillFieldsSchema & { confirmation: boolean };

const parseRequiredAgentSkillFields: Parse<RequiredAgentSkillFormValues> = (values) => {
  const result = safeParse(RequiredAgentSkillFieldsSchema, values);

  if (result.success) {
    return undefined;
  }

  const errors = new Map<string, string>();

  for (const issue of result.issues) {
    const key = issue.path?.[0].key;

    if (typeof key !== "string") {
      continue;
    }

    const currentError = errors.get(key);
    errors.set(key, currentError ? `${currentError}\n${issue.message}` : issue.message);
  }

  return Object.fromEntries(errors.entries()) as Record<keyof RequiredAgentSkillFieldsSchema, string>;
};

export class SkillForm extends Form<RequiredAgentSkillFormValues> {
  constructor(
    tui: TUI,
    theme: Theme,
    done: (value: RequiredAgentSkillFieldsSchema | null) => void,
  ) {
    const labelledInputs = Object.keys(RequiredAgentSkillFieldsSchema.entries).map(
      (label) => new LabelledInput(label, theme),
    );
    const confirmationBox = new ConfirmationBox(
      theme,
      "Do you want to fill in the next fields?",
      "confirmation",
    );

    super(
      tui,
      (value) => {
        if (value == null) {
          done(null);
          return;
        }

        const { confirmation: _confirmation, ...fields } = value as RequiredAgentSkillFieldsSchema & {
          confirmation: boolean;
        };
        done(fields);
      },
      {
        title: "Create Skill",
        fields: [...labelledInputs, confirmationBox],
        parse: parseRequiredAgentSkillFields,
        footer: theme.fg("dim", "Enter next/submit • Tab switch field • Esc cancel"),
        spacing: 1,
      },
    );
  }

  protected override updateFieldFocus(field: LabelledInput | ConfirmationBox, focused: boolean) {
    field.setFocused(focused);

    if (field instanceof LabelledInput) {
      field.setLabelTextPrefix(focused ? "› " : "  ");
    }
  }

  protected override syncFieldError(field: LabelledInput | ConfirmationBox, error?: string) {
    if (error !== undefined) {
      field.setError(error);
      return;
    }

    if (field instanceof LabelledInput || field instanceof ConfirmationBox) {
      field.clearError();
    }
  }
}

async function handleCreate(ctx: ExtensionContext) {
  const formValues = await ctx.ui.custom<RequiredAgentSkillFieldsSchema | null>(
    (tui, theme, _kb, done) => new SkillForm(tui, theme, done),
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
