import { dirname, join } from "node:path";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";

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

import { spawn } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { handleCreate, handleDelete, handleEdit } from "./skill-manager";

describe("skill manager handlers", () => {
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
    expect((component as Form<Record<string, string | boolean>>).render(80).join("\n")).toContain(
      title,
    );
    expect(options).toEqual({
      overlay: true,
      overlayOptions: { offsetY: -500 },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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
    expect(writeFile).toHaveBeenCalledWith(
      expectedSkillPath,
      expect.stringContaining("# Test Skill"),
      expect.objectContaining({
        encoding: "utf8",
        flag: "wx",
      }),
    );
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
    expect(writeFile).toHaveBeenCalledWith(
      expectedSkillPath,
      expect.stringContaining("allowed-tools: 'read, write'"),
      expect.objectContaining({
        encoding: "utf8",
        flag: "wx",
      }),
    );
    expect(notify).toHaveBeenCalledWith(`Skill created successfully: ${expectedSkillPath}`);
  });

  it("handleCreate cancels when the optional form is dismissed", async () => {
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
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("handleCreate reports an existing skill without overwriting it", async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(Object.assign(new Error("exists"), { code: "EEXIST" }));
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

  it("handleEdit uses Pi's built-in editor by default", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([{ isDirectory: () => true, name: "test-skill" }] as never);
    vi.mocked(readFile)
      .mockResolvedValueOnce("existing skill content")
      .mockRejectedValueOnce(new Error("missing config"));
    vi.stubEnv("VISUAL", "code --wait");
    vi.stubEnv("EDITOR", "nvim");
    const custom = vi.fn().mockResolvedValueOnce(expectedSkillPath);
    const editor = vi.fn().mockResolvedValueOnce("updated skill content");
    const notify = vi.fn();
    const reload = vi.fn().mockResolvedValueOnce(undefined);

    await handleEdit({ ui: { custom, editor, notify }, reload } as never);

    expect(editor).toHaveBeenCalledWith("Edit Skill Markdown", "existing skill content");
    expect(spawn).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(expectedSkillPath, "updated skill content", "utf8");
    expect(reload).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Skill updated. Reloading skills...", "info");
  });

  it("handleEdit uses the external editor without shell mode", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([{ isDirectory: () => true, name: "test-skill" }] as never);
    vi.mocked(readFile).mockResolvedValueOnce("existing skill content");
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
    vi.mocked(readdir).mockResolvedValueOnce([{ isDirectory: () => true, name: "test-skill" }] as never);
    const notify = vi.fn();

    await handleEdit({
      ui: {
        custom: vi.fn().mockResolvedValueOnce(null),
        notify,
      },
      reload: vi.fn(),
    } as never);

    expect(notify).toHaveBeenCalledWith("Skill edit cancelled", "info");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("handleDelete removes the selected skill directory", async () => {
    vi.mocked(readdir).mockResolvedValueOnce([{ isDirectory: () => true, name: "test-skill" }] as never);
    const custom = vi.fn().mockResolvedValueOnce(expectedSkillPath);
    const notify = vi.fn();

    await handleDelete({ ui: { custom, notify } } as never);

    expect(rm).toHaveBeenCalledWith(expectedSkillDirectory, { force: true, recursive: true });
    expect(notify).toHaveBeenCalledWith(`Skill deleted successfully: ${expectedSkillDirectory}`);
  });
});
