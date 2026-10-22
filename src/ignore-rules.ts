/** Name of the rule file. It uses .gitignore syntax and applies to the directory it sits in and everything below. */
export const IGNORE_FILE_NAME = ".feishuignore";

interface IgnorePattern {
	text: string;
	negative: boolean;
	directoryOnly: boolean;
	regex: RegExp;
}

export interface IgnoreDecision {
	ignored: boolean;
	/** Directory of the rule file whose pattern decided it ("" is the vault root). */
	dir?: string;
	pattern?: string;
}

const POSIX_CLASSES: Record<string, string> = {
	alpha: "a-zA-Z", digit: "0-9", alnum: "a-zA-Z0-9", upper: "A-Z", lower: "a-z",
	xdigit: "0-9A-Fa-f", space: "\\s", blank: " \\t", punct: "!-\\/:-@\\[-`{-~"
};

function escapeRegex(char: string): string {
	return /[\\^$.*+?()[\]{}|/-]/.test(char) ? `\\${char}` : char;
}

function normalizeDirectory(dir: string): string {
	return dir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").normalize("NFC");
}

/** Trailing spaces are dropped unless a backslash quotes them. */
function stripTrailingSpaces(line: string): string {
	let end = line.length;
	while (end > 0 && line[end - 1] === " ") {
		let backslashes = 0;
		while (end - 2 - backslashes >= 0 && line[end - 2 - backslashes] === "\\") backslashes += 1;
		if (backslashes % 2 === 1) break;
		end -= 1;
	}
	return line.slice(0, end);
}

function parseCharacterClass(glob: string, start: number): { source: string; end: number } | null {
	let index = start + 1;
	let negate = false;
	if (glob[index] === "!" || glob[index] === "^") {
		negate = true;
		index += 1;
	}
	let body = "";
	for (let first = true; index < glob.length; first = false, index += 1) {
		const char = glob[index]!;
		if (char === "]" && !first) return { source: `[${negate ? "^/" : ""}${body}]`, end: index };
		if (char === "[" && glob[index + 1] === ":") {
			const close = glob.indexOf(":]", index + 2);
			const named = close > 0 ? POSIX_CLASSES[glob.slice(index + 2, close)] : undefined;
			if (named === undefined) return null;
			body += named;
			index = close + 1;
		} else if (char === "\\") {
			index += 1;
			if (index >= glob.length) return null;
			body += `\\${glob[index]}`;
		} else {
			body += /[\\\]^[]/.test(char) ? `\\${char}` : char;
		}
	}
	return null;
}

/** Translate gitignore wildcards to a regular expression source; null for a pattern git would reject. */
function globToRegexSource(glob: string): string | null {
	let source = "";
	for (let index = 0; index < glob.length; index += 1) {
		const char = glob[index]!;
		if (char === "\\") {
			index += 1;
			if (index >= glob.length) return null;
			source += escapeRegex(glob[index]!);
		} else if (char === "*") {
			let end = index;
			while (glob[end + 1] === "*") end += 1;
			const wholeSegment = (index === 0 || glob[index - 1] === "/") && (end === glob.length - 1 || glob[end + 1] === "/");
			if (end > index && wholeSegment) {
				if (end === glob.length - 1) {
					source += ".*";
				} else {
					source += "(?:.*/)?";
					end += 1;
				}
			} else {
				source += "[^/]*";
			}
			index = end;
		} else if (char === "?") {
			source += "[^/]";
		} else if (char === "[") {
			const parsed = parseCharacterClass(glob, index);
			if (parsed) {
				source += parsed.source;
				index = parsed.end;
			} else {
				source += "\\[";
			}
		} else {
			source += escapeRegex(char);
		}
	}
	return source;
}

