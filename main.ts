import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';

interface NoteTitleSuggestion {
	title: string;
	file: TFile;
}

interface UsageStats {
	[filePath: string]: {
		count: number;      // Number of times this note was selected
		lastUsed: number;   // Timestamp of last selection
	}
}

interface AutoLinkSettings {
	minTriggerLength: number;
	maxSuggestions: number;
	caseSensitive: boolean;
	matchStart: boolean;
	includeAliases: boolean;
	showPath: boolean;
	enableUsageRanking: boolean;  // Toggle usage-based ranking
}

const DEFAULT_SETTINGS: AutoLinkSettings = {
	minTriggerLength: 2,
	maxSuggestions: 10,
	caseSensitive: false,
	matchStart: false,
	includeAliases: true,
	showPath: false,
	enableUsageRanking: true,
}

class NoteTitleSuggester extends EditorSuggest<NoteTitleSuggestion> {
	plugin: AutoLinkSuggestionsPlugin;
	private noteTitles: Map<string, TFile> = new Map();

	constructor(app: App, plugin: AutoLinkSuggestionsPlugin) {
		super(app);
		this.plugin = plugin;
		this.indexVaultTitles();
		this.registerVaultListeners();
	}

	/**
	 * Build initial index of all note titles in the vault
	 */
	private indexVaultTitles(): void {
		this.noteTitles.clear();
		const files = this.app.vault.getMarkdownFiles();
		files.forEach(file => {
			const title = file.basename;
			this.noteTitles.set(file.path, file);
		});
	}

	/**
	 * Listen to vault events to keep the title index up-to-date
	 */
	private registerVaultListeners(): void {
		// When a file is created
		this.plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.noteTitles.set(file.path, file);
				}
			})
		);

		// When a file is renamed
		this.plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.noteTitles.delete(oldPath);
					this.noteTitles.set(file.path, file);
				}
			})
		);

		// When a file is deleted
		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.noteTitles.delete(file.path);
				}
			})
		);
	}

	/**
	 * Determine if suggestions should be triggered
	 */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		// Get the current line up to the cursor
		const line = editor.getLine(cursor.line);
		const cursorPos = cursor.ch;

		// Find the start of the current word being typed
		let wordStart = cursorPos;
		while (wordStart > 0 && /\S/.test(line[wordStart - 1])) {
			wordStart--;
		}

		// Get the current word
		const currentWord = line.substring(wordStart, cursorPos);

		// Only trigger if we have at least the configured minimum characters
		if (currentWord.length < this.plugin.settings.minTriggerLength) {
			return null;
		}

		// Don't trigger if we're already inside a link
		const beforeCursor = line.substring(0, cursorPos);
		const linkOpenCount = (beforeCursor.match(/\[\[/g) || []).length;
		const linkCloseCount = (beforeCursor.match(/\]\]/g) || []).length;
		if (linkOpenCount > linkCloseCount) {
			return null;
		}

		return {
			start: { line: cursor.line, ch: wordStart },
			end: { line: cursor.line, ch: cursorPos },
			query: currentWord,
		};
	}

	/**
	 * Get suggestions based on the current query
	 */
	getSuggestions(context: EditorSuggestContext): NoteTitleSuggestion[] {
		const settings = this.plugin.settings;
		const query = settings.caseSensitive ? context.query : context.query.toLowerCase();
		const suggestions: NoteTitleSuggestion[] = [];

		// Search through all note titles
		for (const file of this.noteTitles.values()) {
			const title = file.basename;
			const compareTitle = settings.caseSensitive ? title : title.toLowerCase();

			// Check if the query matches based on settings
			let matches = false;
			if (settings.matchStart) {
				// Match only at the beginning of the title
				matches = compareTitle.startsWith(query);
			} else {
				// Match anywhere in the title
				matches = compareTitle.includes(query);
			}

			if (matches) {
				suggestions.push({ title, file });
			}

			// Also check aliases if enabled
			if (settings.includeAliases) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.aliases) {
					const aliases = Array.isArray(cache.frontmatter.aliases)
						? cache.frontmatter.aliases
						: [cache.frontmatter.aliases];

					for (const alias of aliases) {
						if (typeof alias === 'string') {
							const compareAlias = settings.caseSensitive ? alias : alias.toLowerCase();
							let aliasMatches = false;

							if (settings.matchStart) {
								aliasMatches = compareAlias.startsWith(query);
							} else {
								aliasMatches = compareAlias.includes(query);
							}

							if (aliasMatches) {
								// Add with alias as the title, so it displays in suggestions
								suggestions.push({ title: alias, file });
							}
						}
					}
				}
			}
		}

		// Sort by usage frequency if enabled
		if (settings.enableUsageRanking) {
			const usageStats = this.plugin.usageStats;
			suggestions.sort((a, b) => {
				const aCount = usageStats[a.file.path]?.count || 0;
				const bCount = usageStats[b.file.path]?.count || 0;
				return bCount - aCount; // Descending order (most used first)
			});
		}

		// Limit to maximum suggestions
		return suggestions.slice(0, settings.maxSuggestions);
	}

	/**
	 * Render each suggestion in the dropdown
	 */
	renderSuggestion(suggestion: NoteTitleSuggestion, el: HTMLElement): void {
		const container = el.createEl('div', { cls: 'auto-link-suggestion-item' });
		container.createEl('div', { text: suggestion.title, cls: 'auto-link-suggestion-title' });

		if (this.plugin.settings.showPath) {
			container.createEl('div', {
				text: suggestion.file.path,
				cls: 'auto-link-suggestion-path'
			});
		}
	}

	/**
	 * Handle when a suggestion is selected
	 */
	selectSuggestion(suggestion: NoteTitleSuggestion, evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) {
			return;
		}

		const editor = this.context.editor;
		const start = this.context.start;
		const end = this.context.end;

		// Replace the current word with the full note title link
		const link = `[[${suggestion.title}]]`;
		editor.replaceRange(link, start, end);

		// Move cursor to after the inserted link
		const newCursorPos = {
			line: start.line,
			ch: start.ch + link.length,
		};
		editor.setCursor(newCursorPos);

		// Track usage if enabled
		if (this.plugin.settings.enableUsageRanking) {
			this.plugin.trackNoteSelection(suggestion.file.path);
		}
	}
}

