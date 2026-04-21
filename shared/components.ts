import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Container,
  type Focusable,
  Input,
  Key,
  matchesKey,
  Spacer,
  Text,
  type TUI,
  truncateToWidth,
} from "@mariozechner/pi-tui";

export class LabelledInput extends Container {
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

  setError(...messages: string[]) {
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

export class ConfirmationBox implements Component {
  #confirmed = false;
  #focused = false;
  #tui: TUI;

  constructor(tui: TUI) {
    this.#tui = tui;
  }

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
    this.#tui.requestRender();
  }

  toggle() {
    this.#confirmed = !this.#confirmed;
    this.#tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.space)) {
      this.toggle();
    }
  }

  render(width: number): string[] {
    const box = this.#confirmed ? "[x]" : "[ ]";
    const prefix = this.#focused ? "> " : "  ";
    return [truncateToWidth(`${prefix}${box} Do you want to fill in the next fields?`, width)];
  }

  invalidate(): void {}
}

export type FormField = Component & {
  setFocused: (focused: boolean) => void;
  handleInput: (data: string) => void;
};

type FormProps = {
  tui: TUI;
  fields: FormField[];
  onSubmit?: () => void;
  onCancel?: () => void;
};

export class Form extends Container implements Focusable {
  #activeFieldIndex = 0;
  #focused = false;

  constructor(private props: FormProps) {
    super();

    for (const field of props.fields) {
      this.addChild(field);
    }
  }

  get focused() {
    return this.#focused;
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#syncFieldFocus();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.props.onCancel?.();
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
      if (this.#activeFieldIndex === this.props.fields.length - 1) {
        this.props.onSubmit?.();
        return;
      }

      this.#moveFocus(1);
      return;
    }

    this.props.fields[this.#activeFieldIndex]?.handleInput(data);
    this.props.tui.requestRender();
  }

  #moveFocus(direction: 1 | -1) {
    this.#activeFieldIndex =
      (this.#activeFieldIndex + direction + this.props.fields.length) %
      this.props.fields.length;
    this.#syncFieldFocus();
    this.props.tui.requestRender();
  }

  #syncFieldFocus() {
    this.props.fields.forEach((field, index) => {
      field.setFocused(this.#focused && index === this.#activeFieldIndex);
    });
  }
}
