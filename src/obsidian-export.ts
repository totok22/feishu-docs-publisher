import MarkdownIt from "markdown-it";

// Parse for source locations only: do not render/reformat standard Markdown.
const parser = new MarkdownIt({ html: true });
export type ExportWarning = (message: string) => void;
const icons: Record<string, string> = {
	note: "📝",
	tip: "💡",
	important: "❗",
	warning: "⚠️",
	caution: "⚠️",
	pdf: "📖"
};

export function normalizeObsidianCallouts(source: string, warn?: ExportWarning): string {
	const lines = source.split("\n");
	const tokens = parser.parse(source, {});
	for (let i = 0; i < tokens.length; i++) {
		const quote = tokens[i];
		const paragraph = tokens[i + 1];
		const inline = tokens[i + 2];
		if (
			quote?.type !== "blockquote_open" ||
			paragraph?.type !== "paragraph_open" ||
			inline?.type !== "inline" ||
			!inline.map
		)
			continue;
		const header = inline.content.split("\n")[0] || "";
		const match = header.match(/^\[!([\w-]+)(?:\|([^\]]+))?\]([+-])?(?:[ \t]+(.*))?$/);
		if (!match) continue;
		const type = match[1]!.toLowerCase();
		const color = match[2];
		const title = match[4]?.trim();
		const label = `${icons[type] || "📝"} ${type.toUpperCase()}${color ? ` · ${color}` : ""}`;
		const index = inline.map[0];
		const line = lines[index]!;
		// Source maps account for list nesting, quote nesting and code fences.
		const start = line.lastIndexOf(header);
		if (start < 0) continue;
		lines[index] = line.slice(0, start) + `**${label}**${title ? ` — ${title}` : ""}`;
		warn?.(`Callout ${type}: 使用引用标题降级${match[3] ? "，折叠状态无法保留" : ""}。`);
	}
	return lines.join("\n");
}

/** Transform prose only, protecting parsed code blocks and inline code/comments. */
export function transformProse(
	source: string,
	transform: (text: string, offset: number) => string,
	protectHtml = true
): string {
	const offsets = [0];
	for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i + 1);
	const ranges: Array<[number, number]> = [];
	for (const token of parser.parse(source, {})) {
		if (
			(token.type === "fence" ||
				token.type === "code_block" ||
				(protectHtml && token.type === "html_block" && !token.content.trimStart().startsWith("<!--"))) &&
			token.map
		) {
			ranges.push([offsets[token.map[0]]!, offsets[token.map[1]] ?? source.length]);
		}
	}
	// Process comments and code spans in source order so literal comment markers
	// inside code cannot hide the prose following the closing backticks.
	const runs = /<!--|`+/g;
	let opening: RegExpExecArray | null;
	while ((opening = runs.exec(source))) {
		const protectedRange = ranges.find(([start, end]) => opening!.index >= start && opening!.index < end);
		if (protectedRange) {
			runs.lastIndex = protectedRange[1];
			continue;
		}
		let escapes = 0;
		for (let index = opening.index - 1; index >= 0 && source[index] === "\\"; index--) escapes++;
		if (escapes % 2) continue;
		if (opening[0] === "<!--") {
			const closing = source.indexOf("-->", runs.lastIndex);
			const end = closing < 0 ? source.length : closing + 3;
			ranges.push([opening.index, end]);
			runs.lastIndex = end;
			continue;
		}
		const closingRuns = /`+/g;
		closingRuns.lastIndex = runs.lastIndex;
		let closing: RegExpExecArray | null;
		while ((closing = closingRuns.exec(source))) {
			if (/\r?\n[ \t]*\r?\n/.test(source.slice(runs.lastIndex, closing.index))) break;
			if (ranges.some(([start, end]) => start <= closing!.index && end > opening!.index)) break;
			if (closing[0].length !== opening[0].length) continue;
			ranges.push([opening.index, closingRuns.lastIndex]);
			runs.lastIndex = closingRuns.lastIndex;
			break;
		}
	}
	ranges.sort((a, b) => a[0] - b[0]);
	let cursor = 0;
	let result = "";
	for (const [start, end] of ranges) {
		if (end <= cursor) continue;
		if (start > cursor) result += transform(source.slice(cursor, start), cursor);
		result += source.slice(Math.max(cursor, start), end);
		cursor = end;
	}
	return result + transform(source.slice(cursor), cursor);
}
