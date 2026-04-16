import type {
  ExtensionAPI,
  ExtensionContext,
  RegisteredCommand,
} from "@mariozechner/pi-coding-agent";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  parseSubCommandValuesFromArgument,
} from "../shared/subcommands";
import { summarize } from "valibot";

export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:skill", {
    description: "This is for creating a new skill",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("skill"),
    handler: generateCommandHandlerUsingDeps({}),
  });
};

type Dependencies = Record<string, unknown>;

export function generateCommandHandlerUsingDeps(
  _dependency: Dependencies,
): RegisteredCommand["handler"] {
  return async (arg, ctx) => {
    const result = parseSubCommandValuesFromArgument(arg);

    if (!result.success) {
      ctx.ui.notify(`Invalid command: ${summarize(result.issues)}`, "error");
      return;
    }

    switch (result.output) {
      case "create":
        handleCreate(ctx);
        break;
      case "edit":
        handleEdit(ctx);
        break;
      case "delete":
        handleDelete(ctx);
        break;
    }
  };
}

function handleCreate(ctx: ExtensionContext) {
  ctx.ui.notify("Skill created successfully");
}

function handleEdit(ctx: ExtensionContext) {
  ctx.ui.notify("Skill edited successfully");
}

function handleDelete(ctx: ExtensionContext) {
  ctx.ui.notify("Skill deleted successfully");
}
