import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { Theme } from "@mariozechner/pi-coding-agent";
import { TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";
import { handleCreate, handleDelete, handleEdit } from "./agent-manager";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

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

function expectFormFactory(custom: ReturnType<typeof vi.fn>, callIndex: number, title: string) {
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

describe("extensions/agent", () => {
  const expectedAgentFolderPath = "~/.pi/agent/agents/";
  const expectedLocalAgentPath = ".pi/agents/";
  describe("handleCreate", () => {
    const input = {
      name: "oracle",
      description: "made for research",
      model: "claude",
      tools: "read, grep, ls, bash, mcp:chrome-devtools",
    };
    it("generates a form with the required fields", async () => {
      const notify = vi.fn();
      const custom = vi.fn().mockResolvedValueOnce(input);

      await handleCreate({ ui: { custom, notify } } as never);

      expectFormFactory(custom, 0, "Create Agent");

      expect(writeFile).toHaveBeenCalledWith(
        `${expectedAgentFolderPath}${input.name}.md`,
        `
        ----
        ${Object.entries(input)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")}
        ----
        `,
      );

      expect(notify).toHaveBeenCalledWith("Agent created");
    });

    it("notifies when an agent is local agent created", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();
      await handleEdit({ ui: { notify } } as never);
      expect(readdir).toHaveBeenCalledWith(expectedLocalAgentPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local Agent to edit", expected);

      expect(notify).toHaveBeenCalledWith(`Agent created`);
    });

    it("notifies when an agent is created", async () => {
      const notify = vi.fn();
      await handleCreate({ ui: { notify } } as never);
      expect(notify).toHaveBeenCalledWith("Agent created");
    });
  });

  describe("handleEdit", () => {
    it("notifies when an agent is edited", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedAgentFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Agent to edit", expected);
      expect(readFile).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(`Agent edited`);
    });

    it("notifies when an agent is local agent edited", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedLocalAgentPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local Agent to edit", expected);
      expect(readFile).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(`Agent edited`);
    });

    it("notifies when an agent editing is cancelled", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedAgentFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Agent to edit", expected);

      expect(notify).toHaveBeenCalledWith(`Editing cancelled`);
      expect(notify).not.toHaveBeenCalledWith(`Agent edited`);
    });
  });

  describe("handleDelete", () => {
    it("notifies when an agent is deleted", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleDelete({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedAgentFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Agent to delete", expected);
      expect(rm).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Agent deleted");
    });

    it("notifies when an agent is local agent deleted", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedLocalAgentPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local Agent to edit", expected);
      expect(rm).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(`Agent deleted`);
    });
    it("notifies when an agent deleting is cancelled", async () => {
      const expected = ["agent1", "agent2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleDelete({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedAgentFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Agent to delete", expected);

      expect(notify).toHaveBeenCalledWith(`Deleting cancelled`);
      expect(notify).not.toHaveBeenCalledWith("Agent deleted");
    });
  });
});