class AutoLinkSettingsTab extends PluginSettingTab {
	plugin: AutoLinkSuggestionsPlugin;

	constructor(app: App, plugin: AutoLinkSuggestionsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Auto Link Suggestions Settings' });

		// Minimum trigger length
		new Setting(containerEl)
			.setName('Minimum characters')
			.setDesc('Minimum number of characters before suggestions appear')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(String(this.plugin.settings.minTriggerLength))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.minTriggerLength = num;
						await this.plugin.saveSettings();
					}
				}));

		// Maximum suggestions
		new Setting(containerEl)
			.setName('Maximum suggestions')
			.setDesc('Maximum number of suggestions to show in the dropdown')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(String(this.plugin.settings.maxSuggestions))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.maxSuggestions = num;
						await this.plugin.saveSettings();
					}
				}));

		// Case sensitive matching
		new Setting(containerEl)
			.setName('Case sensitive')
			.setDesc('Match note titles with case sensitivity')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.caseSensitive)
				.onChange(async (value) => {
					this.plugin.settings.caseSensitive = value;
					await this.plugin.saveSettings();
				}));

		// Match at start
		new Setting(containerEl)
			.setName('Match at start')
			.setDesc('Only match note titles that start with the typed text (instead of anywhere in the title)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.matchStart)
				.onChange(async (value) => {
					this.plugin.settings.matchStart = value;
					await this.plugin.saveSettings();
				}));

		// Include aliases
		new Setting(containerEl)
			.setName('Include aliases')
			.setDesc('Show note aliases in suggestions (from frontmatter)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeAliases)
				.onChange(async (value) => {
					this.plugin.settings.includeAliases = value;
					await this.plugin.saveSettings();
				}));

		// Show file path
		new Setting(containerEl)
			.setName('Show file path')
			.setDesc('Display the file path below each suggestion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showPath)
				.onChange(async (value) => {
					this.plugin.settings.showPath = value;
					await this.plugin.saveSettings();
				}));

		// Enable usage-based ranking
		new Setting(containerEl)
			.setName('Enable usage-based ranking')
			.setDesc('Rank suggestions based on how frequently you select them. Notes you link to more often will appear first.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableUsageRanking)
				.onChange(async (value) => {
					this.plugin.settings.enableUsageRanking = value;
					await this.plugin.saveSettings();
				}));
	}
}

export default class AutoLinkSuggestionsPlugin extends Plugin {
	settings: AutoLinkSettings;
	usageStats: UsageStats = {};
	private suggester: NoteTitleSuggester;

	async onload() {
		console.log('Loading Auto Link Suggestions plugin');

		// Load settings
		await this.loadSettings();

		// Initialize the suggester
		this.suggester = new NoteTitleSuggester(this.app, this);
		this.registerEditorSuggest(this.suggester);

		// Register settings tab
		this.addSettingTab(new AutoLinkSettingsTab(this.app, this));

		// Register vault event handlers for usage stats cleanup
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.cleanupUsageStats(file.path);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.updateUsageStatsPath(oldPath, file.path);
				}
			})
		);
	}

	onunload() {
		console.log('Unloading Auto Link Suggestions plugin');
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || data || {});
		this.usageStats = data?.usageStats || {};
	}

	async saveSettings() {
		await this.saveData({
			settings: this.settings,
			usageStats: this.usageStats
		});
	}

	/**
	 * Track when a note is selected from suggestions
	 */
	trackNoteSelection(filePath: string): void {
		if (!this.usageStats[filePath]) {
			this.usageStats[filePath] = {
				count: 0,
				lastUsed: 0
			};
		}

		this.usageStats[filePath].count++;
		this.usageStats[filePath].lastUsed = Date.now();

		// Save asynchronously (fire and forget to avoid blocking UI)
		this.saveSettings();
	}

	/**
	 * Clean up usage stats when a file is deleted
	 */
	private cleanupUsageStats(filePath: string): void {
		if (this.usageStats[filePath]) {
			delete this.usageStats[filePath];
			this.saveSettings();
		}
	}

	/**
	 * Update usage stats when a file is renamed
	 */
	private updateUsageStatsPath(oldPath: string, newPath: string): void {
		if (this.usageStats[oldPath]) {
			this.usageStats[newPath] = this.usageStats[oldPath];
			delete this.usageStats[oldPath];
			this.saveSettings();
		}
	}
}
