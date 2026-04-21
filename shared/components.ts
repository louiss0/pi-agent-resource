import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Container,
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
