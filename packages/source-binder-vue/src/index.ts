import path from "node:path";
import MagicString from "magic-string";

export type SourceBinderVueOptions = {
  include?: (id: string) => boolean;
  root?: string;
};

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Wrapper tags that render no DOM element of their own.
// ponytail: Vue 2 kebab-case component tags are indistinguishable from
// intrinsic tags, so they get attrs too — attribute fallthrough may then
// point at the usage site instead of the definition. Acceptable hint noise.
const SKIP_TAGS = new Set([
  "template",
  "slot",
  "component",
  "transition",
  "transition-group",
  "keep-alive",
  "teleport"
]);

/** Content range of the top-level template block, or null when absent/non-HTML. */
function templateRange(code: string): { start: number; end: number } | null {
  const open = /^<template(\s[^>]*)?>/m.exec(code);
  if (!open) {
    return null;
  }
  if (open[1] && /\blang\s*=\s*["']?(?!["']?html)/.test(open[1])) {
    return null; // pug/slim & friends: not HTML we can tag
  }
  const contentStart = open.index + open[0].length;
  const rest = /<\/?template\b[^>]*>/g;
  rest.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = rest.exec(code))) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) {
      return { start: contentStart, end: match.index };
    }
  }
  return { start: contentStart, end: code.length };
}

/** Regions where tag-like text must be ignored: comments, interpolations, quoted strings. */
function excludedRanges(slice: string, offset: number): [number, number][] {
  const ranges: [number, number][] = [];
  for (const pattern of [/<!--[\s\S]*?-->/g, /\{\{[\s\S]*?\}\}/g, /"[^"\n]*"/g, /'[^'\n]*'/g]) {
    for (const match of slice.matchAll(pattern)) {
      ranges.push([offset + match.index, offset + match.index + match[0].length]);
    }
  }
  return ranges;
}

export function codegSourceBinderVue(options: SourceBinderVueOptions = {}) {
  let viteRoot = options.root ? toPosix(options.root) : process.cwd();

  return {
    name: "codeg-source-binder-vue",
    apply: "serve" as const,
    enforce: "pre" as const,
    configResolved(config: { root: string }) {
      viteRoot = toPosix(config.root);
    },
    transform(code: string, id: string) {
      const fileId = toPosix(id.split("?")[0] || id);
      if (!fileId.endsWith(".vue") || id.includes("type=")) {
        return null;
      }
      if (fileId.includes("node_modules")) {
        return null;
      }
      if (options.include && !options.include(fileId)) {
        return null;
      }
      if (code.includes("data-codeg-source-id")) {
        return null; // already instrumented
      }

      const range = templateRange(code);
      if (!range) {
        return null;
      }

      const relativeFile = toPosix(path.relative(viteRoot, fileId));
      const component = path.basename(fileId).replace(/\.vue$/, "") || "Component";

      const newlines: number[] = [];
      for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) {
        newlines.push(i);
      }
      let newlineCursor = 0;
      const lineColumnOf = (pos: number): { line: number; column: number } => {
        while (newlineCursor < newlines.length && newlines[newlineCursor] < pos) {
          newlineCursor += 1;
        }
        const previous = newlineCursor > 0 ? newlines[newlineCursor - 1] : -1;
        return { line: newlineCursor + 1, column: pos - previous };
      };

      const excluded = excludedRanges(code.slice(range.start, range.end), range.start);
      const isExcluded = (pos: number): boolean =>
        excluded.some(([from, to]) => pos >= from && pos < to);

      const magicString = new MagicString(code);
      const tagStart = /<([a-zA-Z][a-zA-Z0-9-]*)/g;
      tagStart.lastIndex = range.start;
      let changed = false;
      for (let match = tagStart.exec(code); match && match.index < range.end; match = tagStart.exec(code)) {
        const name = match[1];
        if (SKIP_TAGS.has(name.toLowerCase()) || /^[A-Z]/.test(name) || isExcluded(match.index)) {
          continue;
        }
        const { line, column } = lineColumnOf(match.index);
        const attrs = [
          ` data-codeg-source-id="${escapeAttribute(`${relativeFile}:${line}:${column}`)}"`,
          ` data-codeg-source-file="${escapeAttribute(relativeFile)}"`,
          ` data-codeg-source-line="${line}"`,
          ` data-codeg-source-column="${column}"`,
          ` data-codeg-component="${escapeAttribute(component)}"`
        ].join("");
        magicString.appendLeft(match.index + match[0].length, attrs);
        changed = true;
      }

      if (!changed) {
        return null;
      }
      return {
        code: magicString.toString(),
        map: magicString.generateMap({ hires: true })
      };
    }
  };
}
