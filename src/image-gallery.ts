export const IMAGE_GALLERY_MARKER = "<!-- feishu-docs-publisher:image-gallery -->";

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export interface ImageGalleryNote {
	path: string;
	isGallery: boolean;
}

export interface ImageGalleryPlan {
	notePath: string;
	exists: boolean;
	imagePaths: string[];
}

export function isImageGalleryContent(content: string): boolean {
	return content.includes(IMAGE_GALLERY_MARKER);
}

/** The marker only identifies generated notes locally; it must not reach the remote document. */
export function stripImageGalleryMarker(content: string): string {
	return content.replace(new RegExp(`^[ \\t]*${escapeRegExp(IMAGE_GALLERY_MARKER)}[ \\t]*(?:\\r?\\n)*`, "m"), "");
}

export function buildImageGalleryBody(imagePaths: string[]): string {
	return `${[IMAGE_GALLERY_MARKER, ...imagePaths.map((path) => `![[${path}]]`)].join("\n\n")}\n`;
}

/** Regenerate a gallery note while keeping the frontmatter that stores its Feishu binding. */
export function replaceImageGalleryBody(existingContent: string, imagePaths: string[]): string {
	const frontmatter = existingContent.match(FRONTMATTER_PATTERN)?.[0] ?? "";
	return `${frontmatter}${frontmatter ? "\n" : ""}${buildImageGalleryBody(imagePaths)}`;
}

/**
 * Decide which folders need a generated note so that their images reach the remote.
 * Every folder that directly holds images no hand-written note embeds gets one gallery
 * note; an existing gallery is reused and refreshed, and emptied when nothing is left.
 */
export function planImageGalleries(input: {
	imagePaths: string[];
	notes: ImageGalleryNote[];
	referencedImagePaths: Set<string>;
	noteName: (folderName: string) => string;
}): ImageGalleryPlan[] {
	const imagesByFolder = new Map<string, string[]>();
	for (const imagePath of input.imagePaths) {
		if (input.referencedImagePaths.has(imagePath)) continue;
		const folder = parentFolder(imagePath);
		imagesByFolder.set(folder, [...(imagesByFolder.get(folder) ?? []), imagePath]);
	}

	const notesByFolder = new Map<string, ImageGalleryNote[]>();
	for (const note of input.notes) {
		const folder = parentFolder(note.path);
		notesByFolder.set(folder, [...(notesByFolder.get(folder) ?? []), note]);
	}

	const folders = new Set(imagesByFolder.keys());
	for (const [folder, notes] of notesByFolder) {
		if (notes.some((note) => note.isGallery)) folders.add(folder);
	}

	const plans: ImageGalleryPlan[] = [];
	for (const folder of folders) {
		const imagePaths = [...(imagesByFolder.get(folder) ?? [])].sort(compareImagePaths);
		const notes = notesByFolder.get(folder) ?? [];
		const existing = notes.filter((note) => note.isGallery).map((note) => note.path).sort()[0];
		if (existing === undefined && imagePaths.length === 0) continue;
		plans.push({
			notePath: existing ?? freeNotePath(folder, input.noteName(folder.split("/").pop() ?? ""), notes),
			exists: existing !== undefined,
			imagePaths
		});
	}
	return plans.sort((left, right) => left.notePath.localeCompare(right.notePath));
}

function freeNotePath(folder: string, name: string, notes: ImageGalleryNote[]): string {
	const taken = new Set(notes.map((note) => note.path));
	for (let suffix = 1; ; suffix += 1) {
		const candidate = joinPath(folder, `${name}${suffix > 1 ? ` ${suffix}` : ""}.md`);
		if (!taken.has(candidate)) return candidate;
	}
}

function compareImagePaths(left: string, right: string): number {
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function parentFolder(path: string): string {
	const index = path.lastIndexOf("/");
	return index >= 0 ? path.slice(0, index) : "";
}

function joinPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}` : name;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
