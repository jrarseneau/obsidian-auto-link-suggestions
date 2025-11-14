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
	enableRecencyBoost: boolean;  // Boost recently-used notes
	recencyWeight: number;        // Weight for recency (0-100, percentage)
	decayDays: number;            // Days before usage starts to decay
	enableNewnessBoost: boolean;  // Boost recently-created notes
	newnessBoostDays: number;     // Days for newness boost to apply
	newnessBoostStrength: number; // Strength of newness boost (0.0-2.0, adds to 1.0)
}

const DEFAULT_SETTINGS: AutoLinkSettings = {
	minTriggerLength: 2,
	maxSuggestions: 10,
	caseSensitive: false,
	matchStart: false,
	includeAliases: true,
	showPath: false,
	enableUsageRanking: true,
	enableRecencyBoost: true,
	recencyWeight: 30,      // 30% weight to recency, 70% to frequency
	decayDays: 90,          // Start decaying after 90 days
	enableNewnessBoost: true,
	newnessBoostDays: 30,   // Boost notes created in last 30 days
	newnessBoostStrength: 0.5,  // 0.5 = up to 1.5x boost (1.0 + 0.5)
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
			const now = Date.now();
			const dayInMs = 24 * 60 * 60 * 1000;
			const decayThreshold = settings.decayDays * dayInMs;

			// Find max values for normalization
			let maxCount = 0;
			let maxRecency = 0;

			for (const suggestion of suggestions) {
				const stats = usageStats[suggestion.file.path];
				if (stats) {
					maxCount = Math.max(maxCount, stats.count);
					if (stats.lastUsed > 0) {
						const timeSinceUse = now - stats.lastUsed;
						maxRecency = Math.max(maxRecency, 1 / (timeSinceUse + 1));
					}
				}
			}

			suggestions.sort((a, b) => {
				const aStats = usageStats[a.file.path];
				const bStats = usageStats[b.file.path];

				const aScore = this.calculateScore(aStats, a.file, now, maxCount, maxRecency, dayInMs, decayThreshold, settings);
				const bScore = this.calculateScore(bStats, b.file, now, maxCount, maxRecency, dayInMs, decayThreshold, settings);

				return bScore - aScore; // Descending order (highest score first)
			});
		}

		// Limit to maximum suggestions
		return suggestions.slice(0, settings.maxSuggestions);
	}

	/**
	 * Calculate a weighted score for a suggestion based on usage statistics
	 */
	private calculateScore(
		stats: { count: number; lastUsed: number } | undefined,
		file: TFile,
		now: number,
		maxCount: number,
		maxRecency: number,
		dayInMs: number,
		decayThreshold: number,
		settings: AutoLinkSettings
	): number {
		// Normalize frequency score (0-1)
		// Use 0 for notes that have never been selected
		const frequencyScore = (stats && maxCount > 0) ? stats.count / maxCount : 0;

		// Calculate recency score (0-1)
		let recencyScore = 0;
		if (settings.enableRecencyBoost && stats?.lastUsed && stats.lastUsed > 0) {
			const timeSinceUse = now - stats.lastUsed;
			const recencyValue = 1 / (timeSinceUse + 1);
			recencyScore = maxRecency > 0 ? recencyValue / maxRecency : 0;
		}

		// Apply time-based decay
		let decayFactor = 1.0;
		if (stats?.lastUsed && stats.lastUsed > 0) {
			const timeSinceUse = now - stats.lastUsed;
			if (timeSinceUse > decayThreshold) {
				// Linear decay: reduce by 50% over the next decay period
				const decayPeriod = timeSinceUse - decayThreshold;
				const decayRatio = Math.min(decayPeriod / decayThreshold, 1.0);
				decayFactor = 1.0 - (decayRatio * 0.5);
			}
		}

		// Combine scores with weights
		const recencyWeightFraction = settings.recencyWeight / 100;
		const frequencyWeightFraction = 1 - recencyWeightFraction;

		const baseScore = settings.enableRecencyBoost
			? (frequencyScore * frequencyWeightFraction) + (recencyScore * recencyWeightFraction)
			: frequencyScore;

		// Apply newness boost
		let newnessBoost = 1.0;
		if (settings.enableNewnessBoost && file.stat.ctime) {
			const daysSinceCreation = (now - file.stat.ctime) / dayInMs;

			if (daysSinceCreation <= settings.newnessBoostDays) {
				// Linear fade: full boost at creation, fades to 0 at newnessBoostDays
				const boostFactor = 1.0 - (daysSinceCreation / settings.newnessBoostDays);
				newnessBoost = 1.0 + (boostFactor * settings.newnessBoostStrength);
			}
		}

		// For notes with no usage history, give them a small base score so newness boost can take effect
		// This allows new unused notes to rank higher than old unused notes
		const effectiveBaseScore = baseScore > 0 ? baseScore : 0.01;

		return effectiveBaseScore * decayFactor * newnessBoost;
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

		// Enable recency boost
		new Setting(containerEl)
			.setName('Enable recency boost')
			.setDesc('Boost recently-used notes in rankings. Notes used recently will rank higher than those used long ago.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableRecencyBoost)
				.onChange(async (value) => {
					this.plugin.settings.enableRecencyBoost = value;
					await this.plugin.saveSettings();
				}));

		// Recency weight
		new Setting(containerEl)
			.setName('Recency weight')
			.setDesc('How much to weight recency vs frequency (0-100%). Higher values favor recently-used notes. Default: 30%')
			.addText(text => text
				.setPlaceholder('30')
				.setValue(String(this.plugin.settings.recencyWeight))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0 && num <= 100) {
						this.plugin.settings.recencyWeight = num;
						await this.plugin.saveSettings();
					}
				}));

		// Decay days
		new Setting(containerEl)
			.setName('Decay period (days)')
			.setDesc('Number of days before note rankings start to decay. Notes unused beyond this period gradually lose ranking. Default: 90 days')
			.addText(text => text
				.setPlaceholder('90')
				.setValue(String(this.plugin.settings.decayDays))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.decayDays = num;
						await this.plugin.saveSettings();
					}
				}));

		// Enable newness boost
		new Setting(containerEl)
			.setName('Enable newness boost')
			.setDesc('Boost recently-created notes in rankings. New notes get a temporary ranking boost that fades over time.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNewnessBoost)
				.onChange(async (value) => {
					this.plugin.settings.enableNewnessBoost = value;
					await this.plugin.saveSettings();
				}));

		// Newness boost days
		new Setting(containerEl)
			.setName('Newness boost duration (days)')
			.setDesc('How many days newly-created notes receive a ranking boost. Boost fades linearly to zero. Default: 30 days')
			.addText(text => text
				.setPlaceholder('30')
				.setValue(String(this.plugin.settings.newnessBoostDays))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.newnessBoostDays = num;
						await this.plugin.saveSettings();
					}
				}));

		// Newness boost strength
		new Setting(containerEl)
			.setName('Newness boost strength')
			.setDesc('Maximum boost multiplier for brand-new notes (0.0-2.0). At 0.5, a new note gets up to 1.5x score. At 1.0, up to 2.0x score. Default: 0.5')
			.addText(text => text
				.setPlaceholder('0.5')
				.setValue(String(this.plugin.settings.newnessBoostStrength))
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0 && num <= 2.0) {
						this.plugin.settings.newnessBoostStrength = num;
						await this.plugin.saveSettings();
					}
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
