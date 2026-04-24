import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { Form } from "../shared/components";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  createPromptForm,
  handleCreate,
  handleDelete,
  handleEdit,
  parsePromptFormValues,
} from "./prompt-manager";

describe("extensions/prompt-manager", () => {
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

  describe("createPromptForm", () => {
    it("uses the shared form component and required footer", () => {
      const form = createPromptForm(createTui(), createTheme(), vi.fn());
      const lines = form.render(100).join("\n");

      expect(form).toBeInstanceOf(Form);
      expect(lines).toContain("Create Prompt");
      expect(lines).toContain("argument-hint is optional");
      expect(lines).toContain("Templat");
    });
  });

  describe("parsePromptFormValues", () => {
    it("validates prompt form values", () => {
      const errors = parsePromptFormValues({
        name: "UP",
        description: "too short",
        "argument-hint": "plain",
      });

      expect(errors).toEqual({
        name: "Name must be at least 3 characters\nName must be lowercase letters, numbers, and dashes only",
        description: "Description must be at least 35 characters",
        "argument-hint": "Argument hint must use [] or <> tokens",
      });
    });
  });

  describe("handleCreate", () => {
    it("writes the created prompt after the template overlay submits", async () => {
      const custom = vi
        .fn()
        .mockResolvedValueOnce({
          name: "create-react-component",
          description: "This prompt creates a React component with full file output",
          "argument-hint": "<name> [directory]",
        })
        .mockResolvedValueOnce("Write the component template here");
      const notify = vi.fn();

      await handleCreate({ ui: { custom, notify } } as never);

      const [formFactory, formOptions] = custom.mock.calls[0] as [(...args: never[]) => unknown, unknown];
      const [editorFactory, editorOptions] = custom.mock.calls[1] as [
        (...args: never[]) => { render: (width: number) => string[] },
        unknown,
      ];

      expect(
        formFactory(createTui() as never, createTheme() as never, {} as never, vi.fn() as never),
      ).toBeInstanceOf(Form);
      expect(
        editorFactory(createTui() as never, createTheme() as never, {} as never, vi.fn() as never)
          .render(80)
          .join("\n"),
      ).toContain("Edit Prompt Template");
      expect(formOptions).toEqual({ overlay: true, overlayOptions: { offsetY: -500 } });
      expect(editorOptions).toEqual({
        overlay: true,
        overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%" },
      });
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]\.pi[\\/]prompts[\\/]create-react-component\.md$/),
        expect.stringContaining("argument-hint: <name> [directory]"),
        "utf8",
      );
      expect(notify).toHaveBeenCalledWith("Prompt created");
    });

    it("reports cancellation when prompt creation form is dismissed", async () => {
      const notify = vi.fn();

      await handleCreate({ ui: { custom: vi.fn().mockResolvedValueOnce(null), notify } } as never);

      expect(writeFile).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Prompt creation cancelled", "info");
    });

    it("reports cancellation when the prompt template overlay is dismissed", async () => {
      const notify = vi.fn();
      const custom = vi
        .fn()
        .mockResolvedValueOnce({
          name: "discarded-name",
          description: "This prompt creates a React component with full file output",
          "argument-hint": "<name>",
        })
        .mockResolvedValueOnce(undefined);

      await handleCreate({ ui: { custom, notify } } as never);

      expect(writeFile).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Prompt creation cancelled", "info");
    });
  });

  describe("handleEdit", () => {
    it("edits the selected local prompt", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["create-react-component.md"] as never);
      vi.mocked(readFile).mockResolvedValueOnce("---\nname: create-react-component\n---\n" as never);
      const select = vi.fn().mockResolvedValueOnce("local: create-react-component");
      const notify = vi.fn();

      await handleEdit({ ui: { notify, select } } as never);

      expect(select).toHaveBeenCalledWith("Edit Prompt", ["local: create-react-component"]);
      expect(readFile).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]?\.pi[\\/]prompts[\\/]create-react-component\.md$/),
        "utf8",
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]?\.pi[\\/]prompts[\\/]create-react-component\.md$/),
        "---\nname: create-react-component\n---\n",
        "utf8",
      );
      expect(notify).toHaveBeenCalledWith("Prompt edited");
    });
  });

  describe("handleDelete", () => {
    it("deletes the selected prompt", async () => {
      vi.mocked(readdir).mockResolvedValueOnce(["create-react-component.md"] as never);
      const select = vi.fn().mockResolvedValueOnce("local: create-react-component");
      const notify = vi.fn();

      await handleDelete({ ui: { notify, select } } as never);

      expect(select).toHaveBeenCalledWith("Delete Prompt", ["local: create-react-component"]);
      expect(rm).toHaveBeenCalledWith(
        expect.stringMatching(/[\\/]?\.pi[\\/]prompts[\\/]create-react-component\.md$/),
        { force: true, recursive: true },
      );
      expect(notify).toHaveBeenCalledWith("Prompt deleted");
    });
  });
});
