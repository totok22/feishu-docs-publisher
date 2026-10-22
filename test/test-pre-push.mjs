import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
	createContentHash,
	createDocumentSyncStateFromRemote,
	createSyncContentSignature,
	getDocumentStateKey,
	prepareLocalImages
} from "../lark-sync-core.mjs";

const execFileAsync = promisify(execFile);

async function run() {
	const workspace = await mkdtemp(join(tmpdir(), "pre-push-test-"));
	try {
		await execFileAsync("git", ["init"], { cwd: workspace });
		await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
		await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: workspace });

			await mkdir(join(workspace, ".obsidian", "plugins", "feishu-docs-publisher"), { recursive: true });
			await mkdir(join(workspace, "bin"), { recursive: true });
			await cp("sync-pre-push.mjs", join(workspace, "sync-pre-push.mjs"));
			await cp("lark-sync-core.mjs", join(workspace, "lark-sync-core.mjs"));
			await cp("lark-cli-command.mjs", join(workspace, "lark-cli-command.mjs"));
			await writeFakeLarkCli(workspace);
			await writeFakeSystemNotifiers(workspace);

		await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
		await writeFile(join(workspace, "unbound.md"), "Body");
		await execFileAsync("git", ["add", "."], { cwd: workspace });
		await execFileAsync("git", ["commit", "-m", "init"], { cwd: workspace });

		await testPreciseSkip(workspace);
		await testPreciseRepairsEmptyStateBeforeSkip(workspace);
		await testPreciseBootstrapFromRemote(workspace);
		await testPreciseBootstrapAfterTrim(workspace);
		await testPreciseBootstrapBlocksWithoutBlockIds(workspace);
		await testPreciseBlockedWhenBootstrapFails(workspace);
		await testPreciseReplaceRefreshesState(workspace);
		await testPreciseInsertRefreshesState(workspace);
		await testPreciseHeadingInsertUsesXml(workspace);
		await testPreciseDeleteRefreshesState(workspace);
		await testPreciseRefreshRetriesStaleRemote(workspace);
		await testPreciseRefreshUsesUpdateRevisionBeforeFetchingWithIds(workspace);
		await testPreciseRefreshUsesVisibleBlockStateWhenMarkdownIsStale(workspace);
		await testPreciseRefreshAllowsNormalizedRemoteMarkdown(workspace);
		await testPreciseSkipAllowsNormalizedRemoteMarkdown(workspace);
		await testPreciseSkipPreservesRemoteHeadingChange(workspace);
		await testPreciseUpdatesOnlyLocallyChangedBlocks(workspace);
		await testAutoOverwriteRefreshesStateBeforeUpdate(workspace);
		await testAutoUsesAcceptablePartialStateForSmallChange(workspace);
		await testPreciseSkipPreservesRemoteInsertedHeading(workspace);
		await testPreciseRefreshBeforeUpdateAvoidsDuplicateInsert(workspace);
		await testOverwriteDoesNotPersistEmptyState(workspace);
		await testOverwritePreservesDocumentTitleBeforeUpdate(workspace);
		await testOverwriteUpdates(workspace);
		await testPublishedPdfReferences(workspace);
		await testUnboundFilesDoNotBlock(workspace);
		await testDisconnectedBindingsBlockLegacyFrontmatter(workspace);
		await testFalseAndUnrelatedTombstonesDoNotBlock(workspace);
		await testIgnoreFilesAreSkipped(workspace);
		await testPersistedBindingWithoutFrontmatter(workspace);
		await testPersistedBindingTakesPriority(workspace);
		await testPersistedBindingUsesVaultRelativePaths(workspace);
		await testInvalidPersistedBindingFallsBackToFrontmatter(workspace);
		await testPersistedPdfBindingIsExcluded(workspace);
		await testAutoSyncModeStillControlsPersistedBindings(workspace);
		await testDeletedMarkdownDoesNotBlock(workspace);
		await testDeletedRemoteDocumentUnbindsAndBlocks(workspace);
		await testDeletedRemoteDocumentRemovesPersistedBinding(workspace);
		await testDeletedRemoteDocumentRemovesPersistedBinding(workspace, false);
		await testUnrelatedErrorsPreserveBindings(workspace);
		await testCanonicalStateKey(workspace);
		await testWikiUrlReusesCanonicalImageState(workspace);
		await testStateWritePreservesExternalDocuments(workspace);
		await testStateCacheTrim(workspace);
		await testSharedDocumentAliasesAreRejected(workspace);
		await testLegacyWikiAliasesAreRejected(workspace);
		await testConcurrentFailureWaitsForStartedTasks(workspace);
		await testMissingLarkCliFailsWithInstallPrompt(workspace);
		await testUnsupportedLarkCliVersionFailsEarly(workspace);
		await testLarkCliVersionFallsBackToVersionFlag(workspace);
		await testLarkCliVersionCheckPersistsAndSkips(workspace);
		await testPrePushUsesConfiguredProxy(workspace);
		await testMacSystemNotificationOnFailure(workspace);
		await testWindowsSystemNotificationOnFailure(workspace);
		await testImageOnlyChangeSyncsReferencingDocument(workspace);
		await testImageOnlyChangeSyncsReferencingDocument(workspace, true);
		await testLegacyPluginDataFallback(workspace);
		await testCurrentPluginDataPrecedesLegacy(workspace);
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}

async function testPreciseSkip(workspace) {
	await resetWorkspaceFiles(workspace);
	const contentForLark = "# bound\n\nBody";
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncState(workspace, "https://example.feishu.cn/docx/doc-token", contentForLark);
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--api-version v2/);
	assert.doesNotMatch(log, /docs \+update/);
}

async function testPrePushUsesConfiguredProxy(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, {
		autoSyncMode: "pre-push",
		syncStrategy: "precise",
		language: "en",
		proxyMode: "custom",
		proxyHost: "127.0.0.1",
		proxyPort: 7890
	});
	await clearLog(workspace);
	await runHook(workspace, { env: { LARK_CLI_LOG_PROXY: "1" } });
	const proxyLog = await readFile(join(workspace, "lark-cli.log.proxy"), "utf8");
	assert.match(proxyLog, /HTTPS_PROXY=http:\/\/127\.0\.0\.1:7890/);
	assert.match(proxyLog, /HTTP_PROXY=http:\/\/127\.0\.0\.1:7890/);
	assert.match(proxyLog, /LARKSUITE_CLI_PROXY_ENABLE=0/);
}

async function testPreciseRepairsEmptyStateBeforeSkip(workspace) {
	await resetWorkspaceFiles(workspace);
	const contentForLark = "# bound\n\nBody";
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncState(workspace, "https://example.feishu.cn/docx/doc-token", contentForLark);
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--doc-format markdown/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.doesNotMatch(log, /docs \+update/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), ["blk-1"]);
}

async function testPreciseBootstrapFromRemote(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_CHANGED_AFTER_UPDATE: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--doc-format markdown/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.match(log, /docs \+update .*--command block_replace .*--block-id blk-1/);
	const state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"].units.length, 1);
	assert.equal(state.documents["doc-token"].units[0].blockId, "blk-1");
}

async function testPreciseBootstrapAfterTrim(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_CHANGED_AFTER_UPDATE: "1",
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);
	assert.match(log, /docs \+update .*--doc doc-token .*--command block_replace .*--block-id blk-1/);
	const state = await readSyncState(workspace);
	assert.ok(state.documents["doc-token"]);
	assert.ok(Date.parse(state.documents["doc-token"].updatedAt) > Date.parse("2026-06-12T00:00:00.000Z"));
	assert.equal(state.documents["https://example.feishu.cn/docx/doc-token"], undefined);
}

async function testPreciseBlockedWhenBootstrapFails(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "zh-CN" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			LARK_CLI_NO_BLOCK_IDS: "1"
		}
	});
	assert.notEqual(result.exitCode, 0);
	assert.match(result.stderr, /pre-push 同步失败：bound\.md/);
	assert.match(result.stderr, /缺少远端 block 映射/);
	assert.match(result.stderr, /已阻止 git push/);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch/);
	assert.doesNotMatch(log, /docs \+update/);
}

async function testPreciseBootstrapBlocksWithoutBlockIds(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "zh-CN" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			LARK_CLI_NO_BLOCK_IDS: "1"
		}
	});
	assert.notEqual(result.exitCode, 0);
	assert.match(result.stderr, /缺少远端 block 映射/);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.match(log, /docs \+fetch .*--doc-format markdown/);
	assert.doesNotMatch(log, /docs \+update/);
	const state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"], undefined);
}

async function testPreciseReplaceRefreshesState(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_REPLACED: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_replace .*--block-id blk-1/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	const state = await readSyncState(workspace);
	const documentState = state.documents["doc-token"];
	assert.equal(documentState.units.length, 1);
	assert.equal(documentState.units[0].blockId, "blk-2");
	assert.equal(documentState.contentHash, await createContentHash("# bound\n\nChanged"));
}

async function testPreciseInsertRefreshesState(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_insert_after .*--block-id -1/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), [
		"blk-1",
		"blk-2"
	]);
}

async function testPreciseHeadingInsertUsesXml(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_insert_after .*--doc-format xml .*--block-id -1/);
	await clearLog(workspace);
}

