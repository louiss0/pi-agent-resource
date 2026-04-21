import { type ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, Key, type TUI } from "@mariozechner/pi-tui";

vi.mock("@mariozechner/pi-tui", async () => {
  const module =
    await vi.importActual<typeof import("@mariozechner/pi-tui")>("@mariozechner/pi-tui");

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

import { SubCommands } from "../shared/subcommands";
import { generateCommandHandlerUsingDeps, SkillForm } from "./skill-creator";

describe("Skill Creator", () => {
  function createSkillForm(themeOverride?: Theme) {
    const done = vi.fn();
    const tui = {
     requestRender: vi.fn(),
    } as unknown as TUI;
    const theme =
      themeOverride ??
      ({
        fg: (_color: string, text: string) => text,
      } as unknown as Theme);
    const form = new SkillForm(tui, theme, done);

    form.focused = true;

    return { form, done, tui };
  }

  function enterText(form: SkillForm, text: string) {
    for (const character of text) {
      form.handleInput(character);
    }
  }

  function renderForm(form: SkillForm) {
    return form.render(45).join("\n");
  }

  function renderFormLines(form: SkillForm) {
    return form.render(45);
  }

  function findLineIndex(lines: string[], text: string) {
    return lines.findIndex((line) => line.includes(text));
  }

  function pressKey(form: SkillForm, key: string) {
    form.handleInput(key);
  }

  describe("SkillForm", () => {
    it("renders a skill form", () => {
      const { form } = createSkillForm();
      assertInitialFormRender(renderFormLines, form, findLineIndex);
    });

    it("should show errors under both inputs only after an invalid submit", () => {
      const { form, done } = createSkillForm();

      expect(renderForm(form)).not.toContain("Name is required");
      expect(renderForm(form)).not.toContain("Description is required");

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();
      const lines = renderFormLines(form);
      const nameLabelIndex = findLineIndex(lines, "name");
      const descriptionLabelIndex = findLineIndex(lines, "description");
      const inputIndexes = lines
        .map((line, index) => (line.includes(">") ? index : -1))
        .filter((index) => index > -1);

      expect(inputIndexes).toHaveLength(3);

      const nameErrorIndex = findLineIndex(lines, "Name is required");
      const descriptionErrorIndex = findLineIndex(lines, "Description is required");

      const [nameInputIndex, descriptionInputIndex] = inputIndexes;

      expect(nameLabelIndex).toBeGreaterThan(-1);
      expect(descriptionLabelIndex).toBeGreaterThan(nameLabelIndex);
      expect(nameInputIndex).toBeGreaterThan(nameLabelIndex);
      expect(nameErrorIndex).toBeGreaterThan(nameInputIndex);
      expect(nameErrorIndex).toBeLessThan(descriptionLabelIndex);
      expect(descriptionInputIndex).toBeGreaterThan(descriptionLabelIndex);
      expect(descriptionErrorIndex).toBeGreaterThan(descriptionInputIndex);
      expect(renderForm(form)).toContain("[x] Do you want to fill in the next fields?");
    });

    it("should render validation errors using the error theme color", () => {
      const theme = new Theme(
        {
          error: "#ff0000",
          accent: "#00ffff",
          dim: "#888888",
        } as ConstructorParameters<typeof Theme>[0],
        {} as ConstructorParameters<typeof Theme>[1],
        "truecolor",
      );
      const { form } = createSkillForm(theme);

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      const lines = renderFormLines(form);
      const nameErrorLine = lines.find((line) => line.includes("Name is required"));
      const descriptionErrorLine = lines.find((line) =>
        line.includes("Description is required"),
      );
      const errorAnsi = theme.getFgAnsi("error");

      expect(nameErrorLine).toContain(`${errorAnsi}Name is required`);
      expect(descriptionErrorLine).toContain(`${errorAnsi}Description is required`);
    });

    it("should submit the entered values with the correct field mapping", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      enterText(form, "Useful skill description");

      expect(renderForm(form)).toContain("test-skill");
      expect(renderForm(form)).toContain("Useful skill description");

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        name: "test-skill",
        description: "Useful skill description",
      });
    });

    it("should show an error only for the missing description when the name is valid", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();
      expect(renderForm(form)).not.toContain("Name is required");
      expect(renderForm(form)).toContain("Description is required");
      expect(renderForm(form)).toContain("[x] Do you want to fill in the next fields?");
    });

    it("should allow cancelling even when the active field is invalid", () => {
      const { form, done } = createSkillForm();

      pressKey(form, Key.escape);

      expect(done).toHaveBeenCalledWith(null);
    });
  });

  describe("Testing generateCommandHandlerUsingDeps", () => {
    let handler: ReturnType<typeof generateCommandHandlerUsingDeps>;

    function createContext() {
      const context: { ui: Partial<ExtensionCommandContext["ui"]> } = {
        ui: {
          notify: vi.fn(),
          custom: vi.fn(),
        },
      };

      return context as unknown as ExtensionCommandContext;
    }

    beforeAll(() => {
      handler = generateCommandHandlerUsingDeps({});
    });

    it("should notify on invalid command", async () => {
      const context = createContext();
      await handler("invalid", context);

      expect(context.ui.notify).toHaveBeenCalledWith(
        'Invalid command: × Invalid type: Expected ("create" | "edit" | "delete") but received "invalid"',
        "error",
      );
    });

    it(`should work when ${SubCommands.CREATE} is called`, async () => {
      const context = createContext();

      vi.mocked(context.ui.custom).mockResolvedValueOnce({
        name: "test-skill",
        description: "Test description",
      });

      await handler("create", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill created successfully");
    });

    it("should notify when skill creation is cancelled", async () => {
      const context = createContext();
      vi.mocked(context.ui.custom).mockResolvedValueOnce(null);

      await handler("create", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill creation cancelled", "info");
    });

    it(`should work when ${SubCommands.EDIT} is called`, async () => {
      const context = createContext();
      await handler("edit", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill edited successfully");
    });

    it(`should work when ${SubCommands.DELETE} is called`, async () => {
      const context = createContext();
      await handler("delete", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill deleted successfully");
    });
  });
});

function assertInitialFormRender(
  renderFormLines: (form: SkillForm) => string[],
  form: SkillForm,
  findLineIndex: (lines: string[], text: string) => number,
) {
  const lines = renderFormLines(form);
  const createSkillIndex = findLineIndex(lines, "Create Skill");
  expect(createSkillIndex).toBe(1);
  const nameLabelIndex = findLineIndex(lines, "name");
  const descriptionLabelIndex = findLineIndex(lines, "description");
  const inputIndexes = lines
    .map((line, index) => (line.includes(">") ? index : -1))
    .filter((index) => index > -1);

  const confirmNextFieldsLabelIndex = findLineIndex(
    lines,
    "[] Do you want to fill in the next fields?",
  );

  expect(inputIndexes).toHaveLength(2);
  const [nameInputIndex, descriptionInputIndex] = inputIndexes;
  expect(nameInputIndex).toBeGreaterThan(nameLabelIndex);
  expect(descriptionInputIndex).toBeGreaterThan(descriptionLabelIndex);
  expect(confirmNextFieldsLabelIndex).toBeGreaterThan(descriptionInputIndex);
}
