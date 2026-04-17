import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, Key, type TUI } from "@mariozechner/pi-tui";

vi.mock("@mariozechner/pi-tui", async () => {
  const module =
    await vi.importActual<typeof import("@mariozechner/pi-tui")>("@mariozechner/pi-tui");

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

import { SUBCOMMANDS } from "../shared/subcommands";
import { generateCommandHandlerUsingDeps, SkillForm } from "./skill-creator";

describe("Skill Creator", () => {
  function createSkillForm() {
    const done = vi.fn();
    const tui = {
      requestRender: vi.fn(),
    } as unknown as TUI;
    const theme = {
      fg: (_color: string, text: string) => text,
    } as unknown as Theme;
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
    return form.render(80).join("\n");
  }

  function renderFormLines(form: SkillForm) {
    return form.render(80).map((line) => {
      return line
        .replaceAll(CURSOR_MARKER, "")
        .replaceAll("\u001b[7m", "")
        .replaceAll("\u001b[27m", "");
    });
  }

  function findLineIndex(lines: string[], text: string) {
    return lines.findIndex((line) => line.includes(text));
  }

  function pressKey(form: SkillForm, key: string) {
    form.handleInput(key);
  }

  describe("SkillForm", () => {
    it("should show errors under both inputs only after an invalid submit", () => {
      const { form, done } = createSkillForm();

      expect(renderForm(form)).not.toContain("Name is required");
      expect(renderForm(form)).not.toContain("Description is required");

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();

      const lines = renderFormLines(form);
      const nameInputIndex = findLineIndex(lines, ">");
      const nameErrorIndex = findLineIndex(lines, "× Name is required");
      const descriptionLabelIndex = findLineIndex(lines, "Description");
      const descriptionInputIndex = lines.findIndex(
        (line, index) => index > descriptionLabelIndex && line.includes(">"),
      );
      const descriptionErrorIndex = findLineIndex(lines, "× Description is required");

      expect(nameInputIndex).toBeGreaterThan(-1);
      expect(nameErrorIndex).toBeGreaterThan(nameInputIndex);
      expect(nameErrorIndex).toBeLessThan(descriptionLabelIndex);

      expect(descriptionInputIndex).toBeGreaterThan(descriptionLabelIndex);
      expect(descriptionErrorIndex).toBeGreaterThan(descriptionInputIndex);
    });

    it("should submit the entered values with the correct field mapping", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      enterText(form, "Useful skill description");

      expect(renderForm(form)).toContain("test-skill");
      expect(renderForm(form)).toContain("Useful skill description");

      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        name: "test-skill",
        description: "Useful skill description",
      });
      expect(done).not.toHaveBeenCalledWith({
        name: "Useful skill description",
        description: "test-skill",
      });
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

    it(`should work when ${SUBCOMMANDS.options[0]} is called`, async () => {
      const context = createContext();

      vi.mocked(context.ui.custom).mockResolvedValueOnce({
        name: "test-skill",
        description: "Test description",
      });

      await handler("create", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill created successfully");
    });

    it("should show a validation error when create values are invalid", async () => {
      const context = createContext();

      vi.mocked(context.ui.custom).mockResolvedValueOnce({
        name: "Test Skill",
        description: "Test description",
      });

      await handler("create", context);

      expect(context.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Invalid form:"),
        "error",
      );
    });

    it("should notify when skill creation is cancelled", async () => {
      const context = createContext();
      vi.mocked(context.ui.custom).mockResolvedValueOnce(null);

      await handler("create", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill creation cancelled", "info");
    });

    it(`should work when ${SUBCOMMANDS.options[1]} is called`, async () => {
      const context = createContext();
      await handler("edit", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill edited successfully");
    });

    it(`should work when ${SUBCOMMANDS.options[2]} is called`, async () => {
      const context = createContext();
      await handler("delete", context);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill deleted successfully");
    });
  });
});
