import { App, Modal, Setting } from "obsidian";

export interface ConfirmDeletionLabels {
	title: string;
	body: string;
	confirm: string;
	cancel: string;
}

/** Resolves true only when the user presses the confirm button; closing the dialog cancels. */
export function confirmDeletion(app: App, labels: ConfirmDeletionLabels, lines: string[]): Promise<boolean> {
	return new Promise((resolve) => new ConfirmDeletionModal(app, labels, lines, resolve).open());
}

class ConfirmDeletionModal extends Modal {
	private readonly labels: ConfirmDeletionLabels;
	private readonly lines: string[];
	private readonly resolve: (confirmed: boolean) => void;
	private decided = false;

	constructor(app: App, labels: ConfirmDeletionLabels, lines: string[], resolve: (confirmed: boolean) => void) {
		super(app);
		this.labels = labels;
		this.lines = lines;
		this.resolve = resolve;
	}

	onOpen(): void {
		this.titleEl.setText(this.labels.title);
		this.contentEl.createEl("p", { text: this.labels.body });
		const list = this.contentEl.createEl("ul", { cls: "feishu-lark-delete-list" });
		for (const line of this.lines) list.createEl("li", { text: line });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.labels.confirm).setDestructive().onClick(() => this.finish(true)))
			.addButton((button) => button.setButtonText(this.labels.cancel).onClick(() => this.finish(false)));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decided) this.resolve(false);
	}

	private finish(confirmed: boolean): void {
		this.decided = true;
		this.resolve(confirmed);
		this.close();
	}
}
