import { picklist, safeParse } from "valibot";

export const SUBCOMMANDS = picklist(["create", "edit", "delete"]);

export function parseSubCommandValuesFromArgument(argument: string) {
  return safeParse(SUBCOMMANDS, argument);
}

function generateSubcommandArgumentCompletionsUsingSubLabel(subLabel: string) {
  return SUBCOMMANDS.options.map((option) =>
    option === "create"
      ? {
          label: `${option}:${subLabel}`,
          value: option,
          description: `${option[0].toUpperCase()}${option.substring(1)} a new ${subLabel}`,
        }
      : {
          label: `${option}:${subLabel}`,
          value: option,
          description: `${option[0].toUpperCase()}${option.substring(1)} a ${subLabel}`,
        },
  );
}

export function getFilterSubcommandArgumentCompletionFromStringUsingSubLabel(subLabel: string) {
  const completions = generateSubcommandArgumentCompletionsUsingSubLabel(subLabel);
  return (value: string) =>
    completions.filter((completion) => completion.value.startsWith(value));
}
