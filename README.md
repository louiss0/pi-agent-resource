# pi-agent-resource

A PI package that installs an extension for creating, editing, deleting, and listing:

- Agents in `.pi/agents/*.md`
- Skills in `~/.pi/agents/skills/<name>/SKILL.md`
- Prompts in `.pi/prompts/*.md` or grouped prompt directories

## What it does

The extension provides an interactive wizard that keeps prompting for the information it needs until the resource is ready.

It supports:

- creating agents
- creating Agent Skills spec compliant skills
- creating ungrouped prompts
- creating grouped prompts with `_index.md` and subcommands
- editing existing resources
- deleting existing resources
- listing current resources

## Installed extension

The package exposes the extension from `@extensions/resource-studio/index.ts`.

## Commands

- `/resource-studio`
- `manage_project_resources` custom tool

## Prompt behavior

When creating a prompt, the wizard asks whether the prompt should be:

- `ungrouped` → `.pi/prompts/<name>.md`
- `grouped` → `.pi/prompts/<group>/_index.md` with one or more subcommands

Grouped prompts follow the `_index.md` + `type: group` layout used by grouped PI prompt sets.

## Development mode

The repository uses a local `.env` file for development mode.

```env
PI_RESOURCE_DEV=1
```

When that variable is set, the extension shows its development notice and uses the in-memory filesystem.

## Tests

```bash
npm test
```