async function testPreciseDeleteRefreshesState(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody\n\n## Removed", [
		{
			stableId: "0:paragraph",
			kind: "paragraph",
			hash: await createContentHash("Body"),
			blockId: "blk-1"
		},
		{
			stableId: "1:heading",
			kind: "heading",
			hash: await createContentHash("## Removed"),
			blockId: "blk-2"
		}
	]);
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_delete .*--block-id blk-2/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	const state = await readSyncState(workspace);
	const documentState = state.documents["doc-token"];
	assert.equal(documentState.units.length, 1);
	assert.equal(documentState.units[0].blockId, "blk-1");
	assert.equal(documentState.contentHash, await createContentHash("# bound\n\nBody"));
}

async function testPreciseRefreshRetriesStaleRemote(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1",
			LARK_CLI_STALE_WITH_IDS_FETCHES: "2"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_insert_after/);
	assert.match(log, /--detail with-ids/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), [
		"blk-1",
		"blk-2"
	]);
}

async function testPreciseRefreshUsesUpdateRevisionBeforeFetchingWithIds(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1",
			LARK_CLI_UPDATE_REVISION_ID: "5",
			LARK_CLI_STALE_WITH_IDS_FETCHES: "2"
		}
	});
	const log = await readLog(workspace);
	assert.equal((log.match(/--detail with-ids/g) || []).length, 4);
	const state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"].revisionId, 5);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), [
		"blk-1",
		"blk-2"
	]);
}

async function testPreciseRefreshUsesVisibleBlockStateWhenMarkdownIsStale(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1",
			LARK_CLI_STALE_MARKDOWN_FETCHES: "9"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_insert_after/);
	assert.match(log, /--detail with-ids/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), [
		"blk-1",
		"blk-2"
	]);
}

async function testPreciseRefreshAllowsNormalizedRemoteMarkdown(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "**Changed**"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_REPLACED: "1"
		}
	});
	const state = await readSyncState(workspace);
	const documentState = state.documents["doc-token"];
	assert.equal(documentState.units.length, 1);
	assert.equal(documentState.units[0].blockId, "blk-2");
	assert.equal(documentState.contentHash, await createContentHash("# bound\n\n**Changed**"));
}

async function testPreciseSkipAllowsNormalizedRemoteMarkdown(workspace) {
	await resetWorkspaceFiles(workspace);
	const contentForLark = "# bound\n\n**Body**";
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "**Body**"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", contentForLark, [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch/);
	assert.doesNotMatch(log, /--detail with-ids/);
	assert.doesNotMatch(log, /docs \+update/);
}

async function testPreciseSkipPreservesRemoteHeadingChange(workspace) {
	await resetWorkspaceFiles(workspace);
	const contentForLark = "# bound\n\n## Title\n\nBody";
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "## Title\n\nBody"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", contentForLark, [
		{
			stableId: "0:heading",
			kind: "heading",
			hash: await createContentHash("Title"),
			blockId: "blk-heading"
		},
		{
			stableId: "1:paragraph",
			kind: "paragraph",
			hash: await createContentHash("Body"),
			blockId: "blk-1"
		}
	]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_STALE_HEADING: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--doc-format markdown/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.doesNotMatch(log, /docs \+update/);
	const state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"].revisionId, 4);
}

async function testPreciseUpdatesOnlyLocallyChangedBlocks(workspace) {
	await resetWorkspaceFiles(workspace);
	const previousContent = "# bound\n\n## Title\n\nBody";
	await writeFile(join(workspace, "bound.md"), boundMarkdown(
		"https://example.feishu.cn/docx/doc-token",
		"## Title\n\nChanged"
	));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", previousContent, [
		{
			stableId: "0:heading",
			kind: "heading",
			hash: await createContentHash("Title"),
			blockId: "blk-heading"
		},
		{
			stableId: "1:paragraph",
			kind: "paragraph",
			hash: await createContentHash("Body"),
			blockId: "blk-1"
		}
	]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_REMOTE_HEADING: "1",
			LARK_CLI_UPDATE_REVISION_ID: "5"
		}
	});
	let log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_replace .*--block-id blk-1/);
	assert.doesNotMatch(log, /docs \+update .*--block-id blk-heading/);
	let state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"].revisionId, 5);

	await writeFile(join(workspace, "bound.md"), boundMarkdown(
		"https://example.feishu.cn/docx/doc-token",
		"## Local Title\n\nChanged"
	));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_REMOTE_HEADING: "1",
			LARK_CLI_UPDATE_REVISION_ID: "6"
		}
	});
	log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_replace .*--block-id blk-heading .*--revision-id 5/);
	state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"].revisionId, 6);
}

async function testPreciseSkipPreservesRemoteInsertedHeading(workspace) {
	await resetWorkspaceFiles(workspace);
	const contentForLark = "# bound\n\nBody";
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", contentForLark, [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_EXTRA_HEADING: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.doesNotMatch(log, /docs \+update/);
}

async function testAutoOverwriteRefreshesStateBeforeUpdate(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "## Title\n\nBody"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "auto", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nOld1\n\nOld2\n\nOld3\n\nOld4\n\nOld5\n\nOld6\n\nOld7\n\nOld8\n\nOld9", [
		{ stableId: "0:paragraph", kind: "paragraph", hash: await createContentHash("Old1"), blockId: "old-1" },
		{ stableId: "1:paragraph", kind: "paragraph", hash: await createContentHash("Old2"), blockId: "old-2" },
		{ stableId: "2:paragraph", kind: "paragraph", hash: await createContentHash("Old3"), blockId: "old-3" },
		{ stableId: "3:paragraph", kind: "paragraph", hash: await createContentHash("Old4"), blockId: "old-4" },
		{ stableId: "4:paragraph", kind: "paragraph", hash: await createContentHash("Old5"), blockId: "old-5" },
		{ stableId: "5:paragraph", kind: "paragraph", hash: await createContentHash("Old6"), blockId: "old-6" },
		{ stableId: "6:paragraph", kind: "paragraph", hash: await createContentHash("Old7"), blockId: "old-7" },
		{ stableId: "7:paragraph", kind: "paragraph", hash: await createContentHash("Old8"), blockId: "old-8" },
		{ stableId: "8:paragraph", kind: "paragraph", hash: await createContentHash("Old9"), blockId: "old-9" }
	]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_STALE_HEADING: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.match(log, /docs \+update .*--command block_replace .*--doc-format xml .*--block-id blk-heading/);
	assert.doesNotMatch(log, /--command block_insert_after .*--block-id blk-heading/);
	assert.doesNotMatch(log, /--command block_delete .*--block-id blk-heading/);
	assert.doesNotMatch(log, /--command overwrite/);
}

async function testAutoUsesAcceptablePartialStateForSmallChange(workspace) {
	await resetWorkspaceFiles(workspace);
	const previousContent = "# bound\n\n## Title\n\n" + Array.from({ length: 100 }, (_, index) => `Body ${index}`).join("\n\n");
	const nextBody = "## Title 22\n\n" + Array.from({ length: 100 }, (_, index) => `Body ${index}`).join("\n\n");
	const signature = await createSyncContentSignature(previousContent);
	const units = signature.units.map((unit, index) => ({
		stableId: `${index}:${unit.kind}`,
		kind: unit.kind,
		hash: unit.hash,
		blockId: index === 0 ? "blk-heading" : index === 51 ? "" : `blk-${index}`
	}));
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", nextBody));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "auto", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", previousContent, units);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_MANY_BLOCKS: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_replace .*--doc-format xml .*--block-id blk-heading/);
	assert.doesNotMatch(log, /--command block_insert_after .*--block-id blk-heading/);
	assert.doesNotMatch(log, /--command block_delete .*--block-id blk-heading/);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.doesNotMatch(log, /--command overwrite/);
}

async function testPreciseRefreshBeforeUpdateAvoidsDuplicateInsert(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_INSERTED: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--detail with-ids/);
	assert.doesNotMatch(log, /docs \+update/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), [
		"blk-1",
		"blk-2"
	]);
}


async function testCanonicalStateKey(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, {
		version: 1,
		documents: {
			"https://example.feishu.cn/docx/doc-token": {
				doc: "https://example.feishu.cn/docx/doc-token",
				contentHash: "legacy-hash",
				units: [],
				updatedAt: "2026-06-12T00:00:00.000Z"
			}
		}
	});
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	const state = await readSyncState(workspace);
	assert.ok(state.documents["doc-token"]);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), ["blk-1"]);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch/);
	assert.doesNotMatch(log, /docs \+update/);
	const refreshedState = await readSyncState(workspace);
	assert.ok(refreshedState.documents["doc-token"]);
}

async function testWikiUrlReusesCanonicalImageState(workspace) {
	await resetWorkspaceFiles(workspace);
	const wikiUrl = "https://example.feishu.cn/wiki/wiki-node";
	await writeFile(join(workspace, "bound.md"), boundMarkdown(wikiUrl, "Body\n\n## Inserted"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "auto", language: "en" });
	const previousState = await createDocumentSyncStateFromRemote(
		"doc-token",
		"# bound\n\nBody",
		"<title id=\"doc-title\">bound</title><p id=\"blk-1\">Body</p>",
		4
	);
	await writeSyncStateRaw(workspace, {
		version: 1,
		documents: { "doc-token": previousState }
	});
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1",
			LARK_CLI_FETCH_INSERTED_AFTER_UPDATE: "1",
			LARK_CLI_UPDATE_REVISION_ID: "5"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--doc doc-token .*--command block_insert_after/);
	assert.doesNotMatch(log, /--command overwrite/);
}

