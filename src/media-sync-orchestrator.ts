import { LocalImageResource } from "./local-image";
import { basename } from "path";
import type { MediaUploadJournal } from "./media-upload-journal";

export interface RemoteMediaSnapshot {
	content: string;
	revisionId?: number;
}

export interface InsertedMedia {
	blockId: string;
}

export interface MediaSyncHost {
	uploadJournal?: MediaUploadJournal;
	fetchRemoteWithIds(): Promise<RemoteMediaSnapshot>;
	insertImage(image: LocalImageResource): Promise<InsertedMedia>;
	moveBlockAfter(blockId: string, targetBlockId: string): Promise<void>;
	deleteBlock(blockId: string, revisionId?: number): Promise<void>;
	removePlaceholder(placeholder: string, revisionId?: number): Promise<void>;
}

const MAX_STRAY_PLACEHOLDERS = 5;

type PlaceholderLocation =
	| { mode: "standalone"; blockId: string; startIndex: number; endIndex: number }
	| { mode: "embedded-checkbox"; blockId: string; startIndex: number; endIndex: number };

export async function materializeLocalImages(
	images: LocalImageResource[],
	host: MediaSyncHost
): Promise<RemoteMediaSnapshot | undefined> {
	if (images.length === 0) {
		return undefined;
	}

	let snapshot = await host.fetchRemoteWithIds();
	for (const image of images) {
		const location = findPlaceholderLocation(snapshot.content, image.placeholder);
		if (!location) {
			await host.uploadJournal?.clear(image);
			continue;
		}

		// Only a recorded block id proves which upload belongs to this placeholder.
		// Names alone cannot distinguish different images or repeated embeds.
		let blockId = await host.uploadJournal?.load(image);
		if (!blockId || !hasImageBlock(snapshot.content, blockId)) {
			// selection-with-ellipsis 会让飞书重建整篇文档的 block。先追加再移动，只影响新增图片和锚点。
			const insertedMedia = await host.insertImage(image);
			blockId = insertedMedia.blockId;
			// Save before moving: either operation can be interrupted independently.
			await host.uploadJournal?.save(image, blockId);
			snapshot = await host.fetchRemoteWithIds();
		}
		let placedLocation = findPlaceholderLocation(snapshot.content, image.placeholder);
		if (!placedLocation) throw new Error(`图片上传后占位块不存在：${image.vaultPath}`);
		// Avoid Feishu's no-op move error, including after a recovered upload.
		if (!hasImageAfter(snapshot.content, placedLocation, blockId)) {
			await host.moveBlockAfter(blockId, placedLocation.blockId);
			snapshot = await host.fetchRemoteWithIds();
			placedLocation = findPlaceholderLocation(snapshot.content, image.placeholder);
		}
		if (!placedLocation || !hasImageAfter(snapshot.content, placedLocation, blockId)) {
			throw new Error(`图片上传后未出现在预期位置：${image.vaultPath}`);
		}

		await removePlaceholder(host, placedLocation, image.placeholder, snapshot.revisionId);
		snapshot = await host.fetchRemoteWithIds();

		// An interrupted earlier sync can leave copies of the same placeholder behind. The image
		// is already in place, so drop every remaining copy instead of failing on each retry.
		for (let strays = 0; snapshot.content.includes(image.placeholder); strays += 1) {
			const stray = findPlaceholderLocation(snapshot.content, image.placeholder);
			if (!stray || strays >= MAX_STRAY_PLACEHOLDERS) {
				throw new Error(`图片占位块删除后仍然存在：${image.vaultPath}`);
			}
			await removePlaceholder(host, stray, image.placeholder, snapshot.revisionId);
			snapshot = await host.fetchRemoteWithIds();
		}
		await host.uploadJournal?.clear(image);
	}
	return snapshot;
}

async function removePlaceholder(
	host: MediaSyncHost,
	location: PlaceholderLocation,
	placeholder: string,
	revisionId?: number
): Promise<void> {
	if (location.mode === "standalone") {
		await host.deleteBlock(location.blockId, revisionId);
	} else {
		await host.removePlaceholder(placeholder, revisionId);
	}
}

