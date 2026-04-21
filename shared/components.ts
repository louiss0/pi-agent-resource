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

type FormOptions = {
  title: string;
  fields: FormField[];
  footer?: string;
  spacing?: number;
};

export class Form extends Container implements Focusable {
  #activeFieldIndex = 0;
  #focused = false;
  #fields: FormField[];
  #titleText: Text;
  #footerText: Text;
  #spacing: number;
  #title: string;
  #footer: string;

  constructor(
    private tui: TUI,
    private done: (value?: unknown | null) => void,
    options: FormOptions,
  ) {
    super();

    this.#title = options.title;
    this.#footer = options.footer ?? "";

    this.#fields = options.fields;
    this.#spacing = options.spacing ?? 2;
    this.#titleText = new Text(this.#title);
    this.#footerText = new Text(this.#footer);

    const children: Component[] = [this.#titleText, ...this.#fields];

    if (this.#footer.length > 0) {
      children.push(this.#footerText);
    }

    children.forEach((child, index) => {
      this.addChild(child);

      if (index < children.length - 1) {
        this.addChild(new Spacer(this.#spacing));
      }
    });
  }

  get focused() {
    return this.#focused;
  }

  set focused(value: boolean) {
    this.#focused = value;
    this.#syncFieldFocus();
  }

  override render(width: number): string[] {
    const lines = super.render(width);

    lines[0] = this.#centerLine(this.#title, width);

    if (this.#footer.length > 0) {
      lines[lines.length - 1] = truncateToWidth(this.#footer, width);
    }

    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.done(null);
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
      if (this.#fields.length === 0 || this.#activeFieldIndex === this.#fields.length - 1) {
        this.done();
        return;
      }

      this.#moveFocus(1);
      return;
    }

    this.#fields[this.#activeFieldIndex]?.handleInput(data);
    this.tui.requestRender();
  }

  #moveFocus(direction: 1 | -1) {
    if (this.#fields.length === 0) {
      this.tui.requestRender();
      return;
    }

    this.#activeFieldIndex =
      (this.#activeFieldIndex + direction + this.#fields.length) % this.#fields.length;
    this.#syncFieldFocus();
    this.tui.requestRender();
  }

  #syncFieldFocus() {
    this.#fields.forEach((field, index) => {
      field.setFocused(this.#focused && index === this.#activeFieldIndex);
    });
  }

  #centerLine(text: string, width: number) {
    if (text.length >= width) {
      return truncateToWidth(text, width);
    }

    const leftPaddingWidth = Math.floor((width - text.length) / 2);
    const rightPaddingWidth = width - text.length - leftPaddingWidth;
    return `${" ".repeat(leftPaddingWidth)}${text}${" ".repeat(rightPaddingWidth)}`;
  }
}
