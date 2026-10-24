#!/usr/bin/env node
// Durable fake CLI for exercising the real hook and media orchestration across restarts.
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version" || args[0] === "-v") {
	process.stdout.write("1.0.54");
	process.exit(0);
}
const path = process.env.NATIVE_TEST_STATE;
const state = JSON.parse(fs.readFileSync(path, "utf8"));
state.calls.push(args);
const blocks = state.blocks;
const flag = (key) => args[args.indexOf(key) + 1];
const text = (id, content) => ({ block_id: id, block_type: 2, text: { elements: [{ text_run: { content } }] } });
const content = (block) => block?.text?.elements.map((e) => e.text_run?.content || "").join("") || "";
const xml = (id) => {
	const block = blocks[id];
	if (block.block_type === 27) return `<img id="${id}"/>`;
	if (block.block_type === 33)
		return `<figure id="${id}" view-type="Preview"><source id="${block.children[0]}" mime="video/mp4"/></figure>`;
	return `<p id="${id}">${content(block)}</p>` + (block.children || []).map(xml).join("");
};
const parentOf = (id) => Object.values(blocks).find((block) => block.children?.includes(id));
const erase = (id) => {
	for (const child of blocks[id]?.children || []) erase(child);
	delete blocks[id];
};
const next = () => "remote" + ++state.serial;
function execute() {
	if (args[0] === "drive" && args[1] === "+inspect") return { token: "doc", type: "docx" };
	if (args[0] === "docs" && args[1] === "+fetch")
		return {
			document: {
				document_id: "doc",
				content: '<title id="doc">Note</title>' + blocks.doc.children.map(xml).join(""),
				revision_id: state.revision
			}
		};
	if (args[0] === "docs" && args[1] === "+media-upload") {
		if (!fs.existsSync(flag("--file"))) throw new Error("missing native image snapshot");
		return { file_token: "image-token-" + flag("--parent-node") };
	}
	if (args[0] === "docs" && args[1] === "+media-insert") {
		if (flag("--file-view") !== "preview") throw new Error("video must be a preview");
		if (!fs.existsSync(flag("--file"))) throw new Error("missing video snapshot");
		const figure = next(),
			source = next();
		blocks[figure] = { block_id: figure, block_type: 33, children: [source], view: { view_type: 2 } };
		blocks[source] = { block_id: source, block_type: 23, file: { token: "video-token" } };
		blocks.doc.children.push(figure);
		state.revision++;
		return { block_id: source };
	}
	if (args[0] === "docs" && args[1] === "+update") {
		const command = flag("--command"),
			id = flag("--block-id");
		if (command === "block_move_after") {
			const source = flag("--src-block-ids"),
				oldParent = parentOf(source),
				newParent = parentOf(id);
			oldParent.children.splice(oldParent.children.indexOf(source), 1);
			newParent.children.splice(newParent.children.indexOf(id) + 1, 0, source);
		} else if (command === "block_delete") {
			const parent = parentOf(id);
			parent.children.splice(parent.children.indexOf(id), 1);
			erase(id);
		} else throw new Error("unexpected native update " + command);
		state.revision++;
		return { document: { revision_id: state.revision } };
	}
	if (args[0] !== "api") throw new Error("unexpected CLI " + args.join(" "));
	const method = args[1],
		endpoint = args[2];
	const body = args.includes("--data") ? JSON.parse(fs.readFileSync(flag("--data").slice(1), "utf8")) : undefined;
	const params = args.includes("--params") ? JSON.parse(flag("--params")) : {};
	if (endpoint.endsWith("/convert")) {
		const urls = [];
		const converted = body.content
			.split(/\n\s*\n/)
			.map((p) => p.trim())
			.filter(Boolean)
			.map((part, i) => {
				const id = "temporary" + i,
					img = /^!\[\]\(([^)]+)\)$/.exec(part);
				if (img) {
					urls.push({ block_id: id, image_url: img[1] });
					return { block_id: id, block_type: 27, image: {} };
				}
				return text(id, part.replace(/\*\*/g, ""));
			});
		return {
			blocks: converted,
			first_level_block_ids: converted.map((b) => b.block_id),
			block_id_to_image_urls: urls
		};
	}
	if (method === "GET" && endpoint.endsWith("/documents/doc")) return { document: { revision_id: state.revision } };
	if (method === "GET" && endpoint.endsWith("/blocks")) return { items: Object.values(blocks), has_more: false };
	if (method === "GET") return { block: blocks[endpoint.split("/").at(-1)] };
	if (method === "POST" && endpoint.endsWith("/descendant")) {
		if (state.tokens[params.client_token]) return state.tokens[params.client_token];
		const ids = Object.fromEntries(body.descendants.map((b) => [b.block_id, next()]));
		for (const original of body.descendants) {
			const b = structuredClone(original);
			b.block_id = ids[b.block_id];
			if (b.children) b.children = b.children.map((id) => ids[id]);
			blocks[b.block_id] = b;
		}
		blocks.doc.children.splice(body.index, 0, ...body.children_id.map((id) => ids[id]));
		state.revision++;
		return (state.tokens[params.client_token] = {
			block_id_relations: Object.entries(ids).map(([temporary_block_id, block_id]) => ({
				temporary_block_id,
				block_id
			}))
		});
	}
	if (method === "PATCH") {
		const id = endpoint.split("/").at(-1);
		if (body.replace_image) blocks[id].image = { ...blocks[id].image, ...body.replace_image };
		else if (body.update_text_elements) blocks[id].page = { elements: body.update_text_elements.elements };
		else throw new Error("unexpected patch");
		state.revision++;
		return { block: blocks[id] };
	}
	if (method === "DELETE") {
		if (params.document_revision_id !== state.revision) throw new Error("stale deletion");
		blocks.doc.children.splice(body.start_index, body.end_index - body.start_index).forEach(erase);
		state.revision++;
		return {};
	}
	throw new Error("unexpected API " + method + " " + endpoint);
}
try {
	const data = execute();
	fs.writeFileSync(path, JSON.stringify(state));
	process.stdout.write(JSON.stringify({ ok: true, data }));
} catch (error) {
	fs.writeFileSync(path, JSON.stringify(state));
	process.stdout.write(JSON.stringify({ ok: false, error: { message: error.message } }));
}
