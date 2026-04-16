import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { SUBCOMMANDS } from "../shared/subcommands";
import { generateCommandHandlerUsingDeps } from "./skill-creator";

describe("Skill Creator", () => {
  const context: { ui: Partial<ExtensionCommandContext["ui"]> } = {
    ui: {
      notify: vi.fn(),
    },
  };

  describe("Testing generateCommandHandlerUsingDeps", () => {
    let handler: ReturnType<typeof generateCommandHandlerUsingDeps>;

    beforeAll(() => {
      handler = generateCommandHandlerUsingDeps({});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should notify on invalid command", async () => {
      await handler("invalid", context as ExtensionCommandContext);

      expect(context.ui.notify).toHaveBeenCalledWith(
        'Invalid command: × Invalid type: Expected ("create" | "edit" | "delete") but received "invalid"',
        "error",
      );
    });

    it(`should work when ${SUBCOMMANDS.options[0]} is called`, async () => {
      await handler("create", context as ExtensionCommandContext);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill created successfully");
    });

    it(`should work when ${SUBCOMMANDS.options[1]} is called`, async () => {
      await handler("edit", context as ExtensionCommandContext);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill edited successfully");
    });

    it(`should work when ${SUBCOMMANDS.options[2]} is called`, async () => {
      await handler("delete", context as ExtensionCommandContext);

      expect(context.ui.notify).toHaveBeenCalledWith("Skill deleted successfully");
    });
  });
});
