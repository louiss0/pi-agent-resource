import { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  SubCommands,
} from "../shared/subcommands";

export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:prompts", {
    description: "This is for managing prompts",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("prompt"),
    handler: async (arg, ctx) => {
      const result = SubCommands.parse(arg);
      if (!result.success) {
        ctx.ui.notify(`Invalid command: ${result.errorMessage}`, "error");
        return;
      }

      switch (result.output) {
        case "create":
          await handleCreate(ctx);
          break;
        case "edit":
          await handleEdit(ctx);
          break;
        case "delete":
          await handleDelete(ctx);
          break;
      }
    },
  });
};

export async function handleCreate(ctx: ExtensionContext) {
  ctx.ui.notify("Prompt created");
}

export async function handleEdit(ctx: ExtensionContext) {
  ctx.ui.notify("Prompt edited");
}

export async function handleDelete(ctx: ExtensionContext) {
  ctx.ui.notify("Prompt deleted");
}
