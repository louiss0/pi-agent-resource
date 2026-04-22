import { Theme } from "@mariozechner/pi-coding-agent";
import { Container, Key, Text, type TUI } from "@mariozechner/pi-tui";

vi.mock("@mariozechner/pi-tui", async () => {
  const module =
    await vi.importActual<typeof import("@mariozechner/pi-tui")>("@mariozechner/pi-tui");

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

import { ConfirmationBox, Form, type FormField, LabelledInput } from "./components";

describe("shared/components", () => {
  class TestField extends Container implements FormField {
    inputs: string[] = [];
    focusedStates: boolean[] = [];
    focused = false;

    constructor(private label: string) {
      super();
      this.addChild(new Text(label));
    }

    setFocused(focused: boolean) {
      this.focused = focused;
      this.focusedStates.push(focused);
    }

    handleInput(data: string) {
      this.inputs.push(data);
    }
  }

  const errorColor = "#ff0000";
  const accentColor = "#00ffff";
  const dimColor = "#888888";
  function createTheme() {
    const theme = new Theme(
      {
        error: errorColor,
        accent: accentColor,
        dim: dimColor,
      } as ConstructorParameters<typeof Theme>[0],
      {} as ConstructorParameters<typeof Theme>[1],
      "truecolor",
    );
    return theme;
  }

  function createTui() {
    return {
      requestRender: vi.fn(),
    } as unknown as TUI;
  }

  describe("LabelledInput", () => {
    it("renders the label, typed value, and error messages", () => {
      const input = new LabelledInput("name", createTheme());

      input.setLabelTextPrefix("› ");
      input.setFocused(true);
      input.handleInput("t");
      input.handleInput("e");
      input.handleInput("s");
      input.handleInput("t");
      input.setError("Name is required", "Must be lowercase");

      const lines = input.render(45).join("\n");

      expect(lines).toContain("› name");
      expect(lines).toContain("test");
      expect(lines).toContain("Name is required");
      expect(lines).toContain("Must be lowercase");
    });

    it("clears error messages", () => {
      const input = new LabelledInput("description", createTheme());

      input.setError("Description is required");
      input.clearError();

      expect(input.render(45).join("\n")).not.toContain("Description is required");
    });
  });

  describe("ConfirmationBox", () => {
    it("renders unchecked by default", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);
      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`  ${theme.getFgAnsi("accent")} [ ]`);
      expect(lines).toContain(" Do you want to fill in the next fields?");
    });

    it("renders the focused prefix when focused", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);

      checkbox.setFocused(true);

      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`> ${theme.getFgAnsi("accent")} [ ]`);
      expect(lines).toContain(" Do you want to fill in the next fields?");
    });

    it("toggles to confirmed when space is pressed", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);

      checkbox.setFocused(true);
      checkbox.handleInput(Key.space);

      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`> ${theme.getFgAnsi("accent")} [x]`);
      expect(lines).toContain(" Do you want to fill in the next fields?");
    });

    it("toggles back to unchecked when space is pressed twice", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);

      checkbox.handleInput(Key.space);
      checkbox.handleInput(Key.space);

      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`  ${theme.getFgAnsi("accent")} [ ]`);
      expect(lines).toContain(" Do you want to fill in the next fields?");
    });

    it("confirms the box without toggling it back off", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);

      checkbox.confirm();
      checkbox.confirm();

      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`  ${theme.getFgAnsi("accent")} [x]`);
      expect(lines).toContain(" Do you want to fill in the next fields?");
    });

    it("the checkbox is colored", () => {
      const theme = createTheme();
      const checkbox = new ConfirmationBox(theme);
      const lines = checkbox.render(45).join("\n");

      expect(lines).toContain(`${theme.getFgAnsi("accent")} [ ]`);
      expect(lines).not.toContain(
        `${theme.getFgAnsi("accent")} [ ] Do you want to fill in the next fields?`,
      );
    });
  });

  describe("Form", () => {
    function createForm(title: string, fields: FormField[], footer = "", spacing?: number) {
      const tui = createTui();
      const done = vi.fn();
      const form = new Form(tui, done, {
        title,
        fields,
        footer,
        spacing,
      });

      form.focused = true;

      return { form, tui, done };
    }

    it("submits a object with the correct values based on names ", () => {
      const { form, done } = createForm("Title", [
        new TestField("field-1"),
        new TestField("field-2"),
      ]);

      form.handleInput("a");
      form.handleInput(Key.enter);
      form.handleInput("b");
      form.handleInput(Key.enter);

      expect(done).toHaveBeenCalledWith({ "field-1": "a", "field-2": "b" });
    });

    it("submits a object with the correct values based on names with booleans", () => {
      const { form, done } = createForm("Title", [
        new TestField("field-1"),
        new TestField("field-2"),
        new TestConfirmationBox("field-3", "Confirm"),
      ]);

      form.handleInput("a");
      form.handleInput(Key.enter);
      form.handleInput("b");
      form.handleInput(Key.enter);
      form.handleInput(Key.enter);

      expect(done).toHaveBeenCalledWith({ "field-1": "a", "field-2": "b", "field-3": false });
    });

    it("submits a object with the correct values based on names with that have changed", () => {
      const { form, done } = createForm("Title", [
        new TestField("field-1"),
        new TestField("field-2"),
        new TestConfirmationBox("field-3", "Confirm"),
      ]);

      form.handleInput("a");
      form.handleInput(Key.enter);
      form.handleInput("b");
      form.handleInput(Key.enter);
      form.handleInput(Key.space);
      form.handleInput(Key.enter);

      expect(done).toHaveBeenCalledWith({ "field-1": "a", "field-2": "b", "field-3": true });
    });

    it("renders the title centered", () => {
      const { form } = createForm("Title", []);

      const lines = form.render(45);
      const firstLine = lines[0];

      expect(firstLine).toContain("Title");

      const centeredTextRegex = /\s+\S+\s+/;
      expect(firstLine).toMatch(centeredTextRegex);
    });

    it("renders the footer", () => {
      const { form } = createForm("Title", [], "Footer");

      const lines = form.render(45);

      expect(lines.at(-1)).toContain("Footer");
    });

    it("renders the default spacing between all children", () => {
      const { form } = createForm(
        "Title",
        [new TestField("field-1"), new TestField("field-2")],
        "Footer",
      );

      const lines = form.render(45);
      const emptyLineCount = lines.filter((line) => line === "").length;

      expect(emptyLineCount).toBe(6);
    });

    it("renders custom spacing between all children", () => {
      const { form } = createForm(
        "Title",
        [new TestField("field-1"), new TestField("field-2")],
        "Footer",
        1,
      );

      const lines = form.render(45);
      const emptyLineCount = lines.filter((line) => line === "").length;

      expect(emptyLineCount).toBe(3);
    });

    it("focuses the first field when the form becomes focused", () => {
      const firstField = new TestField("");
      createForm("Title", [firstField]);

      expect(firstField.focused).toBe(true);
    });

    it("delegates regular input to the active field", () => {
      const firstField = new TestField("");
      const secondField = new TestField("");
      const { form } = createForm("Title", [firstField, secondField]);

      form.handleInput("a");

      expect(firstField.inputs).toEqual(["a"]);
      expect(secondField.inputs).toEqual([]);
    });

    it("moves focus forward on enter and tab", () => {
      const firstField = new TestField("");
      const secondField = new TestField("");

      const { form, tui } = createForm("Title", [firstField, secondField]);

      form.handleInput(Key.enter);

      expect(firstField.focused).toBe(false);
      expect(secondField.focused).toBe(true);

      form.handleInput(Key.tab);

      expect(firstField.focused).toBe(true);
      expect(secondField.focused).toBe(false);
      expect(tui.requestRender).toHaveBeenCalled();
    });

    it("moves focus backward on shift tab and up", () => {
      const firstField = new TestField("");
      const secondField = new TestField("");

      const { form } = createForm("Title", [firstField, secondField]);

      form.handleInput(Key.tab);
      form.handleInput(Key.shift("tab"));
      expect(firstField.focused).toBe(true);
      expect(secondField.focused).toBe(false);

      form.handleInput(Key.down);
      form.handleInput(Key.up);
      expect(firstField.focused).toBe(true);
      expect(secondField.focused).toBe(false);
    });

    it("submits when enter is pressed on the last field", () => {
      const { form, done } = createForm("Title", [new TestField("")]);

      form.handleInput(Key.tab);
      form.handleInput(Key.enter);

      expect(done).toHaveBeenCalledTimes(1);

      expect(done).not.toHaveBeenCalledWith(null);
    });

    it("cancels on escape", () => {
      const { form, done } = createForm("Title", [new TestField("")]);

      form.handleInput(Key.escape);

      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null);
    });
  });
});
