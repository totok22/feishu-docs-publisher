import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import esbuild from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outfile = "test/.tmp-ignore-rules-test.mjs";
await esbuild.build({ bundle: true, entryPoints: ["src/ignore-rules.ts"], format: "esm", outfile, platform: "node", target: "node20" });
const workspace = await mkdtemp(join(tmpdir(), "ignore-rules-"));

try {
	const { IGNORE_FILE_NAME, IgnoreRules, collectIgnoreDirectories, ignoreFilePath } = await import("./.tmp-ignore-rules-test.mjs");

	assert.equal(IGNORE_FILE_NAME, ".feishuignore");
	assert.equal(ignoreFilePath(""), ".feishuignore");
	assert.equal(ignoreFilePath("a/b/"), "a/b/.feishuignore");
	assert.deepEqual(collectIgnoreDirectories(["a/b/c.md", "x.md"]).sort(), ["", "a", "a/b"]);
	assert.deepEqual(collectIgnoreDirectories(["a/b/"]).sort(), ["", "a", "a/b"], "a trailing slash marks a directory");

	const files = [
		"README.md", "temp.md", "notes/a.md", "notes/b.md", "notes/b.draft.md", "notes/Private/secret.md", "notes/Private/keep.md",
		"notes/sub/deep/x.md", "notes/sub/deep/x.log", "build/out.js", "build/keep/me.md", "docs/a.md", "docs/b.md", "docs/img/p.png",
		"Drafts/one.md", "Drafts/two.md", "tmp/x.md", "src/main.ts", "src/vendor/lib.js", "a/b/c/d.md", "a/c.md", "a/b/d.md",
		"中文/笔记.md", "中文/草稿.md", "UPPER/File.MD", "my notes/with space.md", "x.log", "logs/y.log"
	];
	const cases = [
		{ name: "wildcard extension", rules: { "": "*.draft.md" } },
		{ name: "directory only at any depth", rules: { "": "Private/" } },
		{ name: "anchored file", rules: { "": "/Drafts/two.md" } },
		{ name: "cannot re-include below an ignored directory", rules: { "": "/build/\n!/build/keep/" } },
		{ name: "re-include below a wildcard", rules: { "": "build/*\n!build/keep/" } },
		{ name: "double star prefix", rules: { "": "**/deep/*.log" } },
		{ name: "double star suffix", rules: { "": "docs/**" } },
		{ name: "double star in the middle", rules: { "": "a/**/d.md" } },
		{ name: "ignored folder cannot be undone by file", rules: { "": "tmp\n!tmp/x.md" } },
		{ name: "negation of an extension", rules: { "": "*.md\n!README.md" } },
		{ name: "anchored directory", rules: { "": "/notes/sub/" } },
		{ name: "character class", rules: { "": "[ab].md" } },
		{ name: "negated class", rules: { "": "[!a].md" } },
		{ name: "single character wildcard", rules: { "": "?.md" } },
		{ name: "non-ascii path", rules: { "": "中文/草稿.md" } },
		{ name: "directory with space", rules: { "": "/my notes/" } },
		{ name: "comments and blanks", rules: { "": "# comment\n\n   \n*.log" } },
		{ name: "middle wildcard directory", rules: { "": "notes/*/deep" } },
		{ name: "double star directory name", rules: { "": "**/Private" } },
		{ name: "case insensitive", rules: { "": "upper/\n*.md" } },
		{ name: "root star with exception", rules: { "": "/src/*\n!/src/main.ts" } },
		{ name: "nested file overrides parent", rules: { "": "*.draft.md", notes: "!b.draft.md" } },
		{ name: "nested file cannot revive ignored dir", rules: { "": "notes/Private/", "notes/Private": "!keep.md" } },
		{ name: "nested file leaves unmatched paths to its parent", rules: { "": "*.log", logs: "!z.log" } },
		{ name: "nested file with its own match", rules: { "": "*.md", docs: "/a.md\n!b.md" } },
		{ name: "nested patterns are relative", rules: { "notes": "/a.md\nsub/", "": "/b.md" } },
		{ name: "windows line endings", rules: { "": "*.log\r\n/temp.md\r\n" } },
		{ name: "last pattern wins", rules: { "": "!*.log\n*.log\n!x.log" } },
		{ name: "trailing slash on negation", rules: { "": "/notes/\n!/notes/sub/" } },
		{ name: "lone double star", rules: { "": "**\n!README.md" } },
		{ name: "star inside name", rules: { "": "*.d*.md" } },
		{ name: "escaped hash", rules: { "": "\\#nothing\n/temp.md" } }
	];

	await execFileAsync("git", ["init", "-q"], { cwd: workspace });
	await execFileAsync("git", ["config", "core.ignorecase", "true"], { cwd: workspace });
	for (const file of files) {
		await mkdir(dirname(join(workspace, file)), { recursive: true });
		await writeFile(join(workspace, file), "x");
	}

	for (const { name, rules: ruleFiles } of cases) {
		const written = [];
		for (const [dir, content] of Object.entries(ruleFiles)) {
			const path = join(workspace, dir, ".gitignore");
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content);
			written.push(path);
		}
		const listed = (await execFileAsync("git", ["ls-files", "-o", "--exclude-standard", "-z"], { cwd: workspace })).stdout
			.split("\0").filter((path) => path && !path.endsWith(".gitignore")).sort();

		const rules = new IgnoreRules();
		for (const [dir, content] of Object.entries(ruleFiles)) rules.setFile(dir, content);
		const mine = files.filter((file) => !rules.isIgnored(file)).sort();
		assert.deepEqual(mine, listed, `matches git for: ${name}`);
		for (const path of written) await rm(path);
	}

	// Details git does not expose directly.
	const rules = new IgnoreRules();
	rules.setFile("", "Private/\n*.draft.md\n");
	assert.deepEqual(rules.explain("notes/Private/a.md"), { ignored: true, dir: "", pattern: "Private/" }, "the outermost ignored directory is named");
	assert.deepEqual(rules.explain("notes/Private", true), { ignored: true, dir: "", pattern: "Private/" });
	assert.equal(rules.isIgnored("notes/Private"), false, "a directory-only pattern does not match a file of that name");
	assert.equal(rules.explain("notes/x.draft.md").pattern, "*.draft.md");
	rules.setFile("", "");
	assert.equal(rules.isIgnored("notes/x.draft.md"), false, "an emptied file clears its rules");
	rules.setFile("notes", "x.md");
	assert.equal(rules.isIgnored("notes/x.md"), true);
	assert.equal(rules.isIgnored("x.md"), false, "a rule file only reaches its own directory");
	rules.setFile("", "é.md");
	assert.equal(rules.isIgnored("e\u0301.md"), true, "decomposed and composed names are the same file");
	rules.setFile("", "name\\ \nother ");
	assert.equal(rules.isIgnored("name "), true, "an escaped trailing space is kept");
	assert.equal(rules.isIgnored("other"), true, "an unescaped trailing space is dropped");
	assert.equal(new IgnoreRules().isIgnored("anything.md"), false);
	rules.setFile("", "bad\\");
	assert.equal(rules.isIgnored("bad"), false, "a pattern ending in a lone backslash is skipped");
} finally {
	await rm(outfile, { force: true });
	await rm(workspace, { recursive: true, force: true });
}

console.log("ignore rules tests passed");