export function buildMediaInsertArgs(
	doc: string,
	image: LocalImageResource
): string[] {
	const args = [
		"docs",
		"+media-insert",
		"--as",
		"user",
		"--doc",
		doc,
		"--file",
		`./${basename(image.absolutePath)}`,
		"--type",
		"image"
	];
	if (image.displayWidth) {
		args.push("--width", String(image.displayWidth));
	}
	if (image.displayHeight) {
		args.push("--height", String(image.displayHeight));
	}
	if (image.alt) {
		args.push("--caption", image.alt);
	}
	args.push("--json");
	return args;
}

export function buildMediaMoveArgs(doc: string, blockId: string, targetBlockId: string): string[] {
	return [
		"docs", "+update", "--api-version", "v2", "--as", "user", "--doc", doc,
		"--command", "block_move_after", "--block-id", targetBlockId,
		"--src-block-ids", blockId, "--json"
	];
}

export function buildPlaceholderRemoveArgs(
	doc: string,
	placeholder: string,
	revisionId?: number
): string[] {
	const args = [
		"docs", "+update", "--api-version", "v2", "--as", "user", "--doc", doc,
		"--command", "str_replace", "--pattern", placeholder, "--content", ""
	];
	if (revisionId !== undefined) {
		args.push("--revision-id", String(revisionId));
	}
	args.push("--json");
	return args;
}

function findPlaceholderLocation(remoteXml: string, placeholder: string): PlaceholderLocation | null {
	return findPlaceholderBlock(remoteXml, placeholder) || findEmbeddedCheckbox(remoteXml, placeholder);
}

function findPlaceholderBlock(
	remoteXml: string,
	placeholder: string
): Extract<PlaceholderLocation, { mode: "standalone" }> | null {
	const escapedPlaceholder = escapeRegExp(placeholder);
	const pattern = new RegExp(`<p\\b([^>]*)>\\s*${escapedPlaceholder}\\s*</p>`, "i");
	const match = pattern.exec(remoteXml);
	if (!match || match.index === undefined) {
		return null;
	}
	const blockId = readBlockId(match[1] || "");
	return blockId ? {
		mode: "standalone",
		blockId,
		startIndex: match.index,
		endIndex: match.index + match[0].length
	} : null;
}

function findEmbeddedCheckbox(
	remoteXml: string,
	placeholder: string
): Extract<PlaceholderLocation, { mode: "embedded-checkbox" }> | null {
	const escapedPlaceholder = escapeRegExp(placeholder);
	const checkboxContent = `(?:(?!<\\/checkbox>)[\\s\\S])*?${escapedPlaceholder}`
		+ "(?:(?!<\\/checkbox>)[\\s\\S])*?";
	const pattern = new RegExp(`<checkbox\\b([^>]*)>${checkboxContent}<\\/checkbox>`, "i");
	const match = pattern.exec(remoteXml);
	if (!match || match.index === undefined) {
		return null;
	}
	const blockId = readBlockId(match[1] || "");
	if (!blockId) {
		return null;
	}
	return {
		mode: "embedded-checkbox",
		blockId,
		startIndex: match.index,
		endIndex: match.index + match[0].length
	};
}

function hasImageAfter(
	remoteXml: string,
	location: PlaceholderLocation,
	blockId: string
): boolean {
	const adjacentContent = remoteXml.slice(location.endIndex).trimStart();
	const escapedBlockId = escapeRegExp(blockId);
	return new RegExp(`^<img\\b[^>]*\\bid=["']${escapedBlockId}["'][^>]*(?:\\/>|>[\\s\\S]*?<\\/img>)`, "i")
		.test(adjacentContent);
}

function hasImageBlock(remoteXml: string, blockId: string): boolean {
	return [...remoteXml.matchAll(/<img\b([^>]*)>/gi)]
		.some((match) => readBlockId(match[1] || "") === blockId);
}

function readBlockId(attributes: string): string {
	for (const name of ["id", "block-id", "block_id", "blockId", "data-block-id"]) {
		const pattern = new RegExp(`\\s${name}=["']([^"']+)["']`);
		const match = attributes.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}
	return "";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
