import { dirname, join } from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Key, type TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";
import {
  getResourceFileSystem,
  resetResourceFileSystem,
  seedMemoryResourceFileSystem,
  useMemoryResourceFileSystem,
} from "../shared/filesystem";
import { resetDevelopmentExtensionNotice } from "../shared/runtime";

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

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import registerSkillManager, {
  createOptionalSkillForm,
  createRequiredSkillForm,
  handleCreate,
  handleDelete,
  handleEdit,
  parseOptionalSkillFormValues,
  parseRequiredSkillFormValues,
} from "./skill-manager";

describe("skill manager handlers", () => {
  const extensionName = "skill-manager";
  const expectedSkillPath = join(
    "/test-home",
    ".pi",
    "agents",
    "skills",
    "test-skill",
    "SKILL.md",
  );
  const expectedSkillDirectory = dirname(expectedSkillPath);

  function createTheme() {
    return {
      fg: (_color: string, text: string) => text,
    } as unknown as Theme;
  }

  function createTui() {
    return {
      requestRender: vi.fn(),
      terminal: {
        rows: 40,
        columns: 120,
      },
    } as unknown as TUI;
  }

  function expectFormFactory(
    custom: ReturnType<typeof vi.fn>,
    callIndex: number,
    title: string,
  ) {
    const [factory, options] = custom.mock.calls[callIndex] as [
      (tui: TUI, theme: Theme, keyboard: unknown, done: (value: unknown) => void) => unknown,
      unknown,
    ];
    const component = factory(createTui(), createTheme(), {}, vi.fn());

    expect(component).toBeInstanceOf(Form);
    expect(
      (component as Form<Record<string, string | boolean>>).render(80).join("\n"),
    ).toContain(title);
    expect(options).toEqual({
      overlay: true,
      overlayOptions: { offsetY: -500 },
    });
  }

  function expectEditorOverlayFactory(custom: ReturnType<typeof vi.fn>, callIndex: number) {
    const [factory, options] = custom.mock.calls[callIndex] as [
      (tui: TUI, theme: Theme, keyboard: unknown, done: (value: unknown) => void) => unknown,
      unknown,
    ];
    const component = factory(createTui(), createTheme(), {}, vi.fn());

    expect(
      (component as { render: (width: number) => string[] }).render(80).join("\n"),
    ).toContain("Edit Skill Markdown");
    expect(options).toEqual({
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "80%",
        maxHeight: "80%",
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    useMemoryResourceFileSystem();
    resetDevelopmentExtensionNotice();
  });

  afterEach(() => {
    resetResourceFileSystem();
  });

  describe("extension registration", () => {
    it("shows the development notice when the command is used", async () => {
      vi.stubEnv("PI_RESOURCE_DEV", "1");
      const registerCommand = vi.fn();
      const notify = vi.fn();

      registerSkillManager({ registerCommand } as never);

      expect(registerCommand).toHaveBeenCalledWith(
        "resource:skill",
        expect.objectContaining({ description: "This is for managing skills" }),
      );

      const command = registerCommand.mock.calls[0]?.[1] as {
        handler: (arg: string, ctx: { ui: { notify: typeof notify } }) => Promise<void>;
      };
      await command.handler("bogus", { ui: { notify } });

      expect(notify).toHaveBeenNthCalledWith(
        1,
        `${extensionName} is running in development mode. Nothing is being saved.`,
        "warning",
      );
    });
  });

  describe("createRequiredSkillForm", () => {
    it("uses the shared form component and required title", () => {
      const form = createRequiredSkillForm(createTui(), createTheme(), vi.fn());
      const lines = form.render(80).join("\n");

      expect(form).toBeInstanceOf(Form);
      expect(lines).toContain("Create Skill");
      expect(lines).toContain("Do you want to fill in the next fields?");
    });

    it("renders required form errors when invalid values are submitted", () => {
      const form = createRequiredSkillForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      form.handleInput("B");
      form.handleInput("a");
      form.handleInput("d");
      form.handleInput(Key.tab);
      form.handleInput(Key.tab);
      form.handleInput(Key.enter);

      const lines = form.render(80).join("\n");

      expect(lines).toContain("Must be lowercase alphanumeric with dashes only");
      expect(lines).toContain("Description is required");
    });

    it("validates description when name is already filled", () => {
      const form = createRequiredSkillForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      for (const character of "test-skill") {
        form.handleInput(character);
      }

      form.handleInput(Key.tab);
      form.handleInput(Key.tab);
      form.handleInput(Key.enter);

      const lines = form.render(80).join("\n");

      expect(lines).not.toContain("Name is required");
      expect(lines).not.toContain("Must be lowercase alphanumeric with dashes only");
      expect(lines).toContain("Description is required");
    });
  });

  describe("createOptionalSkillForm", () => {
    it("uses the shared form component and optional title", () => {
      const form = createOptionalSkillForm(createTui(), createTheme(), vi.fn());
      const lines = form.render(80).join("\n");

      expect(form).toBeInstanceOf(Form);
      expect(lines).toContain("Skill Details");
      expect(lines).toContain("license");
      expect(lines).toContain("allowedTools");
    });

    it("renders optional form errors when invalid values are submitted", () => {
      const form = createOptionalSkillForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      for (const character of "bad:path") {
        form.handleInput(character);
      }
      form.handleInput(Key.tab);
      for (const character of "x".repeat(501)) {
        form.handleInput(character);
      }
      form.handleInput(Key.tab);
      for (const character of "bash read") {
        form.handleInput(character);
      }
      form.handleInput(Key.enter);

      const lines = form.render(80).join("\n");

      expect(lines).toContain("License must be a valid path");
      expect(lines).toContain("Compatibility must be 500 characters or fewer");
      expect(lines).toContain("Allowed tools must be a comma-separated list");
    });

    it("validates later optional fields when earlier fields are empty", () => {
      const form = createOptionalSkillForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      form.handleInput(Key.tab);
      form.handleInput(Key.tab);
      for (const character of "bash read") {
        form.handleInput(character);
      }
      form.handleInput(Key.enter);

      const lines = form.render(80).join("\n");

      expect(lines).not.toContain("License must be a valid path");
      expect(lines).not.toContain("Compatibility must be 500 characters or fewer");
      expect(lines).toContain("Allowed tools must be a comma-separated list");
    });
  });

  describe("parseRequiredSkillFormValues", () => {
    it("returns the expected required field errors", () => {
      expect(
        parseRequiredSkillFormValues({
          name: "Bad Name",
          description: "",
        }),
      ).toEqual({
        name: "Must be lowercase alphanumeric with dashes only",
        description: "Description is required",
      });
    });
  });

  describe("parseOptionalSkillFormValues", () => {
    it("returns the expected optional field errors", () => {
      expect(
        parseOptionalSkillFormValues({
          license: "bad:path",
          compatibility: "x".repeat(501),
          allowedTools: "bash read",
        }),
      ).toEqual({
        license: "License must be a valid path",
        compatibility: "Compatibility must be 500 characters or fewer",
        allowedTools: "Allowed tools must be a comma-separated list",
      });
    });
  });

  it("handleCreate cancels when the required form is dismissed", async () => {
    const custom = vi.fn().mockResolvedValueOnce(null);
    const notify = vi.fn();

    await handleCreate({ ui: { custom, notify } } as never);

    expectFormFactory(custom, 0, "Create Skill");
    expect(custom).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Skill creation cancelled", "info");
  });

  it("handleCreate writes the skill after the required form completes", async () => {
    const custom = vi.fn().mockResolvedValueOnce({
      name: "test-skill",
      description: "Useful skill description",
      confirm: false,
    });
    const notify = vi.fn();

    await handleCreate({ ui: { custom, notify } } as never);

    expectFormFactory(custom, 0, "Create Skill");
    const content = await getResourceFileSystem().readFile(expectedSkillPath, "utf8");
    expect(content).toContain("# Test Skill");
    expect(notify).toHaveBeenCalledWith(`Skill created successfully: ${expectedSkillPath}`);
  });

  it("handleCreate uses a shared Form for optional fields when requested", async () => {
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
        allowedTools: "read, write",
      });
    const notify = vi.fn();

    await handleCreate({ ui: { custom, notify } } as never);

    expectFormFactory(custom, 0, "Create Skill");
    expectFormFactory(custom, 1, "Skill Details");
    const content = await getResourceFileSystem().readFile(expectedSkillPath, "utf8");
    expect(content).toContain("allowed-tools: 'read, write'");
    expect(notify).toHaveBeenCalledWith(`Skill created successfully: ${expectedSkillPath}`);
  });

  it("handleCreate creates the skill when the optional form is dismissed", async () => {
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

    const content = await getResourceFileSystem().readFile(expectedSkillPath, "utf8");
    expect(content).toContain("# Test Skill");
    expect(notify).toHaveBeenCalledWith(`Skill created successfully: ${expectedSkillPath}`);
  });

  it("handleCreate reports an existing skill without overwriting it", async () => {
    seedMemoryResourceFileSystem({
      [expectedSkillPath]: "existing skill content",
    });
    const notify = vi.fn();

    await handleCreate({
      ui: {
        custom: vi.fn().mockResolvedValueOnce({
          name: "test-skill",
          description: "Useful skill description",
          confirm: false,
        }),
        notify,
      },
    } as never);

    expect(notify).toHaveBeenCalledWith("Skill already exists: test-skill", "error");
  });

  it("handleEdit uses an 80% overlay editor by default", async () => {
    seedMemoryResourceFileSystem({
      [expectedSkillPath]: "existing skill content",
    });
    const custom = vi.fn().mockResolvedValueOnce(expectedSkillPath);
    custom.mockResolvedValueOnce("updated skill content");
    const notify = vi.fn();
    const reload = vi.fn().mockResolvedValueOnce(undefined);

    await handleEdit({ ui: { custom, notify }, reload } as never);

    expectEditorOverlayFactory(custom, 1);
    expect(spawn).not.toHaveBeenCalled();
    expect(await getResourceFileSystem().readFile(expectedSkillPath, "utf8")).toBe(
      "updated skill content",
    );
    expect(reload).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Skill updated. Reloading skills...", "info");
  });

  it("handleEdit uses the external editor without shell mode", async () => {
    seedMemoryResourceFileSystem({
      [expectedSkillPath]: "existing skill content",
    });
    vi.stubEnv("VISUAL", 'code --wait +"set ft=markdown"');
    vi.mocked(spawn).mockReturnValueOnce({
      on: (event: string, callback: (value?: number) => void) => {
        if (event === "exit") {
          callback(0);
        }
      },
    } as never);
    const custom = vi.fn().mockResolvedValueOnce(expectedSkillPath);
    const notify = vi.fn();
    const reload = vi.fn().mockResolvedValueOnce(undefined);

    await handleEdit({ ui: { custom, notify }, reload } as never, "external");

    expect(spawn).toHaveBeenCalledWith(
      "code",
      ["--wait", "+set ft=markdown", expectedSkillPath],
      expect.objectContaining({ shell: false }),
    );
    expect(reload).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Skill updated. Reloading skills...", "info");
  });

  it("handleEdit reports cancellation when no skill is selected", async () => {
    seedMemoryResourceFileSystem({
      [expectedSkillPath]: "existing skill content",
    });
    const notify = vi.fn();

    await handleEdit({
      ui: {
        custom: vi.fn().mockResolvedValueOnce(null),
        notify,
      },
      reload: vi.fn(),
    } as never);

    expect(notify).toHaveBeenCalledWith("Skill edit cancelled", "info");
  });

  it("handleDelete removes the selected skill directory", async () => {
    seedMemoryResourceFileSystem({
      [expectedSkillPath]: "existing skill content",
    });
    const custom = vi.fn().mockResolvedValueOnce(expectedSkillPath);
    const notify = vi.fn();

    await handleDelete({ ui: { custom, notify } } as never);

    await expect(getResourceFileSystem().readFile(expectedSkillPath, "utf8")).rejects.toThrow();
    expect(notify).toHaveBeenCalledWith(
      `Skill deleted successfully: ${expectedSkillDirectory}`,
    );
  });
});