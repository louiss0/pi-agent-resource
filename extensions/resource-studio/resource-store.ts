import path from "node:path";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";

const kebabCaseNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ResourceEntry = {
  kind: string;
  name: string;
  command: string;
  filePath: string;
  label: string;
  directoryPath?: string;
  groupName?: string;
  indexFilePath?: string;
};

export function isValidResourceName(name: string): boolean {
  return kebabCaseNamePattern.test(name);
}

export function buildAgentDocument({
  description = "",
  body = "Describe this agent's responsibilities, constraints, and workflow here.\n",
}: {
  description?: string;
  body?: string;
} = {}): string {
  return `${buildFrontmatter({ description })}\n${body.trimEnd()}\n`;
}

export function buildPromptDocument({
  description = "",
  body = "Describe when to use this prompt and what output it should produce.\n",
}: {
  description?: string;
  body?: string;
} = {}): string {
  return `${buildFrontmatter({ description })}\n${body.trimEnd()}\n`;
}

export function buildSkillDocument({
  name,
  description,
  license = "",
  compatibility = "",
  body,
}: {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  body?: string;
}): string {
  const defaultBody = `# ${name}\n\n## Purpose\n\nDescribe what this skill does and when the agent should use it.\n\n## Workflow\n\n- Describe the recommended sequence of steps.\n- Reference helper files relative to this skill directory when needed.\n\n## Verification\n\n\`\`\`bash\n# Add verification commands here\n\`\`\`\n`;

  return `${buildFrontmatter({ name, description, license, compatibility })}\n${(body ?? defaultBody).trimEnd()}\n`;
}

export function buildPromptGroupIndex({
  description = "",
  order = [],
}: {
  description?: string;
  order?: string[];
} = {}): string {
  return `${buildFrontmatter({ type: "group", description, order })}\n`;
}

export function readPromptGroupOrder(document: string): string[] {
  const frontmatter = readFrontmatter(document);
  const orderLine = frontmatter.find((line) => line.startsWith("order:"));
  if (!orderLine) return [];

  const arrayMatch = orderLine.match(/^order:\s*\[(.*)\]\s*$/);
  if (!arrayMatch) return [];

  return arrayMatch[1].split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function removePromptSubcommandFromOrder(indexFilePath: string, subcommandName: string): Promise<void> {
  const document = await readFile(indexFilePath, "utf8");
  const order = readPromptGroupOrder(document).filter((entry) => entry !== subcommandName);
  await writeFile(indexFilePath, upsertPromptGroupOrder(document, order));
}

export async function appendPromptSubcommandToOrder(indexFilePath: string, subcommandName: string): Promise<void> {
  const document = await readFile(indexFilePath, "utf8");
  const order = readPromptGroupOrder(document);
  if (!order.includes(subcommandName)) order.push(subcommandName);
  await writeFile(indexFilePath, upsertPromptGroupOrder(document, order));
}

export async function listProjectAgents(cwd: string): Promise<ResourceEntry[]> {
  const agentDirectory = await getProjectResourceDirectory(cwd, [".pi", "agents"]);
  const entries = await readDirectoryEntries(agentDirectory);

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const name = path.basename(entry.name, ".md");
      const filePath = path.join(agentDirectory, entry.name);

      return {
        kind: "agent",
        name,
        command: `@${name}`,
        filePath,
        label: `${name} — ${toRelativeProjectPath(cwd, filePath)}`,
      } satisfies ResourceEntry;
    })
    .sort(compareByLabel);
}

export async function listProjectSkills(cwd: string): Promise<ResourceEntry[]> {
  const skillDirectory = await getProjectResourceDirectory(cwd, [".pi", "skills"]);
  const entries = await readDirectoryEntries(skillDirectory);
  const skills: ResourceEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const filePath = path.join(skillDirectory, entry.name, "SKILL.md");
    if (!(await pathExists(filePath))) continue;

    skills.push({
      kind: "skill",
      name: entry.name,
      command: `/skill:${entry.name}`,
      filePath,
      directoryPath: path.join(skillDirectory, entry.name),
      label: `${entry.name} — ${toRelativeProjectPath(cwd, filePath)}`,
    });
  }

  return skills.sort(compareByLabel);
}

