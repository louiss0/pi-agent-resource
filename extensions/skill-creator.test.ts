import { Theme } from "@mariozechner/pi-coding-agent";
import { Key, type TUI } from "@mariozechner/pi-tui";
import { join } from "node:path";

vi.mock("@mariozechner/pi-tui", async () => {
  const module = await vi.importActual<typeof import("@mariozechner/pi-tui")>(
    "@mariozechner/pi-tui",
  );

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

vi.mock("node:os", () => ({
  homedir: () => "/test-home",
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import skillCreator, {
  ConfirmationBox,
  createSkillFile,
  handleCreate,
  handleDelete,
  handleEdit,
  parseSkillCommandArgument,
  readProjectEditorConfig,
  renderSkillMarkdown,
  resolveSkillEditMode,
  SkillForm,
  SkillOptionalFieldsForm,
} from "./skill-creator";

describe("Skill Creator", () => {
  const expectedSkillPath = join("/test-home", ".pi", "agents", "skills", "test-skill", "SKILL.md");

  function createTheme(themeOverride?: Theme) {
    return (
      themeOverride ??
      ({
        fg: (_color: string, text: string) => text,
      } as unknown as Theme)
    );
  }

  function createTui() {
    return {
      requestRender: vi.fn(),
    } as unknown as TUI;
  }

  function enterText(
    form: { handleInput: (data: string) => void },
    text: string,
  ) {
    for (const character of text) {
      form.handleInput(character);
    }
  }

  function pressKey(form: { handleInput: (data: string) => void }, key: string) {
    form.handleInput(key);
  }

  function render(component: { render: (width: number) => string[] }) {
    return component.render(60).join("\n");
  }

  describe("registration", () => {
    it("registers an inline handler for resource:skill", () => {
      const registerCommand = vi.fn();

      skillCreator({ registerCommand } as never);

      expect(registerCommand).toHaveBeenCalledTimes(1);
      expect(registerCommand).toHaveBeenCalledWith(
        "resource:skill",
        expect.objectContaining({
          description: "This is for creating a new skill",
          handler: expect.any(Function),
        }),
      );
    });
  });

  describe("parseSkillCommandArgument", () => {
    it("parses edit flags", () => {
      expect(parseSkillCommandArgument("edit --external")).toEqual({
        success: true,
        output: { subcommand: "edit", editMode: "external" },
      });
      expect(parseSkillCommandArgument("edit --pi-editor")).toEqual({
        success: true,
        output: { subcommand: "edit", editMode: "pi" },
      });
    });

    it("rejects unknown and conflicting flags", () => {
      expect(parseSkillCommandArgument("edit --unknown")).toEqual({
        success: false,
        errorMessage: "Unknown flag: --unknown",
      });
      expect(parseSkillCommandArgument("edit --external --pi-editor")).toEqual({
        success: false,
        errorMessage: "Use either --external or --pi-editor, not both",
      });
    });
  });

  describe("readProjectEditorConfig", () => {
    it("reads the skill editor from the project TOML file", async () => {
      vi.mocked(readFile).mockResolvedValueOnce('[skill]\neditor = "external"\n');

      await expect(readProjectEditorConfig()).resolves.toEqual({
        skillEditor: "external",
      });
    });

    it("falls back when the project TOML file is missing", async () => {
      vi.mocked(readFile).mockRejectedValueOnce(new Error("missing"));

      await expect(resolveSkillEditMode()).resolves.toBe("pi");
    });
  });

  describe("ConfirmationBox", () => {
    it("renders and clears checkbox error messages", () => {
      const theme = new Theme(
        {
          error: "#ff0000",
          accent: "#00ffff",
          dim: "#888888",
        } as ConstructorParameters<typeof Theme>[0],
        {} as ConstructorParameters<typeof Theme>[1],
        "truecolor",
      );
      const confirmationBox = new ConfirmationBox(createTui(), theme);

      confirmationBox.setFocused(true);
      confirmationBox.setError(["Pick yes or no"]);
      expect(render(confirmationBox)).toContain("Pick yes or no");

      confirmationBox.clearError();
      expect(render(confirmationBox)).not.toContain("Pick yes or no");
    });
  });

  describe("SkillForm", () => {
    function createSkillForm(themeOverride?: Theme) {
      const done = vi.fn();
      const form = new SkillForm(createTui(), createTheme(themeOverride), done);
      form.focused = true;
      return { form, done };
    }

    it("renders a skill form", () => {
      const { form } = createSkillForm();
      expect(render(form)).toContain("Create Skill");
      expect(render(form)).toContain("[ ] Do you want to fill in the next fields?");
    });

    it("shows required field errors only after invalid submit", () => {
      const { form, done } = createSkillForm();

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();
      expect(render(form)).toContain("Name is required");
      expect(render(form)).toContain("Description is required");
    });

    it("renders validation errors using the error theme color", () => {
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

      expect(render(form)).toContain(`${theme.getFgAnsi("error")}Name is required`);
      expect(render(form)).toContain(`${theme.getFgAnsi("error")}Description is required`);
    });

    it("submits entered values and confirm=false when checkbox is untouched", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      enterText(form, "Useful skill description");
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        name: "test-skill",
        description: "Useful skill description",
        confirm: false,
      });
    });

    it("submits confirm=true when the checkbox is selected", () => {
      const { form, done } = createSkillForm();

      enterText(form, "test-skill");
      pressKey(form, Key.enter);
      enterText(form, "Useful skill description");
      pressKey(form, Key.enter);
      pressKey(form, Key.space);
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        name: "test-skill",
        description: "Useful skill description",
        confirm: true,
      });
    });

    it("accepts a 164-character name and rejects a longer name", () => {
      const validName = "a".repeat(164);
      const invalidName = "a".repeat(165);

      const valid = createSkillForm();
      enterText(valid.form, validName);
      pressKey(valid.form, Key.enter);
      enterText(valid.form, "Description");
      pressKey(valid.form, Key.enter);
      pressKey(valid.form, Key.enter);
      expect(valid.done).toHaveBeenCalledWith({
        name: validName,
        description: "Description",
        confirm: false,
      });

      const invalid = createSkillForm();
      enterText(invalid.form, invalidName);
      pressKey(invalid.form, Key.enter);
      enterText(invalid.form, "Description");
      pressKey(invalid.form, Key.enter);
      pressKey(invalid.form, Key.enter);
      expect(invalid.done).not.toHaveBeenCalled();
      expect(render(invalid.form)).toContain("Name must be 164 characters or fewer");
    });

    it("accepts a 1024-character description and rejects a longer description", () => {
      const validDescription = "d".repeat(1024);
      const invalidDescription = "d".repeat(1025);

      const valid = createSkillForm();
      enterText(valid.form, "test-skill");
      pressKey(valid.form, Key.enter);
      enterText(valid.form, validDescription);
      pressKey(valid.form, Key.enter);
      pressKey(valid.form, Key.enter);
      expect(valid.done).toHaveBeenCalledWith({
        name: "test-skill",
        description: validDescription,
        confirm: false,
      });

      const invalid = createSkillForm();
      enterText(invalid.form, "test-skill");
      pressKey(invalid.form, Key.enter);
      enterText(invalid.form, invalidDescription);
      pressKey(invalid.form, Key.enter);
      pressKey(invalid.form, Key.enter);
      expect(invalid.done).not.toHaveBeenCalled();
      expect(render(invalid.form)).toContain("Description must be 1024 characters or fewer");
    });

    it("allows cancelling even when the active field is invalid", () => {
      const { form, done } = createSkillForm();

      pressKey(form, Key.escape);

      expect(done).toHaveBeenCalledWith(null);
    });
  });

  describe("SkillOptionalFieldsForm", () => {
    function createOptionalFieldsForm() {
      const done = vi.fn();
      const form = new SkillOptionalFieldsForm(createTui(), createTheme(), done);
      form.focused = true;
      return { form, done };
    }

    it("allows submitting all optional fields as empty", () => {
      const { form, done } = createOptionalFieldsForm();

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        license: "",
        compatibility: "",
        allowedTools: "",
      });
    });

    it("accepts a comma-separated allowed tools list", () => {
      const { form, done } = createOptionalFieldsForm();

      pressKey(form, Key.enter);
      pressKey(form, Key.enter);
      enterText(form, "read, write, bash");
      pressKey(form, Key.enter);

      expect(done).toHaveBeenCalledWith({
        license: "",
        compatibility: "",
        allowedTools: "read, write, bash",
      });
    });

    it("validates license path compatibility length and comma-separated allowed tools", () => {
      const { form, done } = createOptionalFieldsForm();

      enterText(form, 'bad:path');
      pressKey(form, Key.enter);
      enterText(form, "x".repeat(501));
      pressKey(form, Key.enter);
      enterText(form, "bash read");
      pressKey(form, Key.enter);

      expect(done).not.toHaveBeenCalled();
      expect(render(form)).toContain("License must be a valid path");
      expect(render(form)).toContain("Compatibility must be 500 characters or fewer");
      expect(render(form)).toContain("Allowed tools must be a comma-separated list");
    });
  });

  describe("file operations", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("renders a skill markdown file with optional frontmatter fields", () => {
      const markdown = renderSkillMarkdown({
        name: "test-skill",
        description: "Useful skill description",
        license: "./LICENSE",
        compatibility: "pi >= 0.67",
        allowedTools: "read write",
      });

      expect(markdown).toContain("name: test-skill");
      expect(markdown).toContain("description: Useful skill description");
      expect(markdown).toContain("license: ./LICENSE");
      expect(markdown).toContain("compatibility: 'pi >= 0.67'");
      expect(markdown).toContain("allowed-tools: read write");
    });

    it("quotes YAML-sensitive frontmatter values", () => {
      const markdown = renderSkillMarkdown({
        name: "test-skill",
        description: "Handles: yaml # safely",
        license: "./it's-license",
        compatibility: " needs wrapping ",
        allowedTools: "read write",
      });

      expect(markdown).toContain("description: 'Handles: yaml # safely'");
      expect(markdown).toContain("license: './it''s-license'");
      expect(markdown).toContain("compatibility: ' needs wrapping '");
      expect(markdown).toContain("allowed-tools: read write");
    });

    it("creates skills in ~/.pi/agents/skills/<name>/SKILL.md", async () => {
      const filePath = await createSkillFile({
        name: "test-skill",
        description: "Useful skill description",
        license: "",
        compatibility: "",
        allowedTools: "",
      });

      expect(filePath).toBe(expectedSkillPath);
      expect(writeFile).toHaveBeenCalledWith(
        expectedSkillPath,
        expect.stringContaining("# Test Skill"),
        "utf8",
      );
    });

    it("creates the skill and shows the file path when confirm=false", async () => {
      const custom = vi
        .fn()
        .mockResolvedValueOnce({
          name: "test-skill",
          description: "Useful skill description",
          confirm: false,
        });
      const notify = vi.fn();

      await handleCreate({ ui: { custom, notify } } as never);

      expect(custom).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        `Skill created successfully: ${expectedSkillPath}`,
      );
    });

    it("shows the second form and writes optional fields when confirm=true", async () => {
      const custom = vi
        .fn()
        .mockResolvedValueOnce({
          name: "test-skill",
          description: "Useful skill description",
          confirm: true,
        })
        .mockResolvedValueOnce({
          license: "./LICENSE",
          compatibility: "pi >= 0.67",
          allowedTools: "read write",
        });
      const notify = vi.fn();

      await handleCreate({ ui: { custom, notify } } as never);

      expect(custom).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledWith(
        expectedSkillPath,
        expect.stringContaining("allowed-tools: read write"),
        "utf8",
      );
      expect(notify).toHaveBeenCalledWith(
        `Skill created successfully: ${expectedSkillPath}`,
      );
    });

    it("cancels creation when the second form is dismissed", async () => {
      const custom = vi
        .fn()
        .mockResolvedValueOnce({
          name: "test-skill",
          description: "Useful skill description",
          confirm: true,
        })
        .mockResolvedValueOnce(null);
      const notify = vi.fn();

      await handleCreate({ ui: { custom, notify } } as never);

      expect(notify).toHaveBeenCalledWith("Skill creation cancelled", "info");
    });

    it("uses pi editor by default edits the file and reloads", async () => {
      vi.mocked(readdir).mockResolvedValueOnce([
        { isDirectory: () => true, name: "test-skill" },
      ] as never);
      vi.mocked(readFile)
        .mockResolvedValueOnce("existing skill content")
        .mockRejectedValueOnce(new Error("missing config"));
      const custom = vi.fn().mockResolvedValueOnce(
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
      );
      const editor = vi.fn().mockResolvedValueOnce("updated skill content");
      const notify = vi.fn();
      const reload = vi.fn().mockResolvedValueOnce(undefined);

      await handleEdit({ ui: { custom, editor, notify }, reload } as never);

      expect(editor).toHaveBeenCalledWith("Edit Skill Markdown", "existing skill content");
      expect(writeFile).toHaveBeenCalledWith(
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
        "updated skill content",
        "utf8",
      );
      expect(reload).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Skill updated. Reloading skills...", "info");
    });

    it("opens the external editor when requested by flag and reloads", async () => {
      vi.mocked(readdir).mockResolvedValueOnce([
        { isDirectory: () => true, name: "test-skill" },
      ] as never);
      vi.mocked(readFile).mockResolvedValueOnce("existing skill content");
      vi.stubEnv("VISUAL", "nvim");
      vi.mocked(spawn).mockReturnValueOnce({
        on: (event: string, callback: (value?: number) => void) => {
          if (event === "exit") {
            callback(0);
          }
        },
      } as never);
      const custom = vi.fn().mockResolvedValueOnce(
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
      );
      const notify = vi.fn();
      const reload = vi.fn().mockResolvedValueOnce(undefined);

      await handleEdit({ ui: { custom, notify }, reload } as never, "external");

      expect(spawn).toHaveBeenCalledWith("nvim", [
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
      ], expect.objectContaining({ shell: true }));
      expect(reload).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Skill updated. Reloading skills...", "info");
      vi.unstubAllEnvs();
    });

    it("deletes the selected skill from ~/.pi/agents/skills", async () => {
      vi.mocked(readdir).mockResolvedValueOnce([
        { isDirectory: () => true, name: "test-skill" },
      ] as never);
      const custom = vi.fn().mockResolvedValueOnce(
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
      );
      const notify = vi.fn();

      await handleDelete({ ui: { custom, notify } } as never);

      expect(rm).toHaveBeenCalledWith(
        "/test-home/.pi/agents/skills/test-skill/SKILL.md",
        { force: true },
      );
      expect(notify).toHaveBeenCalledWith(
        "Skill deleted successfully: /test-home/.pi/agents/skills/test-skill/SKILL.md",
      );
    });
  });
});
