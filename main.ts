import { Plugin, Notice, PluginSettingTab, Setting, App } from "obsidian";
import { processContent } from "./extract";

interface ExtractReferencesSettings {
	autoExtractInterval: number; // minutes, 0 = disabled
	extractOnStartup: boolean;
}

const DEFAULT_SETTINGS: ExtractReferencesSettings = {
	autoExtractInterval: 0,
	extractOnStartup: true,
};

export default class ExtractReferencesPlugin extends Plugin {
	settings: ExtractReferencesSettings = DEFAULT_SETTINGS;
	private autoExtractTimer: number | undefined;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "extract-references-current",
			name: "Extract references from current note",
			callback: () => this.extractFromCurrentNote(),
		});
		this.addCommand({
			id: "extract-references-all",
			name: "Extract references from all notes",
			callback: () => this.extractFromAllNotes(),
		});

		this.addSettingTab(new ExtractReferencesSettingTab(this.app, this));

		// run on startup if enabled (wait for layout to be ready)
		if (this.settings.extractOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				this.extractFromAllNotes(true);
			});
		}

		this.startAutoExtract();
	}

	onunload() {
		this.clearAutoExtract();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	startAutoExtract() {
		this.clearAutoExtract();
		if (this.settings.autoExtractInterval <= 0) return;

		const ms = this.settings.autoExtractInterval * 60 * 1000;
		this.autoExtractTimer = window.setInterval(() => {
			this.extractFromAllNotes(true);
		}, ms);

		// let obsidian clean it up on plugin unload
		this.registerInterval(this.autoExtractTimer);
	}

	clearAutoExtract() {
		if (this.autoExtractTimer !== undefined) {
			window.clearInterval(this.autoExtractTimer);
			this.autoExtractTimer = undefined;
		}
	}

	async extractFromCurrentNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("No active markdown file");
			return;
		}

		const content = await this.app.vault.read(file);
		const result = processContent(content);

		if (!result) {
			new Notice("No new references found");
			return;
		}

		await this.app.vault.modify(file, result.content);
		new Notice(`Added ${result.added} reference(s)`);
	}

	async extractFromAllNotes(silent = false) {
		const files = this.app.vault.getMarkdownFiles();
		let totalAdded = 0;
		let filesChanged = 0;

		for (const file of files) {
			const content = await this.app.vault.read(file);
			const result = processContent(content);
			if (result) {
				await this.app.vault.modify(file, result.content);
				totalAdded += result.added;
				filesChanged++;
			}
		}

		if (totalAdded === 0) {
			if (!silent) new Notice("No new references found in any note");
		} else {
			new Notice(
				`Added ${totalAdded} reference(s) across ${filesChanged} note(s)`
			);
		}
	}
}

class ExtractReferencesSettingTab extends PluginSettingTab {
	plugin: ExtractReferencesPlugin;

	constructor(app: App, plugin: ExtractReferencesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Automatic ──
		new Setting(containerEl).setName("Automatic").setHeading();

		new Setting(containerEl)
			.setName("Auto extract interval (minutes)")
			.setDesc(
				"Run 'Extract references from all notes' every X minutes. Set to 0 (default) to disable."
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.setPlaceholder("0");
				text.setValue(
					String(this.plugin.settings.autoExtractInterval)
				);
				text.onChange(async (value) => {
					const num = parseInt(value, 10);
					this.plugin.settings.autoExtractInterval =
						isNaN(num) || num < 0 ? 0 : num;
					await this.plugin.saveSettings();
					this.plugin.startAutoExtract();
				});
			});

		new Setting(containerEl)
			.setName("Extract on startup")
			.setDesc(
				"Automatically run 'Extract references from all notes' when Obsidian starts."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.extractOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.extractOnStartup = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
