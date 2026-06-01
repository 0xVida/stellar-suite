import type * as Monaco from "monaco-editor";

const ATTRIBUTE_LINE_REGEX = /^\s*#\[[^\]]*\]\s*$/;
const EMPTY_LINE_REGEX = /^\s*$/;

function isAttributeLine(line: string): boolean {
  return ATTRIBUTE_LINE_REGEX.test(line);
}

function stripTripleSlash(line: string): string {
  return line.replace(/^\s*\/\/\/\s?/, "");
}

function stripBlockDocLine(line: string, isFirst: boolean, isLast: boolean): string {
  let next = line.trim();

  if (isFirst) {
    next = next.replace(/^\/\*\*\s?/, "");
  }

  if (isLast) {
    next = next.replace(/\s*\*\/$/, "");
  }

  next = next.replace(/^\*\s?/, "");
  return next;
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractDocComment(lines: string[], symbolLine: number): string {
  let cursor = symbolLine - 1;

  while (cursor >= 0 && isAttributeLine(lines[cursor])) {
    cursor -= 1;
  }

  if (cursor < 0) {
    return "";
  }

  const current = lines[cursor] ?? "";
  const currentTrimmed = current.trim();

  if (currentTrimmed.startsWith("///")) {
    const collected: string[] = [];

    for (let index = cursor; index >= 0; index -= 1) {
      const line = lines[index] ?? "";
      const trimmed = line.trim();

      if (trimmed.startsWith("///")) {
        collected.push(stripTripleSlash(line));
        continue;
      }

      if (EMPTY_LINE_REGEX.test(line)) {
        if (collected.length === 0) {
          return "";
        }
        collected.push("");
        continue;
      }

      break;
    }

    return collected.reverse().join("\n").trimEnd();
  }

  if (currentTrimmed.endsWith("*/") || currentTrimmed.startsWith("/**")) {
    const blockLines: string[] = [];
    let blockStart = -1;

    for (let index = cursor; index >= 0; index -= 1) {
      const line = lines[index] ?? "";
      blockLines.push(line);
      if (line.includes("/**")) {
        blockStart = index;
        break;
      }
    }

    if (blockStart === -1) {
      return "";
    }

    blockLines.reverse();
    const stripped = blockLines.map((line, index) =>
      stripBlockDocLine(line, index === 0, index === blockLines.length - 1),
    );

    return stripped.join("\n").trim();
  }

  return "";
}

export function extractSignature(lines: string[], symbolLine: number): string {
  let start = symbolLine;

  while (start < lines.length && isAttributeLine(lines[start] ?? "")) {
    start += 1;
  }

  if (start >= lines.length) {
    return "";
  }

  const line = lines[start] ?? "";

  if (/^\s*(pub\s+)?(async\s+)?fn\s+\w+\b/.test(line)) {
    const parts: string[] = [];

    for (let index = start; index < lines.length; index += 1) {
      const nextLine = (lines[index] ?? "").trim();
      const braceIndex = nextLine.indexOf("{");
      const semicolonIndex = nextLine.indexOf(";");

      let stopIndex = -1;
      if (braceIndex >= 0 && semicolonIndex >= 0) {
        stopIndex = Math.min(braceIndex, semicolonIndex);
      } else if (braceIndex >= 0) {
        stopIndex = braceIndex;
      } else if (semicolonIndex >= 0) {
        stopIndex = semicolonIndex;
      }

      if (stopIndex >= 0) {
        const beforeStop = nextLine.slice(0, stopIndex).trim();
        if (beforeStop.length > 0) {
          parts.push(beforeStop);
        }
        break;
      }

      if (nextLine.length > 0) {
        parts.push(nextLine);
      }
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  if (/^\s*(pub\s+)?struct\s+\w+\b/.test(line)) {
    return line.trim();
  }

  if (/^\s*(pub\s+)?enum\s+\w+\b/.test(line)) {
    return line.trim();
  }

  if (/^\s*(pub\s+)?trait\s+\w+\b/.test(line)) {
    return line.trim();
  }

  if (/^\s*(pub\s+)?type\s+\w+\b/.test(line)) {
    return line.trim();
  }

  if (/^\s*(pub\s+)?const\s+\w+\b/.test(line)) {
    return line.trim();
  }

  if (/^\s*(pub\s+)?static\s+\w+\b/.test(line)) {
    return line.trim();
  }

  return "";
}

export function findSymbolLine(
  lines: string[],
  word: string,
  position: Monaco.Position,
): number {
  void position;

  const escapedWord = escapeRegExp(word);
  const patterns = [
    new RegExp(`^\\s*(pub\\s+)?(async\\s+)?fn\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?struct\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?enum\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?trait\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?type\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?const\\s+${escapedWord}\\b`),
    new RegExp(`^\\s*(pub\\s+)?static\\s+${escapedWord}\\b`),
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (patterns.some((pattern) => pattern.test(line))) {
      return index;
    }
  }

  return -1;
}
