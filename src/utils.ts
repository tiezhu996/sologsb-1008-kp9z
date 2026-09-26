import type { DiffToken, LayoutSpec, SignItem, TermBinding } from "./types";

export function estimatedLines(text: string, width: number, fontSize: number, lineHeight = 1.25) {
  if (!text.trim()) return [];
  const usable = Math.max(120, width - 48);
  const lines: string[] = [];
  for (const hardLine of text.split("\n")) {
    if (!hardLine) {
      lines.push("");
      continue;
    }
    let current = "";
    let currentWidth = 0;
    for (const char of hardLine) {
      const charWidth = /[\u2e80-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)
        ? fontSize
        : char === " "
          ? fontSize * 0.34
          : fontSize * 0.58;
      if (current && currentWidth + charWidth > usable) {
        lines.push(current.trimEnd());
        current = char.trimStart();
        currentWidth = charWidth;
      } else {
        current += char;
        currentWidth += charWidth;
      }
    }
    if (current) lines.push(current.trimEnd());
  }
  return lines;
}

export type RiskLevel = "high" | "medium" | "low";

export interface SignAnalysis {
  lines: string[];
  visible: string[];
  /** 预计行数超过场景允许的最多行数。 */
  overflow: boolean;
  /** 译文长度超过当前宽度/字号下的建议容量。 */
  tooLong: boolean;
  /** 预览宽度或字号不在所属场景规格范围内。 */
  outOfSpec: boolean;
  missingTerms: TermBinding[];
  risk: RiskLevel;
}

export const FALLBACK_SPEC: LayoutSpec = {
  id: "scn-fallback",
  name: "未指定场景",
  widths: [320, 480, 720, 960],
  minFont: 28,
  maxFont: 88,
  maxLines: 3,
  updatedAt: "",
};

export function analyzeSign(sign: SignItem, spec: LayoutSpec | undefined, width: number, fontSize: number): SignAnalysis {
  const layout = spec ?? FALLBACK_SPEC;
  const lines = estimatedLines(sign.targetText, width, fontSize);
  const maxLines = Math.max(1, layout.maxLines);
  const visible = lines.slice(0, maxLines);
  const overflow = lines.length > maxLines;
  const estimatedCharacterLimit = Math.max(12, Math.floor((width - 48) / (fontSize * 0.55)) * maxLines);
  const tooLong = sign.targetText.replace(/\s/g, "").length > estimatedCharacterLimit;
  const outOfSpec =
    !layout.widths.includes(width) || fontSize < layout.minFont || fontSize > layout.maxFont;
  const missingTerms = sign.terms.filter(
    (term) => term.required && !sign.targetText.toLocaleLowerCase().includes(term.target.toLocaleLowerCase()),
  );
  return {
    lines,
    visible,
    overflow,
    tooLong,
    outOfSpec,
    missingTerms,
    risk:
      overflow || tooLong || outOfSpec || missingTerms.length
        ? "high"
        : lines.length >= maxLines - 1
          ? "medium"
          : "low",
  };
}

/** 把标识上记录的宽度档/字号收敛到场景规格允许的范围内。 */
export function clampLayout(spec: LayoutSpec | undefined, width: number, fontSize: number) {
  const layout = spec ?? FALLBACK_SPEC;
  const nextWidth = layout.widths.includes(width)
    ? width
    : layout.widths.includes(480)
      ? 480
      : layout.widths[0];
  const nextFont = Math.min(layout.maxFont, Math.max(layout.minFont, fontSize));
  return { width: nextWidth, font: nextFont };
}

function tokenize(value: string) {
  return value.match(/[\u3400-\u9fff]|[A-Za-zÀ-ÿ0-9'’\-]+|\s+|./gu) ?? [];
}

function lcsTable(left: string[], right: string[]) {
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function diffText(oldText: string, newText: string): DiffToken[] {
  const left = tokenize(oldText);
  const right = tokenize(newText);
  if (left.length * right.length > 180000) {
    return [{ type: "remove", value: oldText }, { type: "add", value: newText }];
  }
  const table = lcsTable(left, right);
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  const push = (type: DiffToken["type"], value: string) => {
    const previous = tokens.at(-1);
    if (previous?.type === type) previous.value += value;
    else tokens.push({ type, value });
  };
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      push("same", left[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("remove", left[i]);
      i += 1;
    } else {
      push("add", right[j]);
      j += 1;
    }
  }
  while (i < left.length) push("remove", left[i++]);
  while (j < right.length) push("add", right[j++]);
  return tokens;
}

export function cloneTerms(terms: TermBinding[]) {
  return structuredClone(terms);
}
