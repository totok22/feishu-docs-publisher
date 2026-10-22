import assert from "node:assert/strict";
import esbuild from "esbuild";

await esbuild.build({
	bundle: true,
	entryPoints: ["src/remote-cleanup.ts"],
	format: "esm",
	outfile: "test/.tmp-remote-cleanup-test.mjs",
	platform: "node",
	target: "node20"
});

const { findMissingRemoteFiles } = await import("./.tmp-remote-cleanup-test.mjs");

const aliasesOf = (binding) => [binding.token, binding.nodeToken || "", binding.url].filter(Boolean);
const find = (overrides = {}) => findMissingRemoteFiles({
	folderPath: "Team/ESF",
	documentBindings: {},
	pdfBindings: {},
	localFileExists: () => false,
	isDisconnected: () => false,
	liveAliases: new Set(),
	aliasesOf,
	...overrides
});

// Published notes and PDFs whose local file is gone are found, in path order.
assert.deepEqual(find({
	documentBindings: {
		"Team/ESF/Old.md": { token: "doc-old", url: "https://x.feishu.cn/docx/doc-old", containerKind: "drive" },
		"Team/ESF/Sub/Gone.md": { token: "doc-gone", url: "https://x.feishu.cn/docx/doc-gone" }
	},
	pdfBindings: {
		"Team/ESF/Scan.pdf": { status: "published", fileToken: "pdf-1", url: "https://x.feishu.cn/file/pdf-1", parent: { kind: "drive" } }
	}
}), [
	{ kind: "markdown", path: "Team/ESF/Old.md", token: "doc-old", nodeToken: "", url: "https://x.feishu.cn/docx/doc-old", location: "drive" },
	{ kind: "pdf", path: "Team/ESF/Scan.pdf", token: "pdf-1", nodeToken: "", url: "https://x.feishu.cn/file/pdf-1", location: "drive" },
	{ kind: "markdown", path: "Team/ESF/Sub/Gone.md", token: "doc-gone", nodeToken: "", url: "https://x.feishu.cn/docx/doc-gone", location: "drive" }
]);

// Wiki documents are recognised from the node token, the URL, or the container kind.
const wiki = find({
	documentBindings: {
		"Team/ESF/A.md": { token: "a", url: "https://x.feishu.cn/wiki/nodeA", nodeToken: "nodeA" },
		"Team/ESF/B.md": { token: "b", url: "https://x.feishu.cn/wiki/nodeB" },
		"Team/ESF/C.md": { token: "c", url: "https://x.feishu.cn/docx/c", containerKind: "my_library" }
	},
	pdfBindings: { "Team/ESF/D.pdf": { status: "uploaded", fileToken: "d", nodeToken: "nodeD", parent: { kind: "wiki" } } }
});
assert.deepEqual(wiki.map((file) => [file.path, file.location, file.nodeToken]), [
	["Team/ESF/A.md", "wiki", "nodeA"],
	["Team/ESF/B.md", "wiki", "nodeB"],
	["Team/ESF/C.md", "wiki", ""],
	["Team/ESF/D.pdf", "wiki", "nodeD"]
]);

// Files outside the folder, existing files, disconnected paths, and unconfirmed PDF uploads are never candidates.
assert.deepEqual(find({
	documentBindings: {
		"Other/Doc.md": { token: "other", url: "" },
		"Team/ESF-extra/Doc.md": { token: "sibling", url: "" },
		"Team/ESF/Here.md": { token: "here", url: "" },
		"Team/ESF/Cut.md": { token: "cut", url: "" }
	},
	pdfBindings: {
		"Team/ESF/Pending.pdf": { status: "pending", fileToken: "p" },
		"Team/ESF/NoToken.pdf": { status: "published" }
	},
	localFileExists: (path) => path === "Team/ESF/Here.md",
	isDisconnected: (path) => path === "Team/ESF/Cut.md"
}), []);

// A remote file an existing note still points at (moved outside Obsidian) survives; two stale paths share one delete.
assert.deepEqual(find({
	documentBindings: {
		"Team/ESF/Moved.md": { token: "moved", url: "https://x.feishu.cn/docx/moved" },
		"Team/ESF/Dup1.md": { token: "dup", url: "" },
		"Team/ESF/Dup2.md": { token: "dup", url: "" }
	},
	liveAliases: new Set(["https://x.feishu.cn/docx/moved"])
}).map((file) => file.path), ["Team/ESF/Dup1.md"]);

// An empty folder path covers the whole vault.
assert.equal(find({ folderPath: "", documentBindings: { "Any/Where.md": { token: "t", url: "" } } }).length, 1);

console.log("remote cleanup tests passed");