async function testStateWritePreservesExternalDocuments(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateWithUnits(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody", [{
		stableId: "0:paragraph",
		kind: "paragraph",
		hash: await createContentHash("Body"),
		blockId: "blk-1"
	}]);
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_CHANGED_AFTER_UPDATE: "1",
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1",
			LARK_CLI_WRITE_EXTERNAL_SYNC_STATE: join(
				workspace,
				".obsidian",
				"plugins",
				"feishu-docs-publisher",
				"lark-sync-state.json"
			)
		}
	});
	const state = await readSyncState(workspace);
	assert.ok(state.documents["doc-token"]);
	assert.equal(state.documents["https://example.feishu.cn/docx/doc-token"], undefined);
	assert.equal(state.documents["external-doc"].contentHash, "external-hash");
}

async function testStateCacheTrim(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, {
		autoSyncMode: "pre-push",
		syncStrategy: "overwrite",
		language: "en",
		stateCacheRetainLimit: 10
	});
	await writeSyncStateRaw(workspace, createSizedSyncState(16));
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	const state = await readSyncState(workspace);
	assert.equal(Object.keys(state.documents).length, 10);
	assert.equal(state.documents["old-doc-000"], undefined);
	assert.equal(state.documents["old-doc-006"], undefined);
	assert.ok(state.documents["old-doc-007"]);
	assert.ok(state.documents["doc-token"]);
}

async function testSharedDocumentAliasesAreRejected(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdownWithToken(
		"doc-token",
		"https://example.feishu.cn/docx/doc-token",
		"Body"
	));
	await writeFile(
		join(workspace, "same-doc.md"),
		boundMarkdown("https://example.feishu.cn/docx/doc-token", "Same doc")
	);
	await execFileAsync("git", ["add", "bound.md", "same-doc.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			LARK_CLI_LOCK_DIR: workspace,
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	assert.equal(result.exitCode, 1);
	assert.match(result.stderr, /shared by local files.*bound.md.*same-doc.md/);
	const log = await readLog(workspace);
	assert.doesNotMatch(log, /docs \+update/);
}

async function testLegacyWikiAliasesAreRejected(workspace) {
	for (const current of [
		boundMarkdown('https://example.feishu.cn/wiki/current-node', 'Body'),
		boundMarkdownWithToken('current-node', 'https://example.feishu.cn/wiki/current-node', 'Body'),
		boundMarkdown('https://example.feishu.cn/docx/doc-token', 'Body')
	]) {
		await resetWorkspaceFiles(workspace);
		await writeFile(join(workspace, 'bound.md'), current);
		await writeFile(join(workspace, 'same-doc.md'), boundMarkdown('https://example.feishu.cn/wiki/other-shortcut', 'Other body'));
		await execFileAsync('git', ['add', 'bound.md', 'same-doc.md'], { cwd: workspace });
		await execFileAsync('git', ['commit', '-m', 'legacy aliases baseline'], { cwd: workspace });
		const remoteHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspace })).stdout.trim();
		await writeFile(join(workspace, 'bound.md'), current + '\nChanged');
		await execFileAsync('git', ['add', 'bound.md'], { cwd: workspace });
		await execFileAsync('git', ['commit', '-m', 'change one legacy-bound note'], { cwd: workspace });
		const localHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspace })).stdout.trim();
		await writeSettings(workspace, { autoSyncMode: 'pre-push', syncStrategy: 'overwrite', language: 'en' });
		await writeSyncStateRaw(workspace, { version: 1, documents: {} });
		await clearLog(workspace);
		const result = await spawnHook(workspace, `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`, { LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: '1' });
		assert.equal(result.exitCode, 1);
		assert.match(result.stderr, /shared by local files.*bound.md.*same-doc.md/);
		const log = await readLog(workspace);
		assert.match(log, /docs \+fetch .*--doc https:\/\/example.feishu.cn\/wiki\/other-shortcut/);
		assert.doesNotMatch(log, /docs \+update|\+media-insert/);
	}
}

async function testConcurrentFailureWaitsForStartedTasks(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await writeFile(
		join(workspace, "second.md"),
		boundMarkdown("https://example.feishu.cn/docx/second-token", "Second")
	);
	await execFileAsync("git", ["add", "bound.md", "second.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			LARK_CLI_FAIL_DOC: "doc-token"
		}
	});
	assert.notEqual(result.exitCode, 0);
	const log = await readLog(workspace);
	assert.match(log, /--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);
	assert.match(log, /--doc https:\/\/example\.feishu\.cn\/docx\/second-token/);
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["second-token"].units.map((unit) => unit.blockId), ["blk-1"]);
}

async function testUnsupportedLarkCliVersionFailsEarly(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			LARK_CLI_VERSION: "1.0.53"
		}
	});
	assert.notEqual(result.exitCode, 0);
	assert.match(result.stderr, /lark-cli 版本过低：1\.0\.53，请升级到大于 1\.0\.53 的版本。/);
	const log = await readLog(workspace);
	assert.match(log, /^-version$/m);
	assert.doesNotMatch(log, /docs \+fetch|docs \+update/);
}

async function testMissingLarkCliFailsWithInstallPrompt(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, {
		autoSyncMode: "pre-push",
		larkCliPath: join(workspace, "bin", "missing-lark-cli"),
		syncStrategy: "overwrite"
	});
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const result = await runHook(workspace, { reject: false });
	assert.notEqual(result.exitCode, 0);
	assert.match(result.stderr, /未检测到 lark-cli，请先安装 lark-cli。/);
	const log = await readLog(workspace);
	assert.equal(log, "");
}

async function testLarkCliVersionFallsBackToVersionFlag(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_VERSION_COMMAND_UNSUPPORTED: "1"
		}
	});
	const log = await readLog(workspace);
	assert.match(log, /^-version$/m);
	assert.match(log, /^-v$/m);
	assert.match(log, /docs \+update/);
}

async function testLarkCliVersionCheckPersistsAndSkips(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace);
	const firstLog = await readLog(workspace);
	assert.match(firstLog, /^-version$/m);
	const settings = JSON.parse(await readFile(settingsPath(workspace), "utf8"));
	assert.deepEqual(settings.larkCliVersionCheck, {
		executable: larkCliExecutablePath(workspace),
		version: "1.0.54"
	});

	await clearLog(workspace);
	await runHook(workspace);
	const secondLog = await readLog(workspace);
	assert.doesNotMatch(secondLog, /^-version$/m);
	assert.match(secondLog, /docs \+update/);
}

async function testMacSystemNotificationOnFailure(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await clearNotificationLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			FEISHU_LARK_CLI_SYNC_NOTIFY_PLATFORM: "darwin",
			FEISHU_LARK_CLI_SYNC_OSASCRIPT_PATH: fakeNotifierPath(workspace, "osascript"),
			LARK_CLI_NO_BLOCK_IDS: "1"
		}
	});
	assert.notEqual(result.exitCode, 0);
	const notificationLog = await readNotificationLog(workspace);
	assert.match(notificationLog, /^osascript(?:\.cmd)?\n/);
	assert.match(notificationLog, /display\s+notification/);
	assert.match(notificationLog, /pre-push sync failed: bound\.md/);
	if (process.platform !== "win32") {
		assert.match(notificationLog, /with title "Feishu Docs Publisher"/);
		assert.match(notificationLog, /sound name "Basso"/);
	}
}

async function testWindowsSystemNotificationOnFailure(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await clearNotificationLog(workspace);
	const result = await runHook(workspace, {
		reject: false,
		env: {
			FEISHU_LARK_CLI_SYNC_NOTIFY_PLATFORM: "win32",
			FEISHU_LARK_CLI_SYNC_POWERSHELL_PATH: fakeNotifierPath(workspace, "powershell"),
			LARK_CLI_NO_BLOCK_IDS: "1"
		}
	});
	assert.notEqual(result.exitCode, 0);
	const notificationLog = await readNotificationLog(workspace);
	assert.match(notificationLog, /^powershell(?:\.cmd)?\n/);
	assert.match(notificationLog, /System\.Windows\.Forms\.NotifyIcon/);
	assert.match(notificationLog, /pre-push\s+sync\s+failed:\s+bound\.md/);
	assert.match(notificationLog, /Feishu Docs Publisher/);
}

async function testOverwriteUpdates(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+update/);
	assert.match(log, /--command overwrite/);
}

