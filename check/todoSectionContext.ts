import fs from 'node:fs';
import path from 'node:path';

type TodoSection = {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  content: string;
};

type CliOptions = {
  filePath: string;
  list: boolean;
  sectionId: string | null;
};

const defaultTodoPath = path.join(process.cwd(), 'docs/todo.md');

main();

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const markdown = fs.readFileSync(options.filePath, 'utf8');
    const sections = parseTodoSections(markdown);

    if (options.list) {
      printSectionList(options.filePath, sections);
      return;
    }

    if (!options.sectionId) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const section = sections.find((item) => item.id === options.sectionId);
    if (!section) {
      console.error(`Unknown TODO section: ${options.sectionId}`);
      console.error(`Run npm run todo:sections to list available sections.`);
      process.exitCode = 1;
      return;
    }

    printSectionContext(options.filePath, section);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    filePath: defaultTodoPath,
    list: false,
    sectionId: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--list') {
      options.list = true;
      continue;
    }

    if (arg === '--file') {
      const filePath = args[i + 1];
      if (!filePath) {
        throw new Error('--file requires a path');
      }
      options.filePath = path.resolve(process.cwd(), filePath);
      i += 1;
      continue;
    }

    if (arg === '--section') {
      const sectionId = args[i + 1];
      if (!sectionId) {
        throw new Error('--section requires a section id');
      }
      options.sectionId = sectionId;
      i += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.sectionId) {
      throw new Error(`Only one section id can be provided`);
    }
    options.sectionId = arg;
  }

  return options;
}

function parseTodoSections(markdown: string): TodoSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: TodoSection[] = [];
  const seenIds = new Set<string>();
  let current: {id: string; startLine: number; lines: string[]} | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const startMatch = line.match(/^<!--\s*todo-section:\s*([a-z0-9][a-z0-9-]*)\s*-->\s*$/);
    const endMatch = line.match(/^<!--\s*\/todo-section\s*-->\s*$/);

    if (startMatch) {
      if (current) {
        throw new Error(`Nested todo-section marker at line ${lineNumber}`);
      }
      const id = startMatch[1];
      if (seenIds.has(id)) {
        throw new Error(`Duplicate todo-section id: ${id}`);
      }
      seenIds.add(id);
      current = {id, startLine: lineNumber, lines: []};
      return;
    }

    if (endMatch) {
      if (!current) {
        throw new Error(`Closing todo-section marker without opening marker at line ${lineNumber}`);
      }
      sections.push(buildSection(current.id, current.startLine, lineNumber, current.lines));
      current = null;
      return;
    }

    if (current) {
      current.lines.push(line);
    }
  });

  if (current) {
    throw new Error(`Missing closing todo-section marker for ${current.id}`);
  }

  return sections;
}

function buildSection(id: string, startLine: number, endLine: number, lines: string[]): TodoSection {
  return {
    id,
    title: extractTitle(lines),
    startLine,
    endLine,
    content: trimOuterBlankLines(lines).join('\n'),
  };
}

function extractTitle(lines: string[]): string {
  const heading = lines.find((line) => /^#{2,6}\s+\S/.test(line));
  if (heading) {
    return heading.replace(/^#{2,6}\s+/, '').trim();
  }

  const firstText = lines.find((line) => line.trim().length > 0);
  if (firstText) {
    return firstText.trim();
  }

  return '(untitled)';
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function printSectionList(filePath: string, sections: TodoSection[]) {
  console.log(`# TODO Sections`);
  console.log(`source: ${path.relative(process.cwd(), filePath)}`);
  console.log('');
  sections.forEach((section) => {
    console.log(`- ${section.id} (${section.startLine}-${section.endLine}): ${section.title}`);
  });
}

function printSectionContext(filePath: string, section: TodoSection) {
  console.log(`# TODO Section Context`);
  console.log(`source: ${path.relative(process.cwd(), filePath)}`);
  console.log(`section: ${section.id}`);
  console.log(`lines: ${section.startLine}-${section.endLine}`);
  console.log('');
  console.log(section.content);
}

function printUsage() {
  console.log(`Usage:`);
  console.log(`  npm run todo:sections`);
  console.log(`  npm run todo:context -- <section-id>`);
  console.log(`  npm run todo:context -- --section <section-id>`);
  console.log(`  npm run todo:context -- --file docs/todo.md --list`);
}
