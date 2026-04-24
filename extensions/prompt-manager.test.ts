import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { Theme } from "@mariozechner/pi-coding-agent";
import { TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";
import { handleCreate, handleDelete, handleEdit } from "./prompt-manager";

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

describe("extensions/prompts", () => {
  const expectedPromptFolderPath = "~/.pi/prompts/";
  const expectedLocalPromptPath = ".pi/prompts/";
  describe("handleCreate", () => {
    const input = {
      name: "create-react-component",
      description: "This is for making a react component",
      "argument-hint": "",
    };
    it("generates a form with the required fields", async () => {
      const notify = vi.fn();
      const custom = vi.fn().mockResolvedValueOnce(input);

      await handleCreate({ ui: { custom, notify } } as never);

      expectFormFactory(custom, 0, "Create Prompt");

      expect(writeFile).toHaveBeenCalledWith(
        `${expectedPromptFolderPath}${input.name}.md`,
        `
        ----
        ${Object.entries(input)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")}
        ----
        `,
      );

      expect(notify).toHaveBeenCalledWith("Prompt created");
    });

    it("notifies when an prompt is local prompt created", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();
      await handleEdit({ ui: { notify } } as never);
      expect(readdir).toHaveBeenCalledWith(expectedLocalPromptPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local prompt to edit", expected);

      expect(notify).toHaveBeenCalledWith(`Prompt created`);
    });

    it("notifies when an prompt is created", async () => {
      const notify = vi.fn();
      await handleCreate({ ui: { notify } } as never);
      expect(notify).toHaveBeenCalledWith("Prompt created");
    });
  });

  describe("handleEdit", () => {
    it("notifies when an prompt is edited", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedPromptFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("prompt to edit", expected);
      expect(readFile).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(`prompt edited`);
    });

    it("notifies when an prompt is local prompt edited", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedLocalPromptPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local prompt to edit", expected);
      expect(readFile).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(`Prompt edited`);
    });

    it("notifies when an prompt editing is cancelled", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedPromptFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Prompt to edit", expected);

      expect(notify).toHaveBeenCalledWith(`Editing cancelled`);
      expect(notify).not.toHaveBeenCalledWith(`Prompt edited`);
    });
  });

  describe("handleDelete", () => {
    it("notifies when an prompt is deleted", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleDelete({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedPromptFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Prompt to delete", expected);
      expect(rm).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Prompt deleted");
    });

    it("notifies when an prompt is local prompt deleted", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleEdit({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedLocalPromptPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("Local prompt to edit", expected);
      expect(rm).toHaveBeenCalled();

      expect(notify).toHaveBeenCalledWith(`prompt deleted`);
    });
    it("notifies when an prompt deleting is cancelled", async () => {
      const expected = ["prompt1", "prompt2"];
      const notify = vi.fn();
      const select = vi.fn();

      await handleDelete({ ui: { notify } } as never);

      expect(readdir).toHaveBeenCalledWith(expectedPromptFolderPath);
      expect(readdir).toHaveReturnedWith(expected);
      expect(select).toHaveBeenCalledWith("prompt to delete", expected);

      expect(notify).toHaveBeenCalledWith(`Deleting cancelled`);
      expect(notify).not.toHaveBeenCalledWith("Prompt deleted");
    });
  });
});