async function testPublishedPdfReferences(workspace) {
	await resetWorkspaceFiles(workspace);
	await mkdir(join(workspace, "papers"), { recursive: true });
	await writeFile(join(workspace, "papers/report.pdf"), "%PDF-1.4\n%%EOF");
	const source = boundMarkdown("https://example.feishu.cn/docx/doc-token", "[[papers/report.pdf]] and ![[papers/report.pdf#page=2]]");
	await writeFile(join(workspace, "bound.md"), source);
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { syncStrategy: "overwrite", language: "en",
		documentBindings: { "bound.md": { token: "doc-token" } },
		pdfBindings: { "papers/report.pdf": { status: "published", fileToken: "pdf-file" } } });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace);
	const uploaded = await readFile(join(workspace, "lark-cli.log.overwrite-doc-token.md"), "utf8");
	assert.equal((uploaded.match(/<cite type="doc" doc-id="pdf-file" file-type="file"><\/cite>/g) || []).length, 2);
	assert.doesNotMatch(uploaded, /\[\[/);
	assert.doesNotMatch(await readLog(workspace), /drive \+upload/, "the hook only reuses PDF bindings");
	assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), source);
	await rm(join(workspace, "papers"), { recursive: true, force: true });
}

async function testOverwriteDoesNotPersistEmptyState(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_FETCH_CHANGED_AFTER_UPDATE: "1",
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), ["blk-1"]);
}

async function testOverwritePreservesDocumentTitleBeforeUpdate(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Changed"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "overwrite", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, {
		env: {
			LARK_CLI_EXPORT_TITLE_MARKDOWN: "1",
			LARK_CLI_RETURN_DOC_TOKEN_FOR_URL: "1"
		}
	});
	const overwritten = await readFile(join(workspace, "lark-cli.log.overwrite-https___example_feishu_cn_docx_doc-token.md"), "utf8");
	assert.equal(overwritten, "# bound\n\nChanged");
	const state = await readSyncState(workspace);
	assert.deepEqual(state.documents["doc-token"].units.map((unit) => unit.blockId), ["blk-1"]);
}

async function testUnboundFilesDoNotBlock(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), "Body without binding");
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace);
	assert.equal(await readLog(workspace), "");
}

async function testDeletedMarkdownDoesNotBlock(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "en" });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	const remoteHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();

	await unlink(join(workspace, "bound.md"));
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	await execFileAsync("git", ["commit", "-m", "delete bound note"], { cwd: workspace });
	const localHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
	const refs = `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`;
	const result = await spawnHook(workspace, refs, {});

	assert.equal(result.exitCode, 0, result.stderr);
	assert.equal(result.stderr, "");
	assert.equal(await readLog(workspace), "");
}

async function testDisconnectedBindingsBlockLegacyFrontmatter(workspace) {
	await resetWorkspaceFiles(workspace);
	const notePath = "disconnected/notes with spaces/笔记.md";
	const nestedContent = boundMarkdownWithToken("doc-token", "https://example.feishu.cn/docx/doc-token", "Stale binding");
	const rootContent = await readFile(join(workspace, "bound.md"), "utf8");
	await mkdir(join(workspace, "disconnected", "notes with spaces"), { recursive: true });
	await writeFile(join(workspace, notePath), nestedContent);
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	try {
		await writeSettings(workspace, {
			syncStrategy: "precise", updateFrontmatter: false, documentBindings: {},
			disconnectedBindings: { "bound.md": true, [notePath]: true }
		});
		await writeSyncState(workspace, "doc-token", "# bound\n\nBody");
		const settingsBefore = await readFile(settingsPath(workspace), "utf8");
		const stateBefore = await readSyncState(workspace);
		await clearLog(workspace);
		await runHook(workspace);
		assert.equal(await readLog(workspace), "");
		assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), rootContent);
		assert.equal(await readFile(join(workspace, notePath), "utf8"), nestedContent);
		assert.equal(await readFile(settingsPath(workspace), "utf8"), settingsBefore);
		assert.deepEqual(await readSyncState(workspace), stateBefore);
	} finally {
		await rm(join(workspace, "disconnected"), { recursive: true, force: true });
		await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	}
}

async function testIgnoreFilesAreSkipped(workspace) {
	await resetWorkspaceFiles(workspace);
	const nestedPath = "ignored/notes/笔记.md";
	const nestedContent = boundMarkdownWithToken("nested-token", "https://example.feishu.cn/docx/nested-token", "Ignored folder");
	await mkdir(join(workspace, "ignored", "notes"), { recursive: true });
	await writeFile(join(workspace, nestedPath), nestedContent);
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	const rulesAt = (dir) => join(workspace, dir, ".feishuignore");
	const runWithRules = async (files) => {
		for (const [dir, content] of Object.entries(files)) await writeFile(rulesAt(dir), content);
		await writeSettings(workspace, { syncStrategy: "overwrite", updateFrontmatter: false });
		await writeSyncStateRaw(workspace, { version: 1, documents: {} });
		await clearLog(workspace);
		await runHook(workspace);
		const log = await readLog(workspace);
		for (const dir of Object.keys(files)) await rm(rulesAt(dir), { force: true });
		return log;
	};
	try {
		// A rule file in the vault root, or in the folder itself, keeps bound notes out of the push.
		assert.equal(await runWithRules({ "": "/bound.md\n/ignored/\n" }), "");
		assert.equal(await runWithRules({ "": "/bound.md\n", ignored: "notes/\n" }), "");
		assert.equal(await runWithRules({ "": "*.md\n" }), "", "wildcards apply");
		// "!" brings a note back; the other note stays ignored by the wildcard.
		const partial = await runWithRules({ "": "*.md\n!/bound.md\n" });
		assert.match(partial, /docs \+update .*--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);
		assert.doesNotMatch(partial, /nested-token/);
		// Rules that match nothing hide nothing.
		assert.match(await runWithRules({ "": "/bound.md.bak\nignore/\n# /bound.md\n" }),
			/docs \+update .*--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);

		// A rule file that cannot be read stops the push: syncing without knowing the rules could publish ignored notes.
		await mkdir(rulesAt(""));
		await writeSettings(workspace, { syncStrategy: "overwrite", updateFrontmatter: false });
		await writeSyncStateRaw(workspace, { version: 1, documents: {} });
		await clearLog(workspace);
		const result = await runHook(workspace, { reject: false });
		assert.notEqual(result.exitCode, 0);
		assert.equal(await readLog(workspace), "");
	} finally {
		await rm(rulesAt(""), { recursive: true, force: true });
		await rm(join(workspace, "ignored"), { recursive: true, force: true });
		await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	}
}

async function testFalseAndUnrelatedTombstonesDoNotBlock(workspace) {
	await resetWorkspaceFiles(workspace);
	for (const value of [false, "true"]) {
		await writeSettings(workspace, {
			syncStrategy: "overwrite", updateFrontmatter: false,
			disconnectedBindings: {
				"bound.md": value,
				"nested/bound.md": true,
				[join(workspace, "bound.md")]: true
			}
		});
		await writeSyncStateRaw(workspace, { version: 1, documents: {} });
		await clearLog(workspace);
		await runHook(workspace);
		assert.match(await readLog(workspace), /docs \+update .*--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);
	}
}

async function testPersistedBindingWithoutFrontmatter(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), "Changed");
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	const record = { token: "doc-token", url: "https://example.feishu.cn/docx/doc-token", publishedAt: "2026-10-05" };
	await writeSettings(workspace, { syncStrategy: "precise", updateFrontmatter: false, documentBindings: { "bound.md": record } });
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace, { env: { LARK_CLI_FETCH_CHANGED_AFTER_UPDATE: "1" } });
	assert.match(await readLog(workspace), /docs \+update .*--doc doc-token .*--command block_replace/);
	assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), "Changed");
	assert.deepEqual(JSON.parse(await readFile(settingsPath(workspace), "utf8")).documentBindings["bound.md"], record);
	assert.equal(JSON.parse(await readFile(settingsPath(workspace), "utf8")).updateFrontmatter, false);
	assert.equal((await readSyncState(workspace)).documents["doc-token"].contentHash, await createContentHash("# bound\n\nChanged"));
}

async function testPersistedBindingTakesPriority(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), boundMarkdownWithToken("legacy-token", "https://example.feishu.cn/docx/legacy-token", "Body"));
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, {
		syncStrategy: "overwrite",
		documentBindings: { "bound.md": { token: "doc-token", url: "https://example.feishu.cn/wiki/wiki-node" } }
	});
	await writeSyncStateRaw(workspace, { version: 1, documents: {
		"wiki-node": { doc: "legacy-token", contentHash: await createContentHash("# bound\n\nBody"), units: [] }
	} });
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--doc doc-token .*--command overwrite/);
	assert.doesNotMatch(log, /legacy-token|--doc https:\/\/example\.feishu\.cn\/wiki/);
	assert.ok((await readSyncState(workspace)).documents["doc-token"]);
}

