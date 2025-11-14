import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	Plugin,
	TFile,
} from 'obsidian';

interface NoteTitleSuggestion {
	title: string;
	file: TFile;
}

class NoteTitleSuggester extends EditorSuggest<NoteTitleSuggestion> {
	plugin: AutoLinkSuggestionsPlugin;
	private noteTitles: Map<string, TFile> = new Map();
	private MIN_TRIGGER_LENGTH = 2;
	private MAX_SUGGESTIONS = 10;

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

		// Only trigger if we have at least MIN_TRIGGER_LENGTH characters
		if (currentWord.length < this.MIN_TRIGGER_LENGTH) {
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
		const query = context.query.toLowerCase();
		const suggestions: NoteTitleSuggestion[] = [];

		// Search through all note titles
		for (const file of this.noteTitles.values()) {
			const title = file.basename;
			const titleLower = title.toLowerCase();

			// Check if the query appears anywhere in the title (case-insensitive)
			if (titleLower.includes(query)) {
				suggestions.push({ title, file });

				// Stop if we've reached the maximum
				if (suggestions.length >= this.MAX_SUGGESTIONS) {
					break;
				}
			}
		}

		return suggestions;
	}

	/**
	 * Render each suggestion in the dropdown
	 */
	renderSuggestion(suggestion: NoteTitleSuggestion, el: HTMLElement): void {
		el.createEl('div', { text: suggestion.title, cls: 'auto-link-suggestion-item' });
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
	}
}

export default class AutoLinkSuggestionsPlugin extends Plugin {
	private suggester: NoteTitleSuggester;

	async onload() {
		console.log('Loading Auto Link Suggestions plugin');

		// Initialize the suggester
		this.suggester = new NoteTitleSuggester(this.app, this);
		this.registerEditorSuggest(this.suggester);
	}

	onunload() {
		console.log('Unloading Auto Link Suggestions plugin');
	}
}
