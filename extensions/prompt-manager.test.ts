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

import registerPromptManager, {
	createPromptForm,
	handleCreate,
	handleDelete,
	handleEdit,
	parsePromptFormValues,
} from "./prompt-manager";

describe("extensions/prompt-manager", () => {
	const extensionName = "prompt-manager";
	const expectedPromptPath = join(
		"/test-home",
		".pi",
		"prompts",
		"create-react-component.md",
	);

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

			registerPromptManager({ registerCommand } as never);

			expect(registerCommand).toHaveBeenCalledWith(
				"resource:prompts",
				expect.objectContaining({ description: "This is for managing prompts" }),
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

	describe("createPromptForm", () => {
		it("uses the shared form component and required footer", () => {
			const form = createPromptForm(createTui(), createTheme(), vi.fn());
			const lines = form.render(100).join("\n");

			expect(form).toBeInstanceOf(Form);
			expect(lines).toContain("Create Prompt");
			expect(lines).toContain("argument-hint is optional");
			expect(lines).toContain("Templat");
		});

		it("renders the expected errors when invalid values are submitted", () => {
			const form = createPromptForm(createTui(), createTheme(), vi.fn());

			form.focused = true;
			form.handleInput("U");
			form.handleInput("P");
			form.handleInput(Key.tab);

			form.handleInput("s");
			form.handleInput("h");
			form.handleInput("o");
			form.handleInput("r");
			form.handleInput("t");
			form.handleInput(Key.tab);

			form.handleInput("p");
			form.handleInput("l");
			form.handleInput("a");
			form.handleInput("i");
			form.handleInput("n");
			form.handleInput(Key.enter);

			const lines = form.render(100).join("\n");

			expect(lines).toContain("Name must be at least 3 characters");
			expect(lines).toContain(
				"Name must be lowercase letters, numbers, and dashes only",
			);
			expect(lines).toContain("Description must be at least 35 characters");
			expect(lines).toContain("Argument hint must use [] or <> tokens");
		});

		it("validates later fields when name is filled first", () => {
			const form = createPromptForm(createTui(), createTheme(), vi.fn());

			form.focused = true;
			form.handleInput("b");
			form.handleInput("u");
			form.handleInput("i");
			form.handleInput("l");
			form.handleInput("d");

			form.handleInput(Key.tab);
			form.handleInput(Key.tab);
			form.handleInput(Key.enter);

			const lines = form.render(100).join("\n");

			expect(lines).not.toContain("Name must be at least 3 characters");
			expect(lines).not.toContain(
				"Name must be lowercase letters, numbers, and dashes only",
			);
			expect(lines).toContain("Description must be at least 35 characters");
			expect(lines).not.toContain("Argument hint must use [] or <> tokens");
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
					description:
						"This prompt creates a React component with full file output",
					"argument-hint": "<name> [directory]",
				})
				.mockResolvedValueOnce("Write the component template here");
			const notify = vi.fn();

			await handleCreate({ ui: { custom, notify } } as never);

			const [formFactory, formOptions] = custom.mock.calls[0] as [
				(...args: never[]) => unknown,
				unknown,
			];
			const [editorFactory, editorOptions] = custom.mock.calls[1] as [
				(...args: never[]) => { render: (width: number) => string[] },
				unknown,
			];
			const content = await getResourceFileSystem().readFile(
				expectedPromptPath,
				"utf8",
			);

			expect(
				formFactory(
					createTui() as never,
					createTheme() as never,
					{} as never,
					vi.fn() as never,
				),
			).toBeInstanceOf(Form);
			expect(
				editorFactory(
					createTui() as never,
					createTheme() as never,
					{} as never,
					vi.fn() as never,
				)
					.render(80)
					.join("\n"),
			).toContain("Edit Prompt Template");
			expect(formOptions).toEqual({
				overlay: true,
				overlayOptions: { offsetY: -500 },
			});
			expect(editorOptions).toEqual({
				overlay: true,
				overlayOptions: { anchor: "center", width: "80%", maxHeight: "80%" },
			});
			expect(content).toContain("argument-hint: <name> [directory]");
			expect(content).toContain("Write the component template here");
			expect(notify).toHaveBeenCalledWith("Prompt created");
		});

		it("reports cancellation when prompt creation form is dismissed", async () => {
			const notify = vi.fn();

			await handleCreate({
				ui: { custom: vi.fn().mockResolvedValueOnce(null), notify },
			} as never);

			await expect(
				getResourceFileSystem().readFile(expectedPromptPath, "utf8"),
			).rejects.toThrow();
			expect(notify).toHaveBeenCalledWith("Prompt creation cancelled", "info");
		});

		it("reports cancellation when the prompt template overlay is dismissed", async () => {
			const notify = vi.fn();
			const custom = vi
				.fn()
				.mockResolvedValueOnce({
					name: "create-react-component",
					description:
						"This prompt creates a React component with full file output",
					"argument-hint": "<name>",
				})
				.mockResolvedValueOnce(undefined);

			await handleCreate({ ui: { custom, notify } } as never);

			await expect(
				getResourceFileSystem().readFile(expectedPromptPath, "utf8"),
			).rejects.toThrow();
			expect(notify).toHaveBeenCalledWith("Prompt creation cancelled", "info");
		});
	});

	describe("handleEdit", () => {
		it("edits the selected global prompt", async () => {
			seedMemoryResourceFileSystem({
				[expectedPromptPath]: "---\nname: create-react-component\n---\n",
			});
			const select = vi
				.fn()
				.mockResolvedValueOnce("global: create-react-component");
			const editor = vi.fn().mockResolvedValueOnce("updated prompt content");
			const notify = vi.fn();

			await handleEdit({ ui: { notify, select, editor } } as never);

			const content = await getResourceFileSystem().readFile(
				expectedPromptPath,
				"utf8",
			);

			expect(select).toHaveBeenCalledWith("Edit Prompt", [
				"global: create-react-component",
			]);
			expect(editor).toHaveBeenCalledWith(
				"Edit Prompt",
				"---\nname: create-react-component\n---\n",
			);
			expect(content).toBe("updated prompt content");
			expect(notify).toHaveBeenCalledWith("Prompt edited");
		});

		it("edits the selected grouped prompt index", async () => {
			const groupedPromptPath = join(
				"/test-home",
				".pi",
				"prompts",
				"frontend",
				"_index.md",
			);
			seedMemoryResourceFileSystem({
				[groupedPromptPath]: "---\nname: frontend\ntype: group\n---\n",
			});
			const select = vi.fn().mockResolvedValueOnce("global: frontend");
			const editor = vi
				.fn()
				.mockResolvedValueOnce("updated grouped prompt content");
			const notify = vi.fn();

			await handleEdit({ ui: { notify, select, editor } } as never);

			const content = await getResourceFileSystem().readFile(
				groupedPromptPath,
				"utf8",
			);

			expect(select).toHaveBeenCalledWith("Edit Prompt", ["global: frontend"]);
			expect(editor).toHaveBeenCalledWith(
				"Edit Prompt",
				"---\nname: frontend\ntype: group\n---\n",
			);
			expect(content).toBe("updated grouped prompt content");
			expect(notify).toHaveBeenCalledWith("Prompt edited");
		});

		it("reports cancellation when the prompt editor is dismissed", async () => {
			seedMemoryResourceFileSystem({
				[expectedPromptPath]: "---\nname: create-react-component\n---\n",
			});
			const notify = vi.fn();

			await handleEdit({
				ui: {
					select: vi
						.fn()
						.mockResolvedValueOnce("global: create-react-component"),
					editor: vi.fn().mockResolvedValueOnce(undefined),
					notify,
				},
			} as never);

			const content = await getResourceFileSystem().readFile(
				expectedPromptPath,
				"utf8",
			);

			expect(content).toBe("---\nname: create-react-component\n---\n");
			expect(notify).toHaveBeenCalledWith("Prompt editing cancelled", "info");
		});
	});

	describe("handleDelete", () => {
		it("deletes the selected prompt", async () => {
			seedMemoryResourceFileSystem({
				[expectedPromptPath]: "---\nname: create-react-component\n---\n",
			});
			const select = vi
				.fn()
				.mockResolvedValueOnce("global: create-react-component");
			const notify = vi.fn();

			await handleDelete({ ui: { notify, select } } as never);

			await expect(
				getResourceFileSystem().readFile(expectedPromptPath, "utf8"),
			).rejects.toThrow();
			expect(select).toHaveBeenCalledWith("Delete Prompt", [
				"global: create-react-component",
			]);
			expect(notify).toHaveBeenCalledWith("Prompt deleted");
		});

		it("deletes the selected grouped prompt directory", async () => {
			const groupedPromptPath = join(
				"/test-home",
				".pi",
				"prompts",
				"frontend",
				"_index.md",
			);
			seedMemoryResourceFileSystem({
				[groupedPromptPath]: "---\nname: frontend\ntype: group\n---\n",
			});
			const select = vi.fn().mockResolvedValueOnce("global: frontend");
			const notify = vi.fn();

			await handleDelete({ ui: { notify, select } } as never);

			await expect(
				getResourceFileSystem().readFile(groupedPromptPath, "utf8"),
			).rejects.toThrow();
			expect(select).toHaveBeenCalledWith("Delete Prompt", [
				"global: frontend",
			]);
			expect(notify).toHaveBeenCalledWith("Prompt deleted");
		});
	});
});
