import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key, type KeyId, type TUI } from "@mariozechner/pi-tui";
import { SUBCOMMANDS } from "../shared/subcommands";
import { SkillForm, generateCommandHandlerUsingDeps } from "./skill-creator";

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

  function getTerminalInputForKey(key: KeyId) {
    switch (key) {
      case Key.tab:
        return "\t";
      case Key.shift("tab"):
        return "\u001b[Z";
      case Key.enter:
        return "\r";
      case Key.escape:
        return "\u001b";
      default:
        throw new Error(`Unsupported test key: ${key}`);
    }
  }

  function pressKey(form: SkillForm, key: KeyId) {
    form.handleInput(getTerminalInputForKey(key));
  }

  describe("SkillForm", () => {
    it("should keep focus on the name field until the value is valid", () => {
      const { form } = createSkillForm();

      pressKey(form, Key.tab);

      expect(renderForm(form)).toContain("Name is required");
      expect(renderForm(form)).toContain("› Name");
      expect(renderForm(form)).not.toContain("› Description");

      enterText(form, "test-skill");
      pressKey(form, Key.tab);

      expect(renderForm(form)).not.toContain("Name is required");
      expect(renderForm(form)).toContain("› Description");
    });

    it("should keep focus on the description field until the value is valid", () => {
      const { form } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.tab);
      pressKey(form, Key.shift("tab"));

      expect(renderForm(form)).toContain("Description is required");
      expect(renderForm(form)).toContain("› Description");
      expect(renderForm(form)).not.toContain("› Name");

      enterText(form, "Useful skill description");
      pressKey(form, Key.shift("tab"));

      expect(renderForm(form)).not.toContain("Description is required");
      expect(renderForm(form)).toContain("› Name");
    });

    it("should show inline errors and submit only when every field is valid", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();
      expect(renderForm(form)).toContain("Description is required");
      expect(renderForm(form)).toContain("› Description");

      enterText(form, "Useful skill description");
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        name: "test-skill",
        description: "Useful skill description",
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
