import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import esbuild from "esbuild";
import {
	prepareNoteContentForLark,
	rewritePublishedPdfLinks,
	buildSyncPlan,
	createDocumentSyncStateFromRemote
} from "../lark-sync-core.mjs";
await esbuild.build({
	entryPoints: ["src/obsidian-export.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp-obsidian-export.mjs"
});
const { normalizeObsidianCallouts } = await import("./.tmp-obsidian-export.mjs");
const source = await readFile("test/fixtures/obsidian-export.md", "utf8");
const warnings = [];
const note = { path: "notes/test.md", basename: "Test" };
const targets = new Map([["papers/paper.pdf", { fileToken: "pdf-token" }]]);
const exportNote = (input, map = targets) =>
	rewritePublishedPdfLinks(
		prepareNoteContentForLark(note, input, "first-heading", (w) => warnings.push(w)),
		map,
		note,
		undefined,
		(w) => warnings.push(w)
	);
const output = exportNote(source);
assert.match(output, /📝 NOTE.*Benchmark 简介/);
assert.match(output, /> > \*\*💡 TIP\*\* — 嵌套提示/);
assert.match(output, /Paper, p\.3 · paper\.pdf · p\.3 · yellow <cite/);
assert.match(output, /This is a highlighted passage/);
assert.match(output, /论文pdf:.*<cite/);
assert.ok(warnings.some((w) => w.includes("折叠")));
assert.ok(warnings.some((w) => w.includes("精确选区")));
for (const type of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION", "unknown", "PDF|yellow"]) {
	for (const fold of ["", "+", "-"]) {
		const result = normalizeObsidianCallouts(`> [!${type}]${fold}\n> body\n>\n> - list`);
		assert.doesNotMatch(result, /\[!/);
		assert.match(result, /> body\n>\n> - list$/);
	}
}
for (const literal of [
	"```md\n> [!NOTE]\n[[paper.pdf]]\n```",
	"> ~~~~md\n> [!NOTE]\n> [[paper.pdf]]\n> ~~~~",
	"    > [!NOTE]\n    [[paper.pdf]]",
	"`[[paper.pdf]]`",
	"<!-- [[paper.pdf]] -->"
]) {
	assert.equal(rewritePublishedPdfLinks(normalizeObsidianCallouts(literal), targets, note), literal);
}
const nested = "- List\n  > [!NOTE]- Title\n  > body";
assert.match(normalizeObsidianCallouts(nested), /  > \*\*📝 NOTE\*\* — Title/);
assert.equal(
	normalizeObsidianCallouts("> ordinary quote\n> [!NOTE] not at start"),
	"> ordinary quote\n> [!NOTE] not at start"
);
for (const block of source.match(/```[\s\S]*?```/g)) assert.ok(output.includes(block));
for (const text of [
	"$\\nabla_\\theta J(\\theta)$",
	source.match(/\$\$[\s\S]*?\$\$/)[0],
	"| PPO | 65.2 |",
	">   - Nested item",
	"![[diagram.png|320]]",
	"==重要结论==",
	"<mark>HTML 高亮</mark>",
	"[^paper]: A paper reference."
]) {
	assert.ok(output.includes(text), text);
}
assert.match(exportNote("[[paper.pdf#page=12|Alias]]", new Map()), /Alias · paper\.pdf · p\.12（PDF 未发布或未绑定）/);
assert.equal(await readFile("test/fixtures/obsidian-export.md", "utf8"), source);
assert.equal(exportNote(source), output, "repeat export is deterministic");
assert.equal(rewritePublishedPdfLinks(output, targets, note), output, "PDF rewrite is idempotent");
assert.equal(normalizeObsidianCallouts(output), output);
for (const code of ["`<!--`", "``a ` <!-- b``"]) {
	const rewritten = rewritePublishedPdfLinks(`${code} then [[paper.pdf#page=2]]`, targets, note);
	assert.ok(rewritten.startsWith(code), "literal comment markers in code stay untouched");
	assert.match(rewritten, /p\.2 <cite/, "the reference after inline code still exports");
}
assert.equal(rewritePublishedPdfLinks("<!-- ` [[paper.pdf]] -->", targets, note), "<!-- ` [[paper.pdf]] -->");
// Exercise the real incremental planner using transformed paragraphs and native file cites.
const baseline = exportNote("# Test\n\n[[paper.pdf#page=3|Paper]]\n\nOriginal");
const pdfLine = baseline.split("\n").find((line) => line.includes("<cite"));
const remote = `<title id="title">Test</title><p id="pdf">${pdfLine}</p><p id="body">Original</p>`;
const state = await createDocumentSyncStateFromRemote("doc", baseline, remote, 1);
const options = { doc: "doc", markdown: baseline, contentFileName: "sync.md", strategy: "precise", state };
assert.equal((await buildSyncPlan(options)).mode, "skipped");
const plan = await buildSyncPlan({
	...options,
	markdown: exportNote("# Test\n\n[[paper.pdf#page=3|Paper]]\n\nChanged")
});
assert.equal(plan.mode, "precise");
assert.deepEqual(
	plan.commands.map((c) => c.blockId),
	["body"]
);
const quoteSource = "# Test\n\n> [!NOTE]- Benchmark\n> Original text\n>\n> - Item A\n> - Item B";
const quoteBaseline = exportNote(quoteSource);
const quoteRemote =
	'<title id="title">Test</title><blockquote id="quote"><p><b>📝 NOTE</b> — Benchmark<br/>Original text</p><ul><li>Item A</li><li>Item B</li></ul></blockquote>';
const quoteState = await createDocumentSyncStateFromRemote("doc", quoteBaseline, quoteRemote, 1);
const quoteOptions = { ...options, markdown: quoteBaseline, state: quoteState };
assert.equal((await buildSyncPlan(quoteOptions)).mode, "skipped", "second callout publish must not append duplicates");
const quoteUpdate = await buildSyncPlan({
	...quoteOptions,
	markdown: exportNote(quoteSource.replace("Original text", "Changed text"))
});
assert.equal(quoteUpdate.mode, "precise");
assert.deepEqual(
	quoteUpdate.commands.map((c) => [c.command, c.blockId]),
	[["block_replace", "quote"]]
);
assert.match(quoteUpdate.commands[0].content, /> - Item B/);

assert.equal(
	rewritePublishedPdfLinks("[[paper.pdf#page=4|$x$]]", new Map(), note),
	"\\$x\\$ · paper.pdf · p.4（PDF 未发布或未绑定）"
);
console.log("Obsidian export tests passed");
