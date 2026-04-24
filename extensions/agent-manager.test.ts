import type { Theme } from "@mariozechner/pi-coding-agent";
import { Key, type TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";

vi.mock("@mariozechner/pi-tui", async () => {
  const module = await vi.importActual<typeof import("@mariozechner/pi-tui")>(
    "@mariozechner/pi-tui",
  );

  return {
    ...module,
    matchesKey: (data: string, key: string) => data === key,
  };
});

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  createAgentForm,
  handleCreate,
  handleDelete,
  handleEdit,
  parseAgentFormValues,
} from "./agent-manager";

describe("extensions/agent-manager", () => {
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

      expect(component).toBeInstanceOf(Form);
      expect(options).toEqual({ overlay: true, overlayOptions: { offsetY: -500 } });
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]\.pi[\\/]agents[\\/]oracle\.md$/),
        expect.stringContaining("name: oracle"),
        "utf8",
      );
      expect(notify).toHaveBeenCalledWith("Agent created");
    });

    it("reports cancellation when agent creation is dismissed", async () => {
      const notify = vi.fn();

      await handleCreate({ ui: { custom: vi.fn().mockResolvedValueOnce(null), notify } } as never);

      expect(writeFile).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Agent creation cancelled", "info");
    });
  });

  describe("handleEdit", () => {
    it("edits the selected local agent", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["oracle.md"] as never);
      vi.mocked(readFile).mockResolvedValueOnce("---\nname: oracle\n---\n" as never);
      const select = vi.fn().mockResolvedValueOnce("local: oracle");
      const notify = vi.fn();

      await handleEdit({ ui: { notify, select } } as never);

      expect(readdir).toHaveBeenCalledTimes(2);
      expect(select).toHaveBeenCalledWith("Edit Agent", ["local: oracle"]);
      expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/[\\/]?\.pi[\\/]agents[\\/]oracle\.md$/), "utf8");
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]?\.pi[\\/]agents[\\/]oracle\.md$/),
        "---\nname: oracle\n---\n",
        "utf8",
      );
      expect(notify).toHaveBeenCalledWith("Agent edited");
    });

    it("reports cancellation when no agent is selected for edit", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["oracle.md"] as never);
      const notify = vi.fn();

      await handleEdit({ ui: { select: vi.fn().mockResolvedValueOnce(undefined), notify } } as never);

      expect(notify).toHaveBeenCalledWith("Agent editing cancelled", "info");
    });
  });

  describe("handleDelete", () => {
    it("deletes the selected agent", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["oracle.md"] as never);
      const select = vi.fn().mockResolvedValueOnce("local: oracle");
      const notify = vi.fn();

      await handleDelete({ ui: { notify, select } } as never);

      expect(select).toHaveBeenCalledWith("Delete Agent", ["local: oracle"]);
      expect(rm).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]?\.pi[\\/]agents[\\/]oracle\.md$/),
        { force: true },
      );
      expect(notify).toHaveBeenCalledWith("Agent deleted");
    });

    it("reports cancellation when no agent is selected for deletion", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["oracle.md"] as never);
      const notify = vi.fn();

      await handleDelete({ ui: { select: vi.fn().mockResolvedValueOnce(undefined), notify } } as never);

      expect(rm).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Agent deleting cancelled", "info");
    });
  });
});
