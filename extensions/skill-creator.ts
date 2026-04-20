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

  setError(text: string) {
    this.#errorText.setText(this.#theme.fg("error", text));
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

export class SkillForm extends Container implements Focusable {
  #activeFieldIndex = 0;

  #requiredAgentSkillFieldsKeys = Object.keys(RequiredAgentSkillFieldsSchema.entries);
  #labelledInputs: LabelledInput[];
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

    this.#syncInputFocus();

    for (const field of [
      new Text(theme.fg("accent", "Create Skill")),
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
      if (this.#activeFieldIndex < this.#labelledInputs.length - 1) {
        this.#moveFocus(1);
        return;
      }

      this.#submit();
      return;
    }

    this.#labelledInputs[this.#activeFieldIndex].handleInput(data);
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
    const result = safeParse(
      RequiredAgentSkillFieldsSchema,
      Object.fromEntries(this.#labelledInputs.map((input) => [input.name, input.value])),
    );

    if (!result.success) {
      this.#labelledInputs.forEach((input) => {
        const issues = result.issues.filter((issue) => issue.path?.[0].key === input.name);
        if (issues) {
          input.setError(issues.map((issue) => issue.message).join("\n"));
        }
      });

      this.#tui.requestRender();
    } else {
      this.#done(result.output);
    }
  }

  #syncInputFocus() {
    this.#labelledInputs.forEach((input, index) => {
      input.setFocused(this.#focused && index === this.#activeFieldIndex);
    });
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
