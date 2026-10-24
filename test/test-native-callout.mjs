import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import esbuild from "esbuild";
await esbuild.build({
	bundle: true,
	entryPoints: ["src/native-callout.ts"],
	format: "esm",
	platform: "node",
	outfile: "test/.tmp-native-callout.mjs"
});
const { prepareNativeCallouts, assembleNativeCallouts } = await import("./.tmp-native-callout.mjs");
const source =
	"主干 A\n\n> [!note]- Outer\n> Body\n>\n> > [!tip]+ Inner\n> > Detail\n>\n> ```python\n> print(1)\n> ```\n\n主干 B";
const draft = prepareNativeCallouts(source);
assert.equal(draft.callouts.length, 2);
assert.equal(draft.callouts[0].collapsed, true);
assert.equal(draft.callouts[1].collapsed, false);
assert.match(draft.markdown, /主干 B$/);
assert.ok(draft.markdown.indexOf(draft.callouts[0].close) < draft.markdown.indexOf("主干 B"));
assert.ok(draft.markdown.includes("```python\nprint(1)\n```"));
for (const literal of ["```md\n> [!note]- Example\n```", "    > [!note]- Example", "`> [!note]- Example`"])
	assert.equal(prepareNativeCallouts(literal).markdown, literal);
const text = (id, content) => ({ block_id: id, block_type: 2, text: { elements: [{ text_run: { content } }] } });
const [outer, inner] = draft.callouts;
const input = {
	first_level_block_ids: ["a", "outer", "body", "inner", "detail", "innerEnd", "code", "outerEnd", "b"],
	blocks: [
		text("a", "主干 A"),
		text("outer", outer.open + " 📝 Outer"),
		text("body", "Body"),
		text("inner", inner.open + " 💡 Inner"),
		text("detail", "Detail"),
		text("innerEnd", inner.close),
		{
			block_id: "code",
			block_type: 14,
			code: { elements: [{ text_run: { content: "print(1)" } }], style: { language: 49 } }
		},
		text("outerEnd", outer.close),
		text("b", "主干 B")
	]
};
const snapshot = JSON.stringify(input);
const tree = assembleNativeCallouts(input, draft.callouts);
assert.deepEqual(tree.first_level_block_ids, ["a", "outer", "b"]);
const byId = new Map(tree.blocks.map((b) => [b.block_id, b]));
assert.deepEqual(byId.get("outer").children, ["body", "inner", "code"]);
assert.deepEqual(byId.get("inner").children, ["detail"]);
assert.equal(byId.get("outer").text.style.folded, true);
assert.equal(byId.get("inner").text.style.folded, false);
assert.equal(byId.get("outer").text.elements[0].text_run.content, "📝 Outer");
assert.equal(byId.get("b").parent_id, undefined);
assert.equal(byId.get("code").code.elements[0].text_run.content, "print(1)");
assert.equal(JSON.stringify(input), snapshot);
assert.throws(
	() =>
		assembleNativeCallouts(
			{ ...input, first_level_block_ids: input.first_level_block_ids.filter((id) => id !== "innerEnd") },
			draft.callouts
		),
	/boundary mismatch/
);
assert.throws(
	() => assembleNativeCallouts({ ...input, first_level_block_ids: ["a", "b"] }, draft.callouts),
	/lost Callout boundaries/
);
const fixture = await readFile("test/fixtures/obsidian-export.md", "utf8");
assert.equal(prepareNativeCallouts(fixture).callouts.length, 3);
console.log("Native Callout structural tests passed");

const adjacent = prepareNativeCallouts("**Main**\n> [!note]- Detail\n> Body\n\nTail");
assert.match(adjacent.markdown, /\*\*Main\*\*\n\nFDPCALLOUTOPEN/);
assert.match(adjacent.markdown, /FDPCALLOUTCLOSE[^\n]+\n\n/);
