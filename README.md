# pi-agent-resource

A PI package that installs an extension for creating, editing, deleting, and listing project-local:

- Agents in `.pi/agents/*.md`
- Skills in `.pi/skills/<name>/SKILL.md`
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
- listing current project-local resources

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

## Tests

```bash
npm test
```
