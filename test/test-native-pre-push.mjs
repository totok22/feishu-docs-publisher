import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, cp, chmod, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
const workspace = await mkdtemp(join(tmpdir(), "native-hook-test-"));
const plugin = join(workspace, ".obsidian/plugins/feishu-docs-publisher");
const settingsPath = join(plugin, "data.json"),
	remotePath = join(workspace, "remote.json");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) => writeFile(path, JSON.stringify(value));
try {
	await mkdir(plugin, { recursive: true });
	const bin = join(workspace, "bin");
	await mkdir(bin);
	for (const file of ["sync-pre-push.mjs", "lark-sync-core.mjs", "lark-cli-command.mjs"])
		await cp(file, join(workspace, file));
	const cli = join(workspace, "fake-cli.cjs");
	await cp("test/fixtures/native-cli.cjs", cli);
	await chmod(cli, 0o755);
	await exec("git", ["init"], { cwd: workspace });
	await exec("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
	await exec("git", ["config", "user.name", "Test"], { cwd: workspace });
	const png = Buffer.alloc(24);
	Buffer.from("89504e470d0a1a0a", "hex").copy(png);
	png.writeUInt32BE(320, 16);
	png.writeUInt32BE(160, 20);
	await writeFile(join(workspace, "image.png"), png);
	await writeFile(join(workspace, "clip.mp4"), "video bytes");
	await writeFile(join(workspace, "paper.pdf"), "%PDF-1.4\n" + workspace);
	// The hook uses the real Poppler adapter, with deterministic fake command outputs.
	for (const [name, program] of [
		["pdfinfo", `process.stdout.write('Page    2 rot: 0\\nPage    2 CropBox: 0 0 200 200\\n');`],
		["pdftoppm", `process.stdout.write(Buffer.from('${png.toString("base64")}','base64'));`]
	]) {
		const path = join(bin, name);
		await writeFile(path, "#!/usr/bin/env node\n" + program);
		await chmod(path, 0o755);
	}
	const source =
		"---\nlark_doc_url: https://example.feishu.cn/wiki/wiki-node\n---\nBefore\n\n> [!note]- Mixed\n> ![[image.png|320]]\n>\n> ![[paper.pdf#page=2&rect=10,20,110,70|300]]\n>\n> ![[clip.mp4]]\n\nAfter";
	await writeFile(join(workspace, "Note.md"), source);
	await exec("git", ["add", "."], { cwd: workspace });
	await exec("git", ["commit", "-m", "initial"], { cwd: workspace });
	const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
	const settings = {
		autoSyncMode: "pre-push",
		syncStrategy: "auto",
		titleSource: "file-name",
		nativeCalloutExport: true,
		researchLabelColors: false,
		larkCliPath: cli,
		unrelatedSetting: "keep"
	};
	await save(settingsPath, settings);
	const initial = () => ({
		revision: 1,
		serial: 0,
		tokens: {},
		calls: [],
		blocks: {
			doc: {
				block_id: "doc",
				block_type: 1,
				page: { elements: [{ text_run: { content: "Note" } }] },
				children: []
			}
		}
	});
	await save(remotePath, initial());
	async function hook() {
		return await new Promise((res, rej) => {
			const child = spawn(process.execPath, ["sync-pre-push.mjs"], {
				cwd: workspace,
				env: {
					...process.env,
					NATIVE_TEST_STATE: remotePath,
					PATH: bin + ":" + process.env.PATH,
					FEISHU_LARK_CLI_SYNC_NOTIFY_PLATFORM: "test"
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
			let stderr = "";
			child.stderr.on("data", (chunk) => (stderr += chunk));
			child.stdout.resume();
			child.on("error", rej);
			child.on("close", (code) => res({ code, stderr }));
			child.stdin.end(`refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`);
		});
	}
	let result = await hook();
	assert.equal(result.code, 0, result.stderr);
	let stored = await json(settingsPath),
		remote = await json(remotePath);
	assert.ok(stored.nativeCalloutStates.doc);
	assert.ok(stored.nativeCalloutStates["wiki-node"]);
	assert.equal(stored.nativeCalloutStates[""], undefined, "legacy bindings must never share an empty alias");
	assert.equal(stored.unrelatedSetting, "keep");
	const parent = remote.blocks[remote.blocks.doc.children[1]];
	assert.deepEqual(
		parent.children.map((id) => remote.blocks[id].block_type),
		[27, 27, 33]
	);
	assert.equal(remote.blocks[parent.children[0]].image.width, 320);
	assert.equal(remote.blocks[parent.children[1]].image.width, 300);
	assert.match(remote.blocks[parent.children[1]].image.caption.content, /paper\.pdf · p\.2/);
	assert.doesNotMatch(JSON.stringify(remote.blocks), /FEISHU_LARK_LOCAL_(?:IMAGE|VIDEO)_/);
	assert.equal(await readFile(join(workspace, "Note.md"), "utf8"), source);
	const writes = remote.calls.filter(
		(args) =>
			(args[0] === "api" && args[1] !== "GET") || args.includes("+media-insert") || args.includes("+media-upload")
	).length;
	stored.nativeCalloutExport = false;
	await save(settingsPath, stored);
	result = await hook();
	assert.equal(result.code, 0, result.stderr);
	remote = await json(remotePath);
	assert.equal(
		remote.calls.filter(
			(args) =>
				(args[0] === "api" && args[1] !== "GET") ||
				args.includes("+media-insert") ||
				args.includes("+media-upload")
		).length,
		writes,
		"a restarted hook retains native mapping with the toggle off"
	);
	const childId = remote.blocks[parent.children[2]].children[0];
	remote.blocks[childId].file.token = "human-edit";
	remote.revision++;
	await save(remotePath, remote);
	result = await hook();
	assert.equal(result.code, 1);
	assert.match(result.stderr, /飞书正文已被修改/);
	// Precise migration blocks an existing body before writing anything.
	const fresh = initial();
	fresh.blocks.doc.children = ["human"];
	fresh.blocks.human = {
		block_id: "human",
		block_type: 2,
		text: { elements: [{ text_run: { content: "Keep me" } }] }
	};
	await save(remotePath, fresh);
	await save(settingsPath, { ...settings, syncStrategy: "precise" });
	result = await hook();
	assert.equal(result.code, 1);
	assert.match(result.stderr, /安全精确模式/);
	assert.deepEqual((await json(remotePath)).blocks.doc.children, ["human"]);
	console.log("Native hook PDF crops, mixed media, legacy aliases, restart, and migration safety tests passed");
} finally {
	await rm(workspace, { recursive: true, force: true });
}
