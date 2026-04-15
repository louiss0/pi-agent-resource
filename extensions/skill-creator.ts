import { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  getFilterSubcommandArgumentCompletionFromStringUsingSubLabel,
  parseSubCommandValuesFromArgument,
} from "../shared/subcommands";
export default (pi: ExtensionAPI) => {
  pi.registerCommand("resource:skill", {
    description: "This is for creating a new skill",
    getArgumentCompletions:
      getFilterSubcommandArgumentCompletionFromStringUsingSubLabel("skill"),

    handler: async (arg, ctx) => {
      const result = parseSubCommandValuesFromArgument(arg);

      if (!result.success) {
        ctx.ui.notify(`Invalid command: ${result.issues[0].message}`);
        return;
      }

      switch (result.output) {
        case "create":
          ctx.ui.notify("Skill created successfully");
          break;
        case "edit":
          ctx.ui.notify("Skill edited successfully");
          break;
        case "delete":
          ctx.ui.notify("Skill deleted successfully");
          break;
      }
    },
  });
};