async function testPersistedBindingUsesVaultRelativePaths(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), "Unbound");
	const notePath = "nested/notes with spaces/笔记.md";
	await mkdir(join(workspace, "nested", "notes with spaces"), { recursive: true });
	await writeFile(join(workspace, notePath), "Body");
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	try {
		for (const binding of [{ token: "doc-token" }, { url: "https://example.feishu.cn/docx/doc-token" }]) {
			await writeSettings(workspace, {
				syncStrategy: "overwrite",
				documentBindings: {
					[notePath]: binding,
					"笔记.md": { token: "wrong-basename" },
					[join(workspace, "bound.md")]: { token: "wrong-absolute-path" }
				}
			});
			await writeSyncStateRaw(workspace, { version: 1, documents: {} });
			await clearLog(workspace);
			await runHook(workspace);
			const log = await readLog(workspace);
			assert.match(log, /docs \+update .*--doc (?:doc-token|https:\/\/example\.feishu\.cn\/docx\/doc-token) .*--command overwrite/);
			assert.equal(log.split("\n").filter((line) => line.includes("+update")).length, 1);
			assert.doesNotMatch(log, /wrong-basename|wrong-absolute-path/);
		}
		await execFileAsync("git", ["commit", "-m", "nested note baseline"], { cwd: workspace });
		const remoteHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
		await writeFile(join(workspace, notePath), "Changed nested note");
		await execFileAsync("git", ["add", notePath], { cwd: workspace });
		await execFileAsync("git", ["commit", "-m", "nested note changed"], { cwd: workspace });
		const localHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
		await clearLog(workspace);
		const result = await spawnHook(workspace, `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`, {});
		assert.equal(result.exitCode, 0, result.stderr);
		assert.match(await readLog(workspace), /docs \+update .*--command overwrite/);
		await writeFile(join(workspace, notePath), "Uncommitted nested note");
		await clearLog(workspace);
		const fallbackResult = await spawnHook(workspace, "", {});
		assert.equal(fallbackResult.exitCode, 0, fallbackResult.stderr);
		assert.match(await readLog(workspace), /docs \+update .*--command overwrite/);
	} finally {
		await rm(join(workspace, "nested"), { recursive: true, force: true });
		await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	}
}

async function testInvalidPersistedBindingFallsBackToFrontmatter(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, {
		syncStrategy: "overwrite",
		documentBindings: { "bound.md": { token: 42, url: "  " }, "unbound.md": null }
	});
	await writeSyncStateRaw(workspace, { version: 1, documents: {} });
	await clearLog(workspace);
	await runHook(workspace);
	assert.match(await readLog(workspace), /docs \+update .*--doc https:\/\/example\.feishu\.cn\/docx\/doc-token/);
}

async function testPersistedPdfBindingIsExcluded(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), "Unbound");
	await writeFile(join(workspace, "bound.pdf"), "%PDF-1.7");
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	try {
		await writeSettings(workspace, {
			documentBindings: { "bound.pdf": { token: "pdf-token", url: "https://example.feishu.cn/file/pdf-token" } }
		});
		await clearLog(workspace);
		await runHook(workspace);
		assert.equal(await readLog(workspace), "");
	} finally {
		await unlink(join(workspace, "bound.pdf"));
		await execFileAsync("git", ["add", "--all"], { cwd: workspace });
	}
}

async function testAutoSyncModeStillControlsPersistedBindings(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeSettings(workspace, {
		autoSyncMode: "manual",
		documentBindings: { "bound.md": { token: "doc-token" } }
	});
	await clearLog(workspace);
	await runHook(workspace);
	assert.equal(await readLog(workspace), "");
}

async function testDeletedRemoteDocumentRemovesPersistedBinding(workspace, legacyFrontmatter = true) {
	await resetWorkspaceFiles(workspace);
	const original = legacyFrontmatter ? `---\nlark_doc_token: legacy-token\ntags: [sync]\n---\nBody` : "Body";
	await writeFile(join(workspace, "bound.md"), original);
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	const otherBinding = { token: "other-token", url: "https://example.feishu.cn/docx/other-token" };
	await writeSettings(workspace, {
		syncStrategy: "precise", language: "en", unrelatedSetting: "keep", updateFrontmatter: false,
		documentBindings: { "bound.md": { token: "doc-token" }, "other.md": otherBinding }
	});
	await writeSyncState(workspace, "doc-token", "# bound\n\nBody");
	await clearLog(workspace);
	const result = await runHook(workspace, { reject: false, env: { LARK_CLI_DELETED_DOC: "doc-token" } });
	assert.equal(result.exitCode, 1);
	assert.match(result.stderr, /Binding was removed automatically/);
	const settings = JSON.parse(await readFile(settingsPath(workspace), "utf8"));
	assert.equal(settings.documentBindings["bound.md"], undefined);
	assert.deepEqual(settings.documentBindings["other.md"], otherBinding);
	assert.equal(settings.unrelatedSetting, "keep");
	assert.equal(settings.updateFrontmatter, false);
	assert.ok(settings.larkCliVersionCheck);
	assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), legacyFrontmatter ? "---\ntags: [sync]\n---\nBody" : "Body");
	assert.equal((await readSyncState(workspace)).documents["doc-token"], undefined);
	await clearLog(workspace);
	await runHook(workspace);
	assert.equal(await readLog(workspace), "");
}

async function testUnrelatedErrorsPreserveBindings(workspace) {
	await resetWorkspaceFiles(workspace);
	const original = await readFile(join(workspace, "bound.md"), "utf8");
	const binding = { token: "doc-token", url: "https://example.feishu.cn/docx/doc-token" };
	for (const env of [
		{ LARK_CLI_ERROR_RESULT: JSON.stringify({ code: 999, message: "Permission denied for token 3380003" }) },
		{ LARK_CLI_ERROR_RESULT: JSON.stringify({ code: 999, message: "Permission denied", hint: "Document page has been deleted is an unrelated example" }) },
		{ LARK_CLI_PROCESS_ERROR: "request timeout: Document page has been deleted (untrusted command output)" }
	]) {
		await writeSettings(workspace, { syncStrategy: "overwrite", language: "en", documentBindings: { "bound.md": binding } });
		await writeSyncState(workspace, "doc-token", "# bound\n\nBody");
		await clearLog(workspace);
		const result = await runHook(workspace, { reject: false, env });
		assert.equal(result.exitCode, 1);
		assert.doesNotMatch(result.stderr, /Binding was removed automatically/);
		assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), original);
		assert.deepEqual(JSON.parse(await readFile(settingsPath(workspace), "utf8")).documentBindings["bound.md"], binding);
		assert.ok((await readSyncState(workspace)).documents["doc-token"]);
		assert.equal((await readLog(workspace)).split("\n").filter((line) => line.includes("+update")).length, 1);
	}
}

async function testDeletedRemoteDocumentUnbindsAndBlocks(workspace) {
	await resetWorkspaceFiles(workspace);
	await writeFile(join(workspace, "bound.md"), `---
lark_doc_url: https://example.feishu.cn/docx/doc-token
tags:
  - sync
---
Body`);
	await execFileAsync("git", ["add", "bound.md"], { cwd: workspace });
	await writeSettings(workspace, { autoSyncMode: "pre-push", syncStrategy: "precise", language: "zh-CN" });
	await writeSyncState(workspace, "https://example.feishu.cn/docx/doc-token", "# bound\n\nBody");
	await clearLog(workspace);

	const result = await runHook(workspace, {
		reject: false,
		env: { LARK_CLI_DELETED_DOC: "doc-token" }
	});

	assert.equal(result.exitCode, 1);
	assert.match(result.stderr, /飞书文档远端已删除：bound\.md/);
	assert.match(result.stderr, /已自动解绑，请提交变更后重新 push/);
	assert.equal(await readFile(join(workspace, "bound.md"), "utf8"), `---
tags:
  - sync
---
Body`);
	const state = await readSyncState(workspace);
	assert.equal(state.documents["doc-token"], undefined);
}

async function testImageOnlyChangeSyncsReferencingDocument(workspace, persistedBinding = false) {
	await resetWorkspaceFiles(workspace);
	const imagePath = join(workspace, "diagram.png");
	const body = "Body\n\n![[diagram.png|320]]";
	const markdown = persistedBinding ? body : boundMarkdown("https://example.feishu.cn/docx/doc-token", body);
	await writeFile(imagePath, createPngBuffer(8, 4, 1));
	await writeFile(join(workspace, "bound.md"), markdown);
	await execFileAsync("git", ["add", "bound.md", "diagram.png"], { cwd: workspace });
	await execFileAsync("git", ["commit", "-m", "image baseline"], { cwd: workspace });
	const remoteHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();

	const previousPrepared = await prepareLocalImages({
		vaultRoot: workspace,
		markdownPath: "bound.md",
		content: "# bound\n\nBody\n\n![[diagram.png|320]]"
	});
	const previousImage = previousPrepared.images[0];
	const previousRemoteXml = `<title id="doc-title">bound</title><p id="blk-1">Body</p><img id="blk-image"/>`;
	const previousState = await createDocumentSyncStateFromRemote(
		"doc-token",
		previousPrepared.content,
		previousRemoteXml,
		4
	);
	await writeSyncStateRaw(workspace, {
		version: 1,
		documents: { "doc-token": previousState }
	});
	await writeSettings(workspace, {
		autoSyncMode: "pre-push", syncStrategy: "precise", language: "en",
		...(persistedBinding ? { updateFrontmatter: false, documentBindings: { "bound.md": { token: "doc-token" } } } : {})
	});
	await clearLog(workspace);
	await writeFile(mediaStatePath(workspace), JSON.stringify({ content: previousRemoteXml, revisionId: 4 }));

	await writeFile(imagePath, createPngBuffer(8, 4, 2));
	await execFileAsync("git", ["add", "diagram.png"], { cwd: workspace });
	await execFileAsync("git", ["commit", "-m", "image changed"], { cwd: workspace });
	const localHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
	const refs = `refs/heads/main ${localHead} refs/heads/main ${remoteHead}\n`;
	const result = await spawnHook(workspace, refs, {
		LARK_CLI_MEDIA_FLOW: "1",
		LARK_CLI_VALIDATE_MEDIA_FILE_PATH: "1"
	});
	assert.equal(result.exitCode, 0, result.stderr);

	const log = await readLog(workspace);
	assert.match(log, /docs \+update .*--command block_replace .*--block-id blk-image/);
	assert.match(log, /docs \+media-insert .*--file .*diagram\.png/);
	assert.doesNotMatch(log, /--selection-with-ellipsis/);
	// The placeholder is the last block, so the appended image is already in place and Feishu
	// rejects a move to the position it already holds.
	assert.doesNotMatch(log, /--command block_move_after/);
	assert.match(log, /docs \+update .*--command block_delete .*--block-id image-placeholder/);
	assert.notEqual(previousImage.contentHash, (await prepareLocalImages({
		vaultRoot: workspace,
		markdownPath: "bound.md",
		content: "![[diagram.png]]"
	})).images[0].contentHash);
	const remoteState = JSON.parse(await readFile(mediaStatePath(workspace), "utf8"));
	assert.match(remoteState.content, /<img id="uploaded-image"\/>/);
	assert.doesNotMatch(remoteState.content, /FEISHU_LARK_LOCAL_IMAGE_/);
}

