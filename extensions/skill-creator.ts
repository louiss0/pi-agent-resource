import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  type Focusable,
  Input,
  Key,
  matchesKey,
  Spacer,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
import {
  maxLength,
  minLength,
  object,
  pipe,
  regex,
  safeParse,
  string,
  summarize,
} from "valibot";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  parseSubCommandValuesFromArgument,
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
    const result = parseSubCommandValuesFromArgument(arg);

    if (!result.success) {
      ctx.ui.notify(`Invalid command: ${summarize(result.issues)}`, "error");
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

const skillFieldSchemas = {
  name: pipe(
    string(),
    minLength(1, "Name is required"),
    regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with dashes only"),
  ),
  description: pipe(
    string(),
    minLength(1, "Description is required"),
    maxLength(255, "Description must be 255 characters or fewer"),
  ),
};

const skillInfoSchema = object(skillFieldSchemas);

type SkillFormValues = {
  name: string;
  description: string;
};

type SkillFieldName = keyof SkillFormValues;

const skillFieldNames: SkillFieldName[] = ["name", "description"];
const skillFieldLabels: Record<SkillFieldName, string> = {
  name: "Name",
  description: "Description",
};

function getSkillFieldError(field: SkillFieldName, value: string): string | null {
  const result = safeParse(skillFieldSchemas[field], value);

  if (result.success) {
    return null;
  }

  return summarize(result.issues);
}

export class SkillForm extends Container implements Focusable {
  #activeFieldIndex = 0;
  #inputs: Input[];
  #fieldLabels: Text[];
  #errorLabels: Text[];
  #done: (value: SkillFormValues | null) => void;
  #theme: Theme;
  #tui: TUI;
  #focused = false;
  #shouldShowValidationErrors = false;

  get focused() {
    return this.#focused;
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#syncInputFocus();
    this.#updateFieldLabels();
  }

  constructor(tui: TUI, theme: Theme, done: (value: SkillFormValues | null) => void) {
    super();
    this.#done = done;
    this.#theme = theme;
    this.#tui = tui;

    const nameInput = new Input();
    const descriptionInput = new Input();
    const nameLabel = new Text("");
    const descriptionLabel = new Text("");
    const nameError = new Text("");
    const descriptionError = new Text("");

    this.#inputs = [nameInput, descriptionInput];
    this.#fieldLabels = [nameLabel, descriptionLabel];
    this.#errorLabels = [nameError, descriptionError];
    this.#syncInputFocus();
    this.#updateFieldLabels();

    for (const field of [
      new Text(theme.fg("accent", "Create skill")),
      new Spacer(1),
      nameLabel,
      nameInput,
      nameError,
      new Spacer(1),
      descriptionLabel,
      descriptionInput,
      descriptionError,
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

    if (matchesKey(data, Key.enter)) {
      if (this.#activeFieldIndex < this.#inputs.length - 1) {
        this.#moveFocus(1);
        return;
      }

      this.#submit();
      return;
    }

    this.#inputs[this.#activeFieldIndex].handleInput(data);
    this.#validateField(this.#activeFieldIndex, this.#shouldShowValidationErrors);
    this.#tui.requestRender();
  }

  override invalidate(): void {
    super.invalidate();
    this.#updateFieldLabels();
  }

  #moveFocus(direction: 1 | -1) {
    this.#activeFieldIndex =
      (this.#activeFieldIndex + direction + this.#inputs.length) % this.#inputs.length;
    this.#syncInputFocus();
    this.#updateFieldLabels();
    this.#tui.requestRender();
  }

  #submit() {
    const values = this.#getValues();

    this.#shouldShowValidationErrors = true;

    const firstInvalidFieldIndex = this.#validateAllFields();

    if (firstInvalidFieldIndex !== undefined) {
      this.#activeFieldIndex = firstInvalidFieldIndex;
      this.#syncInputFocus();
      this.#updateFieldLabels();
      this.#tui.requestRender();
      return;
    }

    this.#done(values);
  }

  #getValues(): SkillFormValues {
    return {
      name: this.#inputs[0].getValue(),
      description: this.#inputs[1].getValue(),
    };
  }

  #validateAllFields() {
    let firstInvalidFieldIndex: number | undefined;

    this.#inputs.forEach((_input, index) => {
      const isValid = this.#validateField(index, true);

      if (!isValid && firstInvalidFieldIndex === undefined) {
        firstInvalidFieldIndex = index;
      }
    });

    return firstInvalidFieldIndex;
  }

  #validateField(index: number, showError = false) {
    const field = skillFieldNames[index];
    const error = getSkillFieldError(field, this.#inputs[index].getValue());

    this.#errorLabels[index].setText(error && showError ? this.#theme.fg("error", error) : "");
    return error === null;
  }

  #syncInputFocus() {
    this.#inputs?.forEach((input, index) => {
      input.focused = this.#focused && index === this.#activeFieldIndex;
    });
  }

  #updateFieldLabels() {
    this.#fieldLabels?.forEach((label, index) => {
      const isActiveField = this.#focused && index === this.#activeFieldIndex;
      const prefix = isActiveField ? this.#theme.fg("accent", "› ") : "  ";
      const text = isActiveField
        ? this.#theme.fg("accent", skillFieldLabels[skillFieldNames[index]])
        : skillFieldLabels[skillFieldNames[index]];

      label.setText(`${prefix}${text}`);
    });
  }
}

async function handleCreate(ctx: ExtensionContext) {
  const formValues = await ctx.ui.custom<SkillFormValues | null>(
    (tui, theme, _kb, done) => new SkillForm(tui, theme, done),
    { overlay: true, overlayOptions: { offsetY: -500 } },
  );

  if (!formValues) {
    ctx.ui.notify("Skill creation cancelled", "info");
    return;
  }

  const result = safeParse(skillInfoSchema, formValues);
  if (!result.success) {
    ctx.ui.notify(`Invalid form: ${summarize(result.issues)}`, "error");
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
