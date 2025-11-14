# Auto Link Suggestions

An Obsidian plugin that automatically suggests note titles as you type and creates wiki-style links to them. Stop manually typing `[[` to create links - just start typing a note name and get intelligent suggestions!

## Features

- **Smart Auto-Complete**: As you type, the plugin automatically suggests matching note titles from your vault
- **Alias Support**: Includes note aliases from frontmatter in suggestions
- **Flexible Matching**: Choose between matching anywhere in the title or only at the start
- **Customizable Behavior**: Configure minimum trigger length, maximum suggestions, and more
- **Real-time Indexing**: Automatically tracks when notes are created, renamed, or deleted
- **Path Display**: Optionally show file paths to disambiguate notes with similar names

## How It Works

Simply start typing in any note. Once you've typed the minimum number of characters (default: 2), the plugin will show a dropdown menu with matching note titles. Select a suggestion to automatically insert a wiki-style link (`[[Note Title]]`) at your cursor position.

The plugin intelligently:
- Won't trigger if you're already inside a link (between `[[` and `]]`)
- Updates suggestions in real-time as your vault changes
- Matches against both note titles and aliases (if enabled)

## Settings

Access the plugin settings via Settings → Auto Link Suggestions to customize the behavior:

### Minimum Characters
- **Description**: Minimum number of characters you need to type before suggestions appear
- **Default**: 2
- **Use case**: Increase this if you want fewer/more targeted suggestions; decrease to get suggestions sooner

### Maximum Suggestions
- **Description**: Maximum number of suggestions to display in the dropdown menu
- **Default**: 10
- **Use case**: Increase for more options; decrease for a cleaner, faster interface

### Case Sensitive
- **Description**: Whether matching should be case-sensitive
- **Default**: Off (case-insensitive)
- **Use case**: Enable if you have notes with similar names but different capitalization

### Match at Start
- **Description**: Only match note titles that start with your typed text
- **Default**: Off (matches anywhere in title)
- **Example**:
  - Off: typing "link" will match "Auto **Link** Suggestions"
  - On: typing "link" will NOT match "Auto Link Suggestions" (doesn't start with "link")

### Include Aliases
- **Description**: Show note aliases from frontmatter in suggestions
- **Default**: On
- **Example**: If a note has `aliases: [AI, Artificial Intelligence]` in frontmatter, typing "AI" will suggest this note
- **Use case**: Disable if you only want to see actual note titles

### Show File Path
- **Description**: Display the file path below each suggestion in the dropdown
- **Default**: Off
- **Use case**: Enable if you have notes with identical titles in different folders and need to distinguish them

## Installation

### From Obsidian Community Plugins (when published)
1. Open Settings → Community plugins
2. Disable Safe mode if needed
3. Click Browse and search for "Auto Link Suggestions"
4. Click Install, then Enable

### Manual Installation
1. Download the latest release from the releases page
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/auto-link-suggestions/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community plugins

## Usage Examples

### Basic Usage
```
Start typing: "obsid"
Suggestions appear: "Obsidian Tips", "Obsidian Plugins", "Obsidian Workflow"
Select one → automatically inserts: [[Obsidian Tips]]
```

### With Aliases
If you have a note "Artificial Intelligence.md" with frontmatter:
```yaml
---
aliases: [AI, Machine Learning, ML]
---
```

Typing "AI" will suggest this note, and selecting it creates: `[[AI]]`

### Configuration Scenarios

**Scenario 1: Quick Links for Large Vaults**
- Minimum characters: 3
- Maximum suggestions: 5
- Match at start: On
- Use case: Reduces noise in vaults with hundreds/thousands of notes

**Scenario 2: Comprehensive Suggestions**
- Minimum characters: 2
- Maximum suggestions: 20
- Match at start: Off
- Include aliases: On
- Use case: See all possible matches, including partial matches and aliases

**Scenario 3: Precise Matching**
- Case sensitive: On
- Match at start: On
- Include aliases: Off
- Use case: Technical documentation where capitalization matters

## Development

Built with TypeScript for Obsidian. Key components:

- `NoteTitleSuggester`: Extends `EditorSuggest` to provide the auto-complete functionality
- Real-time vault indexing using Obsidian's vault events
- Settings interface for customization

## Support

If you encounter any issues or have suggestions for improvements, please open an issue on the GitHub repository.

## License

MIT License - see LICENSE file for details