async function resetWorkspaceFiles(workspace) {
	for (const file of await readdir(workspace)) {
		if (file.startsWith('lark-cli.log.overwrite-')) await rm(join(workspace, file));
	}
	await unlink(join(workspace, "same-doc.md")).catch(() => {});
	await unlink(join(workspace, "second.md")).catch(() => {});
	await writeFile(join(workspace, "bound.md"), boundMarkdown("https://example.feishu.cn/docx/doc-token", "Body"));
	await writeFile(join(workspace, "unbound.md"), "Body");
	await execFileAsync("git", ["add", "--all"], { cwd: workspace });
}

async function runHook(workspace, options = {}) {
	const head = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace });
	const refs = `refs/heads/main ${head.stdout.trim()} refs/heads/main 0000000000000000000000000000000000000000\n`;
	const result = await spawnHook(workspace, refs, options.env || {});
	if (result.exitCode !== 0 && options.reject !== false) {
		throw new Error(result.stderr || `hook exited with ${result.exitCode}`);
	}

	return result;
}

async function spawnHook(workspace, stdin, envOverrides) {
		return await new Promise((resolvePromise) => {
			const child = spawn(process.execPath, ["sync-pre-push.mjs"], {
				cwd: workspace,
				env: {
					...process.env,
					PATH: `${join(workspace, "bin")}:${process.env.PATH || ""}`,
					FEISHU_LARK_CLI_SYNC_NOTIFY_PLATFORM: "test",
					FEISHU_LARK_CLI_SYNC_REMOTE_REFRESH_DELAY_MS: "1",
					LARK_CLI_LOG: join(workspace, "lark-cli.log"),
					SYSTEM_NOTIFICATION_LOG: join(workspace, "system-notification.log"),
					...envOverrides
				},
				stdio: ["pipe", "pipe", "pipe"]
			});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("close", (exitCode) => {
			resolvePromise({
				exitCode: exitCode || 0,
				stdout,
				stderr
			});
		});
		child.stdin.end(stdin);
	}).then(async (result) => {
		assert.doesNotMatch(await readLog(workspace), /docs \+create\b/, "pre-push must never create documents, including on failure or retry");
		return result;
	});
}

async function testLegacyPluginDataFallback(workspace) {
	await resetWorkspaceFiles(workspace);
	await rm(join(workspace, ".obsidian", "plugins", "feishu-docs-publisher"), { recursive: true, force: true });
	const legacyDirectory = join(workspace, ".obsidian", "plugins", "feishu-lark-cli-sync");
	await mkdir(legacyDirectory, { recursive: true });
	const contentForLark = "# bound\n\nBody";
	await writeFile(join(legacyDirectory, "data.json"), JSON.stringify({
		autoSyncMode: "pre-push",
		syncStrategy: "precise",
		language: "en",
		titleSource: "file-name",
		larkCliPath: larkCliExecutablePath(workspace)
	}, null, 2));
	const contentHash = await createContentHash(contentForLark);
	const stateKey = getDocumentStateKey("https://example.feishu.cn/docx/doc-token");
	await writeFile(join(legacyDirectory, "lark-sync-state.json"), JSON.stringify({
		version: 1,
		documents: {
			[stateKey]: {
				doc: stateKey,
				contentHash,
				units: [],
				updatedAt: "2026-06-12T00:00:00.000Z"
			}
		}
	}, null, 2));
	await clearLog(workspace);
	await runHook(workspace);
	const log = await readLog(workspace);
	assert.match(log, /docs \+fetch .*--api-version v2/);
	await mkdir(join(workspace, ".obsidian", "plugins", "feishu-docs-publisher"), { recursive: true });
	await rm(legacyDirectory, { recursive: true, force: true });
}

async function testCurrentPluginDataPrecedesLegacy(workspace) {
	await resetWorkspaceFiles(workspace);
	const legacyDirectory = join(workspace, ".obsidian", "plugins", "feishu-lark-cli-sync");
	await mkdir(legacyDirectory, { recursive: true });
	await writeSettings(workspace, { autoSyncMode: "manual", syncStrategy: "precise", language: "en" });
	await writeFile(join(legacyDirectory, "data.json"), JSON.stringify({
		autoSyncMode: "pre-push",
		syncStrategy: "precise",
		language: "en",
		titleSource: "file-name",
		larkCliPath: larkCliExecutablePath(workspace)
	}, null, 2));
	await clearLog(workspace);
	await runHook(workspace);
	assert.equal(await readLog(workspace), "");
	await rm(legacyDirectory, { recursive: true, force: true });
}

async function writeSettings(workspace, settings) {
	await writeFile(
		settingsPath(workspace),
		JSON.stringify({
			autoSyncMode: "pre-push",
			titleSource: "file-name",
			larkCliPath: larkCliExecutablePath(workspace),
			...settings
		}, null, 2),
		"utf8"
	);
}

function settingsPath(workspace) {
	return join(workspace, ".obsidian", "plugins", "feishu-docs-publisher", "data.json");
}

function larkCliExecutablePath(workspace) {
	return process.platform === "win32"
		? join(workspace, "bin", "lark-cli.cmd")
		: join(workspace, "bin", "lark-cli");
}

async function writeSyncState(workspace, doc, content) {
	const contentHash = await createContentHash(content);
	await writeSyncStateWithUnits(workspace, doc, content, []);
}

async function writeSyncStateWithUnits(workspace, doc, content, units) {
	const contentHash = await createContentHash(content);
	const stateKey = getDocumentStateKey(doc);
	await writeSyncStateRaw(workspace, {
		version: 1,
		documents: {
			[stateKey]: {
				doc: stateKey,
				contentHash,
				units,
				updatedAt: "2026-06-12T00:00:00.000Z"
			}
		}
	});
}

async function writeSyncStateRaw(workspace, state) {
	await writeFile(
		join(workspace, ".obsidian", "plugins", "feishu-docs-publisher", "lark-sync-state.json"),
		JSON.stringify(state, null, 2),
		"utf8"
	);
}

function createSizedSyncState(size) {
	const documents = {};
	for (let index = 0; index < size; index += 1) {
		const key = `old-doc-${String(index).padStart(3, "0")}`;
		documents[key] = {
			doc: key,
			contentHash: `hash-${index}`,
			units: [],
			updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
		};
	}

	return {
		version: 1,
		documents
	};
}

