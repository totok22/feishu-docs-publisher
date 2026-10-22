import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { join } from "path";
import type { LocalImageResource } from "./local-image";

export interface MediaUploadJournal {
	load(image: LocalImageResource): Promise<string | undefined>;
	save(image: LocalImageResource, blockId: string): Promise<void>;
	clear(image: LocalImageResource): Promise<void>;
}

/** One durable record per document and image occurrence; shared by the plugin and pre-push. */
export function createMediaUploadJournal(directory: string, doc: string): MediaUploadJournal {
	const recordPath = (image: LocalImageResource): string => join(directory,
		`${createHash("sha256").update(JSON.stringify([doc, image.placeholder])).digest("hex")}.json`);
	return {
		async load(image) {
			let raw: string;
			try {
				raw = await readFile(recordPath(image), "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
				throw error;
			}
			const record = JSON.parse(raw);
			if (record?.doc !== doc || record?.placeholder !== image.placeholder
				|| typeof record?.blockId !== "string" || !record.blockId.trim()) {
				throw new Error(`Invalid image upload record: ${image.vaultPath}`);
			}
			return record.blockId;
		},
		async save(image, blockId) {
			await mkdir(directory, { recursive: true });
			const path = recordPath(image);
			const temporary = `${path}.${randomUUID()}.tmp`;
			try {
				await writeFile(temporary, JSON.stringify({ doc, placeholder: image.placeholder, blockId }), "utf8");
				await rename(temporary, path);
			} finally {
				await rm(temporary, { force: true });
			}
		},
		async clear(image) {
			await rm(recordPath(image), { force: true });
		}
	};
}