function parseLine(rawLine: string): IgnorePattern | null {
	let line = stripTrailingSpaces(rawLine);
	if (!line || line.startsWith("#")) return null;
	let negative = false;
	if (line.startsWith("!")) {
		negative = true;
		line = line.slice(1);
	}
	let directoryOnly = false;
	if (line.endsWith("/")) {
		directoryOnly = true;
		line = line.slice(0, -1);
	}
	if (!line) return null;
	// A slash at the start or in the middle ties the pattern to the rule file's directory.
	const anchored = line.includes("/");
	if (line.startsWith("/")) line = line.slice(1);
	const source = globToRegexSource(line);
	if (source === null) return null;
	return { text: rawLine, negative, directoryOnly, regex: new RegExp(`^${anchored ? "" : "(?:.*/)?"}${source}$`, "i") };
}

function parseIgnorePatterns(content: string): IgnorePattern[] {
	const patterns: IgnorePattern[] = [];
	for (const line of content.normalize("NFC").split(/\r?\n/)) {
		const pattern = parseLine(line);
		if (pattern) patterns.push(pattern);
	}
	return patterns;
}

/** The last pattern that matches decides, and a "!" pattern undoes an earlier match; null when nothing matches. */
function matchPatterns(patterns: IgnorePattern[], relativePath: string, isDirectory: boolean): IgnoreDecision | null {
	let decision: IgnoreDecision | null = null;
	for (const pattern of patterns) {
		if (pattern.directoryOnly && !isDirectory) continue;
		if (!pattern.regex.test(relativePath)) continue;
		decision = pattern.negative ? { ignored: false } : { ignored: true, pattern: pattern.text };
	}
	return decision;
}

/**
 * Every ".feishuignore" a path can be subject to, with .gitignore semantics: a file's patterns are
 * relative to its own directory, deeper files override shallower ones, and nothing inside an
 * ignored directory can be brought back.
 */
export class IgnoreRules {
	private readonly files = new Map<string, IgnorePattern[]>();
	private readonly cache = new Map<string, IgnoreDecision>();

	/** Register the content of the rule file in a directory ("" is the vault root); empty or missing clears it. */
	setFile(dir: string, content: string | null | undefined): void {
		const key = normalizeDirectory(dir);
		const patterns = content ? parseIgnorePatterns(content) : [];
		if (patterns.length > 0) this.files.set(key, patterns);
		else this.files.delete(key);
		this.cache.clear();
	}

	isIgnored(path: string, isDirectory = false): boolean {
		return this.explain(path, isDirectory).ignored;
	}

	/** Why a path is ignored: the decision for the outermost ignored directory, or for the path itself. */
	explain(path: string, isDirectory = false): IgnoreDecision {
		if (this.files.size === 0) return { ignored: false };
		const segments = normalizeDirectory(path).split("/").filter(Boolean);
		for (let length = 1; length <= segments.length; length += 1) {
			const decision = this.decide(segments.slice(0, length), length < segments.length || isDirectory);
			if (decision.ignored) return decision;
		}
		return { ignored: false };
	}

	private decide(segments: string[], isDirectory: boolean): IgnoreDecision {
		const key = `${isDirectory ? "d" : "f"}:${segments.join("/")}`;
		const cached = this.cache.get(key);
		if (cached) return cached;
		let decision: IgnoreDecision = { ignored: false };
		for (let depth = 0; depth < segments.length; depth += 1) {
			const dir = segments.slice(0, depth).join("/");
			const patterns = this.files.get(dir);
			if (!patterns) continue;
			// A deeper file overrides a shallower one only for what its own patterns match.
			const result = matchPatterns(patterns, segments.slice(depth).join("/"), isDirectory);
			if (result) decision = result.ignored ? { ...result, dir } : { ignored: false };
		}
		this.cache.set(key, decision);
		return decision;
	}
}

export function ignoreFilePath(dir: string): string {
	const normalized = normalizeDirectory(dir);
	return normalized ? `${normalized}/${IGNORE_FILE_NAME}` : IGNORE_FILE_NAME;
}

/** The directories whose rule files can affect these paths. A path ending in "/" is itself a directory. */
export function collectIgnoreDirectories(paths: readonly string[]): string[] {
	const dirs = new Set([""]);
	for (const path of paths) {
		const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
		const directories = path.endsWith("/") ? segments : segments.slice(0, -1);
		for (let length = 1; length <= directories.length; length += 1) dirs.add(directories.slice(0, length).join("/"));
	}
	return [...dirs];
}
