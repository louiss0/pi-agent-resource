import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  type Component,
  type Focusable,
  Input,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
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
    this.#errorText.setText(messages.map((message) => this.#theme.fg("error", message)).join("\n"));
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

type ConfirmationBoxProps = {
  onChange?: (confirmed: boolean) => void;
};

class ConfirmationBox implements Component {
  #confirmed = false;
  #focused = false;

  constructor(private props: ConfirmationBoxProps = {}) {}

  get confirmed() {
    return this.#confirmed;
  }

  setFocused(focused: boolean) {
    this.#focused = focused;
  }

  confirm() {
    if (this.#confirmed) {
      return;
    }

    this.#confirmed = true;
    this.props.onChange?.(this.#confirmed);
  }

  toggle() {
    this.#confirmed = !this.#confirmed;
    this.props.onChange?.(this.#confirmed);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
      this.toggle();
    }
  }

  render(width: number): string[] {
    const box = this.#confirmed ? "[x]" : "[]";
    const prefix = this.#focused ? "> " : "  ";
    return [truncateToWidth(`${prefix}${box} Do you want to fill in the next fields?`, width)];
  }

  invalidate(): void {}
}

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
    this.#confirmationBox = new ConfirmationBox({
      onChange: () => {
        this.#tui.requestRender();
      },
    });

    this.#syncInputFocus();

    for (const field of [
      new Text(theme.fg("accent", "Create Skill")),
      new Spacer(1),
      ...this.#labelledInputs,
      this.#confirmationBox,
      new Spacer(1),
      new Text(theme.fg("dim", "Enter next/submit • Tab switch field • Enter confirm • Esc cancel")),
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

    if (this.#activeFieldIndex === this.#labelledInputs.length) {
      if (matchesKey(data, Key.space)) {
        this.#confirmationBox.handleInput(data);
        this.#tui.requestRender();
      }

      if (matchesKey(data, Key.enter)) {
        if (!this.#confirmationBox.confirmed) {
          this.#confirmationBox.confirm();
          this.#tui.requestRender();
          return;
        }

        this.#submit();
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
    if (!this.#confirmationBox.confirmed) {
      this.#tui.requestRender();
      return;
    }

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
