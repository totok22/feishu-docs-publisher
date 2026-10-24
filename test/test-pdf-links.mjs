import assert from "node:assert/strict";
import esbuild from "esbuild";
import { buildSyncPlan, createDocumentSyncStateFromRemote } from "../lark-sync-core.mjs";

await esbuild.build({ bundle: true, entryPoints: ["src/pdf-links.ts"], format: "esm",
	outfile: "test/.tmp-pdf-links-test.mjs", platform: "node", target: "node20" });
const { buildPublishedPdfTargets, rewritePublishedPdfLinks } = await import("./.tmp-pdf-links-test.mjs");
const path = "帮助/飞书测试/规格书/RVV-2.5平-3芯_充电机AC侧.pdf";
const targets = new Map([[path, { fileToken: "native-pdf-token" }]]);
const note = { path: "帮助/飞书测试/测试 1.md" };
const cite = '<cite type="doc" doc-id="native-pdf-token" file-type="file"></cite>';
const rewrite = (source, map = targets, file = note, resolver) => rewritePublishedPdfLinks(source, map, file, resolver);
assert.deepEqual(Array.from(buildPublishedPdfTargets({
	"docs/Ready.pdf": { status: "published", fileToken: "ready" },
	"docs/Pending.pdf": { status: "pending", fileToken: "old" },
	"docs/Uploaded.pdf": { status: "uploaded", fileToken: "unverified" },
	"docs/NoToken.pdf": { status: "published" },
	"docs-hidden/Ready.pdf": { status: "published", fileToken: "hidden" }
}, { docs: true }).keys()), ["docs-hidden/Ready.pdf"]);

for (const source of [
	`[[${path}]]`, `![[${path}]]`, `[[${path}|规格书]]`, `![[${path}#page=3|600]]`,
	`[[规格书/RVV-2.5平-3芯_充电机AC侧.pdf]]`, `[[RVV-2.5平-3芯_充电机AC侧.pdf]]`,
	`[规格书](${encodeURI(path)}#page=3)`, `![规格书](${encodeURI(path)})`,
	`[规格书](<${path}> "说明")`
]) {
  assert.ok(rewrite(source).includes(cite), source);
  if (source.includes('#page=3')) assert.match(rewrite(source), /p\.3/);
  if (source.includes('|规格书')) assert.match(rewrite(source), /规格书/);
}
assert.equal(rewrite(`前文 [[${path}]]，后文 ![[${path}]]。`), `前文 ${cite}，后文 ${cite}。`);
assert.equal(rewrite(cite), cite, "rewrites are idempotent");

for (const source of [
	"![[image.png]]", "[[note.md]]", "![[note.md]]",
	`[外部](https://example.com/${encodeURI(path)})`, "[[bad%XX.pdf]]", "[[file:///tmp/report.pdf]]",
	`\`[[${path}]]\``, `\`\`![[${path}]]\`\``, `<!-- [[${path}]] -->`, `\\[[${path}]]`,
	`\`\`\`md\n[[${path}]]\n\`\`\``, `~~~\n![[${path}]]\n~~~`, `\`\`\`md\n[[${path}]]`
]) assert.equal(rewrite(source), source, source);
assert.equal(rewrite(`<!-- [[${path}]] -->\n[[${path}]]`), `<!-- [[${path}]] -->\n${cite}`);
const spaced = new Map([["papers/report (final).PDF", { fileToken: "upper-pdf" }]]);
assert.match(rewrite("[Report](<papers/report (final).PDF>)", spaced), /doc-id="upper-pdf"/);

const duplicates = new Map([["a/report.pdf", { fileToken: "first" }], ["b/report.pdf", { fileToken: "second" }]]);
assert.equal(rewrite("[[report.pdf]]", duplicates), "report.pdf（PDF 未发布或未绑定）", "ambiguous fallback paths must warn");
assert.match(rewrite("[[report.pdf]]", duplicates, { path: "b/note.md" }), /doc-id="second"/);
assert.match(rewrite("[[report.pdf]]", duplicates, note, () => "b/report.pdf"), /doc-id="second"/);
assert.equal(rewrite("[[report.pdf]]", duplicates, note, () => "unpublished/report.pdf"), "report.pdf（PDF 未发布或未绑定）",
	"never choose a published namesake when Obsidian resolves an unpublished PDF");
assert.equal(rewrite(`[[${path}]]`, new Map([[path, { fileToken: 'unsafe"token' }]])), `RVV-2.5平-3芯\\_充电机AC侧.pdf（PDF 未发布或未绑定）`);

// Adding file metadata on fetch must not cause a rewrite of an unchanged PDF reference.
const baseline = `# Note\n\n${cite}\n\nOriginal paragraph`;
const remote = '<title id="title">Note</title><p id="pdf-block"><cite doc-id="native-pdf-token" file-type="file" title="报告.pdf" type="doc"></cite></p><p id="text-block">Original paragraph</p>';
const state = await createDocumentSyncStateFromRemote("document", baseline, remote, 1);
const plan = await buildSyncPlan({ doc: "document", markdown: baseline.replace("Original paragraph", "Changed paragraph"),
	contentFileName: "sync.md", strategy: "precise", state });
assert.equal(plan.mode, "precise");
assert.deepEqual(plan.commands.map((command) => command.blockId), ["text-block"]);
console.log("PDF link tests passed");