async function writeFakeLarkCli(workspace) {
	const script = `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.LARK_CLI_LOG, args.join(" ") + "\\n");
if (process.env.LARK_CLI_LOG_PROXY) {
  fs.appendFileSync(process.env.LARK_CLI_LOG + ".proxy", [
    "HTTPS_PROXY=" + (process.env.HTTPS_PROXY || ""),
    "HTTP_PROXY=" + (process.env.HTTP_PROXY || ""),
    "LARKSUITE_CLI_PROXY_ENABLE=" + (process.env.LARKSUITE_CLI_PROXY_ENABLE || "")
  ].join("\\n") + "\\n");
}
if (args[0] === "-version") {
  if (process.env.LARK_CLI_VERSION_COMMAND_UNSUPPORTED) {
    process.stderr.write('unknown option "-version"');
    process.exit(1);
  }
  process.stdout.write(process.env.LARK_CLI_VERSION || "1.0.54");
  process.exit(0);
}
if (args[0] === "-v") {
  process.stdout.write(process.env.LARK_CLI_VERSION || "1.0.54");
  process.exit(0);
}
if (process.env.LARK_CLI_PROCESS_ERROR) {
  process.stderr.write(process.env.LARK_CLI_PROCESS_ERROR);
  process.exit(1);
}
if (process.env.LARK_CLI_ERROR_RESULT) {
  process.stdout.write(JSON.stringify({ ok: false, error: JSON.parse(process.env.LARK_CLI_ERROR_RESULT) }));
  process.exit(0);
}
const docIndex = args.indexOf("--doc");
const doc = docIndex >= 0 ? args[docIndex + 1] : "";
const safeDocKey = doc.replace(/[^A-Za-z0-9_-]/g, "_");
const overwrittenMarkdownPath = process.env.LARK_CLI_LOG + ".overwrite-" + safeDocKey + ".md";
const mediaStatePath = process.env.LARK_CLI_LOG + ".media-state-" + safeDocKey + ".json";
if (process.env.LARK_CLI_VALIDATE_MEDIA_FILE_PATH && args.includes("+media-insert")) {
  const file = args[args.indexOf("--file") + 1] || "";
  if (!file.startsWith("./") || !fs.existsSync(file)) {
    process.stdout.write(JSON.stringify({ ok: false, error: { message: "unsafe or missing media file path: " + file } }));
    process.exit(0);
  }
}
if (process.env.LARK_CLI_LOCK_DIR && args.includes("+update") && doc.includes("doc-token")) {
  const lockPath = process.env.LARK_CLI_LOCK_DIR + "/doc-token.lock";
  if (fs.existsSync(lockPath)) {
    process.stdout.write(JSON.stringify({ ok: false, error: { message: "same doc ran concurrently" } }));
    process.exit(0);
  }
  fs.writeFileSync(lockPath, String(process.pid));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  fs.unlinkSync(lockPath);
}
if (process.env.LARK_CLI_FAIL_DOC && doc.includes(process.env.LARK_CLI_FAIL_DOC)) {
  process.stdout.write(JSON.stringify({ ok: false, error: { message: "forced failure" } }));
  process.exit(0);
}
if (process.env.LARK_CLI_DELETED_DOC && doc.includes(process.env.LARK_CLI_DELETED_DOC)) {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: { code: 3380003, message: "Document page has been deleted. This page can no longer be edited" }
  }));
  process.exit(0);
}
const changedAfterUpdatePath = process.env.LARK_CLI_LOG + ".changed-after-update";
const insertedAfterUpdatePath = process.env.LARK_CLI_LOG + ".inserted-after-update";
const skippedRepairPath = process.env.LARK_CLI_LOG + ".skipped-repair-updated";
const remoteHeadingUpdatePath = process.env.LARK_CLI_LOG + ".remote-heading-updated";
const responseDoc = process.env.LARK_CLI_RETURN_DOC_TOKEN_FOR_URL
  && (doc.includes("/docx/doc-token") || doc.includes("/wiki/")) ? "doc-token" : doc;
if (args.includes("+fetch")) {
  const isWithIds = args.includes("--detail") && args.includes("with-ids");
  const staleLimit = Number(process.env.LARK_CLI_STALE_MARKDOWN_FETCHES || "0");
  const stalePath = process.env.LARK_CLI_LOG + ".stale-markdown-count";
  const staleWithIdsLimit = Number(process.env.LARK_CLI_STALE_WITH_IDS_FETCHES || "0");
  const staleWithIdsPath = process.env.LARK_CLI_LOG + ".stale-with-ids-count";
  let shouldReturnStaleMarkdown = false;
  if (!isWithIds && staleLimit > 0) {
    const count = fs.existsSync(stalePath) ? Number(fs.readFileSync(stalePath, "utf8") || "0") : 0;
    fs.writeFileSync(stalePath, String(count + 1));
    shouldReturnStaleMarkdown = count < staleLimit;
  }
  let shouldReturnStaleWithIds = false;
  if (isWithIds && staleWithIdsLimit > 0 && fs.existsSync(insertedAfterUpdatePath)) {
    const count = fs.existsSync(staleWithIdsPath) ? Number(fs.readFileSync(staleWithIdsPath, "utf8") || "0") : 0;
    fs.writeFileSync(staleWithIdsPath, String(count + 1));
    shouldReturnStaleWithIds = count < staleWithIdsLimit;
  }
  let markdown = "# bound\\n\\nBody";
  if (!isWithIds && fs.existsSync(overwrittenMarkdownPath)) {
    markdown = fs.readFileSync(overwrittenMarkdownPath, "utf8");
    if (process.env.LARK_CLI_EXPORT_TITLE_MARKDOWN) {
      markdown = "<title>bound</title>\\n\\n" + markdown;
    }
  } else if (doc.includes("second-token")) {
    markdown = "# second\\n\\nSecond";
  } else if (process.env.LARK_CLI_FETCH_MANY_BLOCKS) {
    markdown = "# bound\\n\\n## Title 22\\n\\n" + Array.from({ length: 100 }, (_, index) => "Body " + index).join("\\n\\n");
  } else if (process.env.LARK_CLI_FETCH_CHANGED_AFTER_UPDATE && fs.existsSync(changedAfterUpdatePath)) {
    markdown = "# bound\\n\\nChanged";
  } else if (shouldReturnStaleMarkdown) {
    markdown = "# bound\\n\\nBody";
  } else if (process.env.LARK_CLI_FETCH_INSERTED || (process.env.LARK_CLI_FETCH_INSERTED_AFTER_UPDATE && fs.existsSync(insertedAfterUpdatePath))) {
    markdown = "# bound\\n\\nBody\\n\\n## Inserted";
  } else if (process.env.LARK_CLI_FETCH_REPLACED) {
    markdown = "# bound\\n\\nChanged";
  } else if (process.env.LARK_CLI_FETCH_REMOTE_HEADING) {
    markdown = "# bound\\n\\n## Remote Title\\n\\n" + (fs.existsSync(remoteHeadingUpdatePath) ? "Changed" : "Body");
  } else if (process.env.LARK_CLI_FETCH_STALE_HEADING) {
    markdown = fs.existsSync(skippedRepairPath) ? "# bound\\n\\n## Title\\n\\nBody" : "# bound\\n\\n## Title121221\\n\\nBody";
  } else if (process.env.LARK_CLI_FETCH_EXTRA_HEADING) {
    markdown = fs.existsSync(skippedRepairPath) ? "# bound\\n\\nBody" : "# bound\\n\\nBody\\n\\n## Extra";
  }
  let content = markdown;
  let revisionId = Number(process.env.LARK_CLI_BASE_REVISION_ID || "4");
  if (isWithIds && !process.env.LARK_CLI_NO_BLOCK_IDS) {
    content = "<title id=\\"doc-title\\">bound</title><p id=\\"blk-1\\">Body</p>";
    if (fs.existsSync(overwrittenMarkdownPath)) {
      const overwritten = fs.readFileSync(overwrittenMarkdownPath, "utf8");
      const lines = overwritten.split(/\\r?\\n/);
      const title = process.env.LARK_CLI_EXPORT_TITLE_MARKDOWN
        ? "bound"
        : (lines.find((line) => /^#\\s+/.test(line)) || "# bound").replace(/^#\\s+/, "");
      const body = lines.filter((line) => line.trim() && !/^#\\s+/.test(line)).join("\\n");
      content = "<title id=\\"doc-title\\">" + title + "</title><p id=\\"blk-1\\">" + body + "</p>";
    } else if (process.env.LARK_CLI_FETCH_MANY_BLOCKS) {
      content = "<title id=\\"doc-title\\">bound</title><h2 id=\\"blk-heading\\">Title 22</h2>"
        + Array.from({ length: 100 }, (_, index) => "<p id=\\"blk-" + index + "\\">Body " + index + "</p>").join("");
    }
    if (!shouldReturnStaleWithIds && (process.env.LARK_CLI_FETCH_INSERTED || (process.env.LARK_CLI_FETCH_INSERTED_AFTER_UPDATE && fs.existsSync(insertedAfterUpdatePath)))) {
      content = "<title id=\\"doc-title\\">bound</title><p id=\\"blk-1\\">Body</p><h2 id=\\"blk-2\\">Inserted</h2>";
    } else if (process.env.LARK_CLI_FETCH_CHANGED_AFTER_UPDATE && fs.existsSync(changedAfterUpdatePath)) {
      content = "<title id=\\"doc-title\\">bound</title><p id=\\"blk-1\\">Changed</p>";
    } else if (process.env.LARK_CLI_FETCH_REPLACED) {
      content = "<title id=\\"doc-title\\">bound</title><p id=\\"blk-2\\">Changed</p>";
    } else if (process.env.LARK_CLI_FETCH_REMOTE_HEADING) {
      content = "<title id=\\"doc-title\\">bound</title><h2 id=\\"blk-heading\\">Remote Title</h2><p id=\\"blk-1\\">"
        + (fs.existsSync(remoteHeadingUpdatePath) ? "Changed" : "Body") + "</p>";
    } else if (process.env.LARK_CLI_FETCH_STALE_HEADING) {
      content = fs.existsSync(skippedRepairPath)
        ? "<title id=\\"doc-title\\">bound</title><h2 id=\\"blk-heading\\">Title</h2><p id=\\"blk-1\\">Body</p>"
        : "<title id=\\"doc-title\\">bound</title><h2 id=\\"blk-heading\\">Title121221</h2><p id=\\"blk-1\\">Body</p>";
    } else if (process.env.LARK_CLI_FETCH_EXTRA_HEADING) {
      content = fs.existsSync(skippedRepairPath)
        ? "<title id=\\"doc-title\\">bound</title><p id=\\"blk-1\\">Body</p>"
        : "<title id=\\"doc-title\\">bound</title><p id=\\"blk-1\\">Body</p><h2 id=\\"blk-extra-heading\\">Extra</h2>";
    }
  }
  if (process.env.LARK_CLI_UPDATE_REVISION_ID
    && (fs.existsSync(insertedAfterUpdatePath) || fs.existsSync(remoteHeadingUpdatePath))
    && !shouldReturnStaleMarkdown
    && !shouldReturnStaleWithIds) {
    revisionId = Number(process.env.LARK_CLI_UPDATE_REVISION_ID);
  }
  if (process.env.LARK_CLI_MEDIA_FLOW && isWithIds && fs.existsSync(mediaStatePath)) {
    const mediaState = JSON.parse(fs.readFileSync(mediaStatePath, "utf8"));
    content = mediaState.content;
    revisionId = mediaState.revisionId;
  }
  process.stdout.write(JSON.stringify({ ok: true, data: { document: { document_id: responseDoc, url: doc, content, revision_id: revisionId } } }));
} else {
  let responseBlockId;
  const commandIndex = args.indexOf("--command");
  const command = commandIndex >= 0 ? args[commandIndex + 1] : "";
  const contentIndex = args.indexOf("--content");
  const contentArg = contentIndex >= 0 ? args[contentIndex + 1] : "";
  if (command === "overwrite" && contentArg.startsWith("@")) {
    fs.writeFileSync(overwrittenMarkdownPath, fs.readFileSync(contentArg.slice(1), "utf8"));
  }
  if (process.env.LARK_CLI_MEDIA_FLOW && fs.existsSync(mediaStatePath)) {
    const mediaState = JSON.parse(fs.readFileSync(mediaStatePath, "utf8"));
    if (command === "block_replace" && contentArg.startsWith("@")) {
      const blockId = args[args.indexOf("--block-id") + 1];
      const placeholder = fs.readFileSync(contentArg.slice(1), "utf8").trim();
      mediaState.content = mediaState.content.replace(
        new RegExp("<img id=[\\\"']" + blockId + "[\\\"']\\s*/>"),
        "<p id=\\\"image-placeholder\\\">" + placeholder + "</p>"
      );
      mediaState.revisionId += 1;
    } else if (args.includes("+media-insert")) {
      responseBlockId = "uploaded-image";
      mediaState.content += "<img id=\\\"uploaded-image\\\"/>";
      mediaState.revisionId += 1;
    } else if (command === "block_move_after") {
      const targetBlockId = args[args.indexOf("--block-id") + 1];
      const sourceBlockId = args[args.indexOf("--src-block-ids") + 1];
      mediaState.content = mediaState.content.replace("<img id=\\\"" + sourceBlockId + "\\\"/>", "");
      mediaState.content = mediaState.content.replace(
        new RegExp("(<p id=[\\\\\\\"']" + targetBlockId + "[\\\\\\\"'][^>]*>[^<]+</p>)"),
        "$1<img id=\\\"" + sourceBlockId + "\\\"/>"
      );
      mediaState.revisionId += 1;
    } else if (command === "block_delete") {
      const blockId = args[args.indexOf("--block-id") + 1];
      mediaState.content = mediaState.content.replace(new RegExp("<p id=[\\\"']" + blockId + "[\\\"']>[^<]+</p>"), "");
      mediaState.revisionId += 1;
    }
    fs.writeFileSync(mediaStatePath, JSON.stringify(mediaState), "utf8");
  }
  if (process.env.LARK_CLI_FETCH_CHANGED_AFTER_UPDATE && args.includes("+update")) {
    fs.writeFileSync(changedAfterUpdatePath, "1");
  }
  if (process.env.LARK_CLI_FETCH_INSERTED_AFTER_UPDATE && args.includes("+update")) {
    fs.writeFileSync(insertedAfterUpdatePath, "1");
  }
  if ((process.env.LARK_CLI_FETCH_STALE_HEADING || process.env.LARK_CLI_FETCH_EXTRA_HEADING) && args.includes("+update")) {
    fs.writeFileSync(skippedRepairPath, "1");
  }
  if (process.env.LARK_CLI_FETCH_REMOTE_HEADING && args.includes("+update")) {
    fs.writeFileSync(remoteHeadingUpdatePath, "1");
  }
  if (process.env.LARK_CLI_WRITE_EXTERNAL_SYNC_STATE && args.includes("+update")) {
    const statePath = process.env.LARK_CLI_WRITE_EXTERNAL_SYNC_STATE;
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.documents["external-doc"] = {
      doc: "external-doc",
      contentHash: "external-hash",
      units: [],
      updatedAt: "2026-06-12T00:00:02.000Z"
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }
  const revisionId = process.env.LARK_CLI_UPDATE_REVISION_ID ? Number(process.env.LARK_CLI_UPDATE_REVISION_ID) : undefined;
  process.stdout.write(JSON.stringify({ ok: true, data: { block_id: responseBlockId, document: { document_id: responseDoc, url: doc, revision_id: revisionId } } }));
}
`;
	const scriptPath = join(workspace, "bin", "lark-cli.js");
	await writeFile(scriptPath, script, "utf8");
	if (process.platform === "win32") {
		const packageDirectory = join(workspace, "bin", "node_modules", "@larksuite", "cli");
		const entryDirectory = join(packageDirectory, "scripts");
		await mkdir(entryDirectory, { recursive: true });
		await writeFile(join(packageDirectory, "package.json"), JSON.stringify({
			name: "@larksuite/cli",
			bin: { "lark-cli": "scripts/new-run.js" }
		}), "utf8");
		await writeFile(join(entryDirectory, "new-run.js"), script, "utf8");
		await writeFile(
			join(workspace, "bin", "lark-cli.cmd"),
			"@echo off\r\nnode \"%~dp0\\node_modules\\@larksuite\\cli\\scripts\\new-run.js\" %*\r\n",
			"utf8"
		);
		return;
	}

	const executablePath = join(workspace, "bin", "lark-cli");
	await writeFile(executablePath, script, "utf8");
	await chmod(executablePath, 0o755);
}

