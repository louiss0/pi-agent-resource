import { join } from "node:path";
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

import registerAgentManager, {
  createAgentForm,
  handleCreate,
  handleDelete,
  handleEdit,
  parseAgentFormValues,
} from "./agent-manager";

describe("extensions/agent-manager", () => {
  const extensionName = "agent-manager";
  const expectedAgentPath = join("/test-home", ".pi", "agents", "oracle.md");

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

      registerAgentManager({ registerCommand } as never);

      expect(registerCommand).toHaveBeenCalledWith(
        "resource:agent",
        expect.objectContaining({ description: "This is for managing agents" }),
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

  describe("createAgentForm", () => {
    it("uses the shared form component and required footer", () => {
      const form = createAgentForm(createTui(), createTheme(), vi.fn());
      const lines = form.render(100).join("\n");

      expect(form).toBeInstanceOf(Form);
      expect(lines).toContain("Create Agent");
      expect(lines).toContain("* required");
      expect(lines).toContain("Use lowercase values. Tools use com");
    });

    it("renders the expected errors when invalid values are submitted", () => {
      const form = createAgentForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      form.handleInput("O");
      form.handleInput("r");
      form.handleInput("a");
      form.handleInput("c");
      form.handleInput("l");
      form.handleInput("e");
      form.handleInput(Key.tab);

      form.handleInput("s");
      form.handleInput("h");
      form.handleInput("o");
      form.handleInput("r");
      form.handleInput("t");
      form.handleInput(Key.tab);

      form.handleInput("R");
      form.handleInput("e");
      form.handleInput("a");
      form.handleInput("d");
      form.handleInput(Key.tab);

      form.handleInput("C");
      form.handleInput(Key.enter);

      const lines = form.render(100).join("\n");

      expect(lines).toContain("Name must be lowercase letters, numbers, and dashes only");
      expect(lines).toContain("Description must be at least 35 characters");
      expect(lines).toContain("Tools must be a lowercase comma-separated list");
      expect(lines).toContain("Model must be at least 2 characters");
      expect(lines).toContain("Model must be lowercase");
    });

    it("validates later required fields when name is filled first", () => {
      const form = createAgentForm(createTui(), createTheme(), vi.fn());

      form.focused = true;
      form.handleInput("o");
      form.handleInput("r");
      form.handleInput("a");
      form.handleInput("c");
      form.handleInput("l");
      form.handleInput("e");

      form.handleInput(Key.tab);
      form.handleInput(Key.tab);
      form.handleInput(Key.tab);
      form.handleInput(Key.enter);

      const lines = form.render(100).join("\n");

      expect(lines).not.toContain("Name is required");
      expect(lines).not.toContain("Name must be lowercase letters, numbers, and dashes only");
      expect(lines).toContain("Description must be at least 35 characters");
      expect(lines).toContain("Tools are required");
      expect(lines).toContain("Model must be at least 2 characters");
    });

    it("renders each field label once while typing after repeated rerenders", () => {
      const form = createAgentForm(createTui(), createTheme(), vi.fn());

      form.focused = true;

      for (const character of "oracle") {
        form.handleInput(character);
        const lines = form.render(100).join("\n");

        expect(lines.match(/name/g)).toHaveLength(1);
        expect(lines.match(/description/g)).toHaveLength(1);
        expect(lines.match(/tools/g)).toHaveLength(1);
        expect(lines.match(/model/g)).toHaveLength(1);
        expect(lines.match(/Create Agent/g)).toHaveLength(1);
      }
    });
  });

  describe("parseAgentFormValues", () => {
    it("validates required agent fields", () => {
      const errors = parseAgentFormValues({
        name: "Oracle",
        description: "too short",
        tools: "Read, Write",
        model: "C",
      });

      expect(errors).toEqual({
        name: "Name must be lowercase letters, numbers, and dashes only",
        description: "Description must be at least 35 characters",
        tools: "Tools must be a lowercase comma-separated list",
        model: "Model must be at least 2 characters\nModel must be lowercase",
      });
    });
  });

  describe("handleCreate", () => {
    it("writes the created agent to the agents directory", async () => {
      const custom = vi.fn().mockResolvedValueOnce({
        name: "oracle",
        description: "made for careful research and deep code review work",
        tools: "read,write,bash",
        model: "claude",
      });
      const notify = vi.fn();

      await handleCreate({ ui: { custom, notify } } as never);

      const [factory, options] = custom.mock.calls[0] as [(...args: never[]) => unknown, unknown];
      const component = factory(
        createTui() as never,
        createTheme() as never,
        {} as never,
        vi.fn() as never,
      );
      const content = await getResourceFileSystem().readFile(expectedAgentPath, "utf8");

      expect(component).toBeInstanceOf(Form);
      expect(options).toEqual({ overlay: true, overlayOptions: { offsetY: -500 } });
      expect(content).toContain("name: oracle");
      expect(notify).toHaveBeenCalledWith("Agent created");
    });

    it("reports cancellation when agent creation is dismissed", async () => {
      const notify = vi.fn();

      await handleCreate({ ui: { custom: vi.fn().mockResolvedValueOnce(null), notify } } as never);

      await expect(getResourceFileSystem().readFile(expectedAgentPath, "utf8")).rejects.toThrow();
      expect(notify).toHaveBeenCalledWith("Agent creation cancelled", "info");
    });
  });

  describe("handleEdit", () => {
    it("edits the selected global agent", async () => {
      seedMemoryResourceFileSystem({
        [expectedAgentPath]: "---\nname: oracle\n---\n",
      });
      const select = vi.fn().mockResolvedValueOnce("global: oracle");
      const editor = vi.fn().mockResolvedValueOnce("updated agent content");
      const notify = vi.fn();

      await handleEdit({ ui: { notify, select, editor } } as never);

      const content = await getResourceFileSystem().readFile(expectedAgentPath, "utf8");

      expect(select).toHaveBeenCalledWith("Edit Agent", ["global: oracle"]);
      expect(editor).toHaveBeenCalledWith("Edit Agent", "---\nname: oracle\n---\n");
      expect(content).toBe("updated agent content");
      expect(notify).toHaveBeenCalledWith("Agent edited");
    });

    it("reports cancellation when no agent is selected for edit", async () => {
      seedMemoryResourceFileSystem({
        [expectedAgentPath]: "---\nname: oracle\n---\n",
      });
      const notify = vi.fn();

      await handleEdit({ ui: { select: vi.fn().mockResolvedValueOnce(undefined), notify } } as never);

      expect(notify).toHaveBeenCalledWith("Agent editing cancelled", "info");
    });

    it("reports cancellation when the agent editor is dismissed", async () => {
      seedMemoryResourceFileSystem({
        [expectedAgentPath]: "---\nname: oracle\n---\n",
      });
      const notify = vi.fn();

      await handleEdit({
        ui: {
          select: vi.fn().mockResolvedValueOnce("global: oracle"),
          editor: vi.fn().mockResolvedValueOnce(undefined),
          notify,
        },
      } as never);

      const content = await getResourceFileSystem().readFile(expectedAgentPath, "utf8");

      expect(content).toBe("---\nname: oracle\n---\n");
      expect(notify).toHaveBeenCalledWith("Agent editing cancelled", "info");
    });
  });

  describe("handleDelete", () => {
    it("deletes the selected agent", async () => {
      seedMemoryResourceFileSystem({
        [expectedAgentPath]: "---\nname: oracle\n---\n",
      });
      const select = vi.fn().mockResolvedValueOnce("global: oracle");
      const notify = vi.fn();

      await handleDelete({ ui: { notify, select } } as never);

      await expect(getResourceFileSystem().readFile(expectedAgentPath, "utf8")).rejects.toThrow();
      expect(select).toHaveBeenCalledWith("Delete Agent", ["global: oracle"]);
      expect(notify).toHaveBeenCalledWith("Agent deleted");
    });

    it("reports cancellation when no agent is selected for deletion", async () => {
      seedMemoryResourceFileSystem({
        [expectedAgentPath]: "---\nname: oracle\n---\n",
      });
      const notify = vi.fn();

      await handleDelete({ ui: { select: vi.fn().mockResolvedValueOnce(undefined), notify } } as never);

      expect(notify).toHaveBeenCalledWith("Agent deleting cancelled", "info");
    });
  });
});