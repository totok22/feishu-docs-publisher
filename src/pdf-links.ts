import { transformProse, ExportWarning } from "./obsidian-export";
import { LinkContextFile, normalizeLinkPath, parentPath } from "./link-rewrite";

export interface PublishedPdfTarget {
	fileToken: string;
}

/** Obsidian's metadata resolver handles duplicate filenames and shortest links. */
export type PdfPathResolver = (target: string, sourcePath: string) => string | null;

export function buildPublishedPdfTargets(
	bindings: Record<string, { status: string; fileToken?: string }> = {},
	disconnectedFolders: Record<string, boolean> = {}
): Map<string, PublishedPdfTarget> {
	const targets = new Map<string, PublishedPdfTarget>();
	for (const [path, binding] of Object.entries(bindings)) {
		const normalized = normalizeLinkPath(path);
		const disconnected = Object.entries(disconnectedFolders).some(([folder, flag]) => {
			const prefix = normalizeLinkPath(folder);
			return flag && (normalized === prefix || normalized.startsWith(`${prefix}/`));
		});
		if (binding.status === "published" && binding.fileToken && !disconnected) {
			targets.set(normalized, { fileToken: binding.fileToken });
		}
	}
	return targets;
}

export function rewritePublishedPdfLinks(
	content: string,
	targets: Map<string, PublishedPdfTarget>,
	currentFile: LinkContextFile,
	resolvePath?: PdfPathResolver,
	warn?: ExportWarning
): string {
	if (!/\.pdf\b/i.test(content)) return content;
	return transformProse(content, (text) => rewriteText(text, targets, currentFile, resolvePath, warn));
}

function readableLabel(text: string): string {
	return text.replace(/[\\`*_[\]<>$~|]/g, "\\$&");
}

function rewriteText(content: string, targets: Map<string, PublishedPdfTarget>, file: LinkContextFile,
	resolvePath?: PdfPathResolver, warn?: ExportWarning): string {
	return content.replace(/!?\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]|!?\[([^\]\n]*)\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)/g,
		(match, wikiTarget: string | undefined, alias: string | undefined, label: string, markdownTarget: string | undefined, index: number) => {
			if (isEscaped(content, index)) return match;
			const raw = (wikiTarget ?? markdownTarget ?? "").trim().replace(/^<|>$/g, "");
			const target = decodeTarget(raw);
			if (!target) return match;
			const params = new URLSearchParams(raw.split("#").slice(1).join("#"));
			const page = params.get("page");
			const color = params.get("color");
			const display = alias || label || target.split("/").pop() || target;
			const details = [display];
			if (display !== target.split("/").pop()) details.push(target.split("/").pop()!);
			if (page) details.push(`p.${page}`);
			if (color) details.push(color);
			const readable = readableLabel(details.join(" · "));
			const path = resolvePath ? resolvePath(target, file.path) : resolveFromPublishedPaths(target, targets, file);
			const binding = path ? targets.get(normalizeLinkPath(path)) : undefined;
			if (!binding || !/^[A-Za-z0-9_-]+$/.test(binding.fileToken)) {
				warn?.(`PDF 未解析：${target}${page ? `（p.${page}）` : ""}；请先发布或绑定此附件。`);
				return `${readable}（PDF 未发布或未绑定）`;
			}
			if (params.has("selection") || page) warn?.(`PDF ${target}: 保留页码文本，文件引用不提供精确选区跳转。`);
			const cite = `<cite type="doc" doc-id="${binding.fileToken}" file-type="file"></cite>`;
			return alias || label || page || color ? `${readable} ${cite}` : cite;
		});
}

function decodeTarget(raw: string): string | null {
	let target = raw.trim().replace(/^<|>$/g, "");
	try { target = decodeURIComponent(target.split("#")[0] || ""); }
	catch { return null; }
	if (!/\.pdf$/i.test(target) || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|[/\\])/.test(target)) return null;
	return target.replace(/\\/g, "/");
}

function resolveFromPublishedPaths(target: string, targets: Map<string, PublishedPdfTarget>, file: LinkContextFile): string | null {
	const relative = normalizeLinkPath(`${parentPath(file.path)}/${target}`);
	const root = normalizeLinkPath(target);
	if (targets.has(relative)) return relative;
	if (targets.has(root)) return root;
	const matches = Array.from(targets.keys()).filter((path) => path.endsWith(`/${root}`));
	return matches.length === 1 ? matches[0]! : null;
}

function isEscaped(content: string, index: number): boolean {
	let count = 0;
	while (index > 0 && content[--index] === "\\") count++;
	return count % 2 === 1;
}