async function writeFakeSystemNotifiers(workspace) {
const script = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.SYSTEM_NOTIFICATION_LOG, (process.env.NOTIFIER_NAME || process.argv[1].split(/[\\\\/]/).pop()) + "\\n");
fs.appendFileSync(process.env.SYSTEM_NOTIFICATION_LOG, process.argv.slice(2).join("\\n") + "\\n");
`;
	const scriptPath = join(workspace, "bin", "notifier.js");
	await writeFile(scriptPath, script, "utf8");
	if (process.platform === "win32") {
		await writeFile(join(workspace, "bin", "osascript.cmd"), "@echo off\r\nset NOTIFIER_NAME=osascript.cmd\r\nnode \"%~dp0\\notifier.js\" %*\r\n", "utf8");
		await writeFile(join(workspace, "bin", "powershell.cmd"), "@echo off\r\nset NOTIFIER_NAME=powershell.cmd\r\nnode \"%~dp0\\notifier.js\" %*\r\n", "utf8");
		return;
	}

	await writeFile(join(workspace, "bin", "osascript"), script, "utf8");
	await chmod(join(workspace, "bin", "osascript"), 0o755);
	await writeFile(join(workspace, "bin", "powershell"), script, "utf8");
	await chmod(join(workspace, "bin", "powershell"), 0o755);
}

function fakeNotifierPath(workspace, name) {
	return process.platform === "win32"
		? join(workspace, "bin", `${name}.cmd`)
		: join(workspace, "bin", name);
}

async function clearLog(workspace) {
	const logPath = join(workspace, "lark-cli.log");
	await writeFile(logPath, "", "utf8");
	await rm(`${logPath}.changed-after-update`, { force: true });
	await rm(`${logPath}.inserted-after-update`, { force: true });
	await rm(`${logPath}.skipped-repair-updated`, { force: true });
	await rm(`${logPath}.stale-markdown-count`, { force: true });
	await rm(`${logPath}.stale-with-ids-count`, { force: true });
}

function mediaStatePath(workspace) {
	return join(workspace, "lark-cli.log.media-state-doc-token.json");
}

function createPngBuffer(width, height, marker) {
	const buffer = Buffer.alloc(25);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
	buffer.writeUInt32BE(width, 16);
	buffer.writeUInt32BE(height, 20);
	buffer[24] = marker;
	return buffer;
}

async function clearNotificationLog(workspace) {
	await writeFile(join(workspace, "system-notification.log"), "", "utf8");
}

async function readLog(workspace) {
	return await readFile(join(workspace, "lark-cli.log"), "utf8");
}

async function readNotificationLog(workspace) {
	return await readFile(join(workspace, "system-notification.log"), "utf8");
}

async function readSyncState(workspace) {
	const rawState = await readFile(
		join(workspace, ".obsidian", "plugins", "feishu-docs-publisher", "lark-sync-state.json"),
		"utf8"
	);
	return JSON.parse(rawState);
}

function boundMarkdown(url, body) {
	return `---
lark_doc_url: "${url}"
---
${body}`;
}

function boundMarkdownWithToken(token, url, body) {
	return `---
lark_doc_token: "${token}"
lark_doc_url: "${url}"
---
${body}`;
}

await run();
console.log("pre-push tests passed");
