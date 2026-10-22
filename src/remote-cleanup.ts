export interface DocumentBindingLike {
	token: string;
	url: string;
	nodeToken?: string;
	containerKind?: string;
}

export interface PdfBindingLike {
	status: string;
	fileToken?: string;
	nodeToken?: string;
	url?: string;
	parent?: { kind: string };
}

export interface MissingRemoteFile {
	kind: "markdown" | "pdf";
	/** Vault path the file was published from; the local file no longer exists. */
	path: string;
	/** Document token for notes, file token for PDFs. */
	token: string;
	/** Wiki node token; empty for Drive files. */
	nodeToken: string;
	url: string;
	location: "drive" | "wiki";
}

export interface FindMissingRemoteFilesInput {
	folderPath: string;
	documentBindings: Record<string, DocumentBindingLike>;
	pdfBindings: Record<string, PdfBindingLike>;
	localFileExists: (path: string) => boolean;
	isDisconnected: (path: string) => boolean;
	/** Remote identifiers still owned by an existing local file or folder page. */
	liveAliases: Set<string>;
	aliasesOf: (binding: { token: string; url: string; nodeToken?: string }) => string[];
}

/**
 * Remote files this plugin published from the folder whose local file is gone.
 * Anything without a publish record, and anything an existing local file still points at
 * (for example a note moved outside Obsidian), is left alone.
 */
export function findMissingRemoteFiles(input: FindMissingRemoteFilesInput): MissingRemoteFile[] {
	const found = new Map<string, MissingRemoteFile>();
	const consider = (file: MissingRemoteFile): void => {
		if (!file.token || !isPathWithin(file.path, input.folderPath)) return;
		if (input.localFileExists(file.path) || input.isDisconnected(file.path)) return;
		const aliases = input.aliasesOf({ token: file.token, url: file.url, nodeToken: file.nodeToken });
		if (aliases.some((alias) => input.liveAliases.has(alias))) return;
		if (!found.has(file.token)) found.set(file.token, file);
	};

	for (const [path, binding] of Object.entries(input.documentBindings)) {
		const nodeToken = binding.nodeToken || wikiTokenFromUrl(binding.url);
		consider({
			kind: "markdown", path, token: binding.token, nodeToken, url: binding.url,
			location: nodeToken || binding.containerKind === "wiki" || binding.containerKind === "my_library" ? "wiki" : "drive"
		});
	}
	for (const [path, binding] of Object.entries(input.pdfBindings)) {
		if (binding.status === "pending" || !binding.fileToken) continue;
		const nodeToken = binding.nodeToken || wikiTokenFromUrl(binding.url || "");
		consider({
			kind: "pdf", path, token: binding.fileToken, nodeToken, url: binding.url || "",
			location: nodeToken || binding.parent?.kind === "wiki" ? "wiki" : "drive"
		});
	}
	return [...found.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function isPathWithin(path: string, folderPath: string): boolean {
	return !folderPath || path === folderPath || path.startsWith(`${folderPath}/`);
}

function wikiTokenFromUrl(url: string): string {
	return url.match(/\/wiki\/([A-Za-z0-9]+)/)?.[1] ?? "";
}
