import assert from "node:assert/strict";
import esbuild from "esbuild";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
await esbuild.build({
	bundle: true,
	entryPoints: ["src/pdf-crops.ts"],
	format: "esm",
	platform: "node",
	outfile: "test/.tmp-pdf-crops.mjs"
});
const { scanPdfCropReferences, preparePdfCropImages } = await import("./.tmp-pdf-crops.mjs");
const wiki = "![[paper.pdf#page=3&rect=10,20,110,70|300]]";
assert.deepEqual(scanPdfCropReferences(wiki)[0].rect, [10, 20, 110, 70]);
for (const text of [
	"`" + wiki + "`",
	"> ```md\n> " + wiki + "\n> ```",
	"    " + wiki,
	"\\" + wiki,
	"[[paper.pdf#page=3]]"
])
	assert.equal(scanPdfCropReferences(text).length, 0, text);
assert.equal(scanPdfCropReferences("`<!--` then " + wiki).length, 1);
for (const text of [
	"![[paper.pdf#page=0&rect=1,2,3,4]]",
	"![[paper.pdf#page=2&rect=3,4,1,2]]",
	"![[paper.pdf#rect=a,b,c,d]]"
])
	assert.throws(() => scanPdfCropReferences(text), /无效/);
const dir = await mkdtemp(join(tmpdir(), "pdf-crop-test-"));
let cached;
try {
	await mkdir(join(dir, "notes"));
	const original = "%PDF-1.4\n" + dir;
	await writeFile(join(dir, "notes/paper.pdf"), original);
	const png = Buffer.alloc(24);
	Buffer.from("89504e470d0a1a0a", "hex").copy(png);
	png.writeUInt32BE(200, 16);
	png.writeUInt32BE(100, 20);
	let calls = 0;
	const render = async (file, page, rect) => {
		calls++;
		assert.equal(page, 3);
		assert.deepEqual(rect, [10, 20, 110, 70]);
		return png;
	};
	const content = "> [!note]- Details\n> Before " + wiki + " after\n> Tail";
	const prepared = await preparePdfCropImages({ vaultRoot: dir, markdownPath: "notes/note.md", content, render });
	cached = prepared.images[0].absolutePath;
	assert.equal(prepared.images.length, 1);
	assert.equal(prepared.images[0].displayWidth, 300);
	assert.equal(prepared.images[0].displayHeight, 150);
	assert.match(prepared.content, /> Before \n>\n> FEISHU_LARK_LOCAL_IMAGE_[a-f0-9]+\n>\n>  after\n> Tail/);
	const again = await preparePdfCropImages({ vaultRoot: dir, markdownPath: "notes/note.md", content, render });
	assert.equal(calls, 1);
	assert.equal(again.images[0].placeholder, prepared.images[0].placeholder);
	await writeFile(cached, Buffer.from("interrupted cache write"));
	const healed = await preparePdfCropImages({ vaultRoot: dir, markdownPath: "notes/note.md", content, render });
	assert.equal(calls, 2, "a corrupt cache entry must render again");
	assert.equal(healed.images[0].placeholder, prepared.images[0].placeholder);
	assert.deepEqual(await readFile(cached), png);
	await rm(cached);
	for (const invalid of [Buffer.from("not PNG"), Buffer.from(png)]) {
		if (invalid.length === 24) invalid.writeUInt32BE(0, 16);
		await assert.rejects(
			preparePdfCropImages({
				vaultRoot: dir,
				markdownPath: "notes/note.md",
				content,
				render: async () => invalid
			}),
			/有效 PNG/
		);
		await assert.rejects(readFile(cached), { code: "ENOENT" }, "an invalid render must not poison the cache");
	}
	await preparePdfCropImages({ vaultRoot: dir, markdownPath: "notes/note.md", content, render });
	assert.equal(await readFile(join(dir, "notes/paper.pdf"), "utf8"), original);
	const list = await preparePdfCropImages({
		vaultRoot: dir,
		markdownPath: "notes/note.md",
		content: "- parent\n\t- Before " + wiki + " after",
		render
	});
	assert.match(list.content, /\n\n {6}FEISHU_LARK_LOCAL_IMAGE_/);
} finally {
	await rm(dir, { recursive: true, force: true });
	if (cached) await rm(cached, { force: true });
}
console.log("PDF crop parsing, caching, size, and placement tests passed");