export async function listProjectPrompts(cwd: string): Promise<ResourceEntry[]> {
  const promptDirectory = await getProjectResourceDirectory(cwd, [".pi", "prompts"]);
  const entries = await readDirectoryEntries(promptDirectory);
  const prompts: ResourceEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(promptDirectory, entry.name);

    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = path.basename(entry.name, ".md");
      prompts.push({
        kind: "flat",
        name,
        command: `/${name}`,
        filePath: entryPath,
        label: `/${name} — ${toRelativeProjectPath(cwd, entryPath)}`,
      });
      continue;
    }

    if (!entry.isDirectory()) continue;

    const indexFilePath = path.join(entryPath, "_index.md");
    if (!(await pathExists(indexFilePath))) continue;

    const indexDocument = await readFile(indexFilePath, "utf8");
    if (!isPromptGroupDocument(indexDocument)) continue;

    prompts.push({
      kind: "group",
      name: entry.name,
      command: `/${entry.name}`,
      filePath: indexFilePath,
      directoryPath: entryPath,
      label: `/${entry.name} — ${toRelativeProjectPath(cwd, indexFilePath)}`,
    });

    const subcommandEntries = await readDirectoryEntries(entryPath);
    for (const subcommandEntry of subcommandEntries) {
      if (!subcommandEntry.isFile()) continue;
      if (!subcommandEntry.name.endsWith(".md") || subcommandEntry.name === "_index.md") continue;

      const subcommandName = path.basename(subcommandEntry.name, ".md");
      const subcommandFilePath = path.join(entryPath, subcommandEntry.name);

      prompts.push({
        kind: "subcommand",
        name: subcommandName,
        groupName: entry.name,
        command: `/${entry.name} ${subcommandName}`,
        filePath: subcommandFilePath,
        directoryPath: entryPath,
        indexFilePath,
        label: `/${entry.name} ${subcommandName} — ${toRelativeProjectPath(cwd, subcommandFilePath)}`,
      });
    }
  }

  return prompts.sort(comparePromptEntries);
}

export async function getProjectResourceDirectory(cwd: string, relativeSegments: string[]): Promise<string> {
  const existingDirectory = await findNearestExistingDirectory(cwd, relativeSegments);
  return existingDirectory ?? path.join(cwd, ...relativeSegments);
}

export async function ensureProjectResourceDirectory(cwd: string, relativeSegments: string[]): Promise<string> {
  const directoryPath = await getProjectResourceDirectory(cwd, relativeSegments);
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

export async function deleteFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function deleteDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, { recursive: true, force: true });
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

export async function countMarkdownFiles(directoryPath: string): Promise<number> {
  const entries = await readDirectoryEntries(directoryPath);
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "_index.md").length;
}

export function toRelativeProjectPath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || path.basename(filePath);
}

function buildFrontmatter(fields: Record<string, string | string[]>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value.trim().length > 0)
    .map(([key, value]) => Array.isArray(value) ? `${key}: [${value.join(", ")}]` : `${key}: ${formatYamlScalar(value)}`);

  if (lines.length === 0) return "";
  return `---\n${lines.join("\n")}\n---`;
}

function formatYamlScalar(value: string): string {
  if (/^[^:"'\[\]{}#,]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function readFrontmatter(document: string): string[] {
  const match = document.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  return match[1].split("\n").map((line) => line.trim()).filter(Boolean);
}

function isPromptGroupDocument(document: string): boolean {
  return readFrontmatter(document).some((line) => line === "type: group" || line === 'type: "group"');
}

function upsertPromptGroupOrder(document: string, order: string[]): string {
  if (!document.startsWith("---\n")) return `${buildPromptGroupIndex({ order }).trimEnd()}\n`;

  const frontmatterMatch = document.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return `${buildPromptGroupIndex({ order }).trimEnd()}\n`;

  const frontmatterLines = frontmatterMatch[1].split("\n");
  const nextFrontmatterLines: string[] = [];
  let wroteOrder = false;

  for (const line of frontmatterLines) {
    if (line.startsWith("order:")) {
      nextFrontmatterLines.push(`order: [${order.join(", ")}]`);
      wroteOrder = true;
      continue;
    }

    nextFrontmatterLines.push(line);
  }

  if (!wroteOrder) nextFrontmatterLines.push(`order: [${order.join(", ")}]`);

  const body = document.slice(frontmatterMatch[0].length);
  return `---\n${nextFrontmatterLines.join("\n")}\n---${body}`;
}

async function findNearestExistingDirectory(cwd: string, relativeSegments: string[]): Promise<string | undefined> {
  let currentDirectory = path.resolve(cwd);

  while (true) {
    const candidateDirectory = path.join(currentDirectory, ...relativeSegments);
    if (await isDirectory(candidateDirectory)) return candidateDirectory;

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) return undefined;
    currentDirectory = parentDirectory;
  }
}

async function isDirectory(candidatePath: string): Promise<boolean> {
  try {
    const entry = await stat(candidatePath);
    return entry.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function compareByLabel(left: ResourceEntry, right: ResourceEntry): number {
  return left.label.localeCompare(right.label);
}

function comparePromptEntries(left: ResourceEntry, right: ResourceEntry): number {
  const leftWeight = promptKindWeight[left.kind] ?? 99;
  const rightWeight = promptKindWeight[right.kind] ?? 99;
  if (leftWeight !== rightWeight) return leftWeight - rightWeight;
  return left.command.localeCompare(right.command);
}

const promptKindWeight: Record<string, number> = {
  group: 0,
  subcommand: 1,
  flat: 2,
};
