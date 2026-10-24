import assert from "node:assert/strict";
import esbuild from "esbuild";
await esbuild.build({
	entryPoints: ["src/label-colors.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp-label-colors.mjs"
});
const { colorBoldColonLabels: color } = await import("./.tmp-label-colors.mjs");
const run = (content, bold = false, extra = {}) => ({ text_run: { content, text_element_style: { bold, ...extra } } });
for (const colon of [":", "："]) {
	const result = color([run("特点", true), run(colon + "正文")]);
	assert.equal(result[0].text_run.text_element_style.background_color, 10);
	assert.equal(result[0].text_run.text_element_style.text_color, 1);
	assert.equal(result[1].text_run.content, colon + "正文");
}
const inner = color([run("标签：内容", true)]);
assert.equal(inner[0].text_run.content, "标签");
assert.equal(inner[1].text_run.content, "：内容");
assert.equal(inner[1].text_run.text_element_style.background_color, undefined);
const plain = [run("普通粗体", true), run("没有冒号"), run("code:", true, { inline_code: true })];
assert.deepEqual(color(plain), plain);
const split = color([run("训练", true), run("配置", true, { italic: true }), run("：值")]);
assert.equal(split[1].text_run.text_element_style.italic, true);
assert.equal(split[1].text_run.text_element_style.text_color, 1);
assert.deepEqual(color(split), split);
console.log("Bold colon label color tests passed");
