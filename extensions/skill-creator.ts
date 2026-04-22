import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  type Focusable,
  Key,
  matchesKey,
  Spacer,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
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
import { ConfirmationBox, LabelledInput } from "../shared/components";
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

export class SkillForm extends Container implements Focusable {
  #activeFieldIndex = 0;

  #requiredAgentSkillFieldsKeys = Object.keys(RequiredAgentSkillFieldsSchema.entries);
  #labelledInputs: LabelledInput[];
  #confirmationBox: ConfirmationBox;
  #done: (value: RequiredAgentSkillFieldsSchema | null) => void;
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
    done: (value: RequiredAgentSkillFieldsSchema | null) => void,
  ) {
    super();
    this.#done = done;
    this.#tui = tui;

    this.#labelledInputs = this.#requiredAgentSkillFieldsKeys.map(
      (label) => new LabelledInput(label, theme),
    );
    this.#confirmationBox = new ConfirmationBox(theme, "confirmation");

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
          input.setError(...messages);
          return;
        }

        input.clearError();
      });

      this.#tui.requestRender();
      return;
    }

    this.#done(result.output);
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
      input.setError(...messages);
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
