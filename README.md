# Auto Link Suggestions

An Obsidian plugin that automatically suggests note titles as you type and creates wiki-style links to them. Stop manually typing `[[` to create links - just start typing a note name and get intelligent suggestions!

## Features

- **Smart Auto-Complete**: As you type, the plugin automatically suggests matching note titles from your vault
- **Usage-Based Ranking**: Notes you link to frequently appear first in suggestions (learns from your behavior)
- **Recency Weighting**: Boost recently-used notes to prioritize current work over old favorites
- **Time-Based Decay**: Gradually reduce rankings for notes not used recently to keep suggestions fresh
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
- Learns from your selections to rank frequently-used notes higher (when enabled)

## Settings

Access the plugin settings via Settings → Auto Link Suggestions to customize the behavior:

| Setting | Description | Default | Use Case / Notes |
|---------|-------------|---------|------------------|
| **Minimum Characters** | Minimum number of characters you need to type before suggestions appear | 2 | Increase for fewer/more targeted suggestions; decrease to get suggestions sooner |
| **Maximum Suggestions** | Maximum number of suggestions to display in the dropdown menu | 10 | Increase for more options; decrease for a cleaner, faster interface |
| **Case Sensitive** | Whether matching should be case-sensitive | Off | Enable if you have notes with similar names but different capitalization |
| **Match at Start** | Only match note titles that start with your typed text (instead of anywhere in the title) | Off | When off, typing "link" matches "Auto **Link** Suggestions"<br>When on, typing "link" won't match "Auto Link Suggestions" |
| **Include Aliases** | Show note aliases from frontmatter in suggestions | On | If a note has `aliases: [AI]` in frontmatter, typing "AI" will suggest it. Disable to only show actual note titles |
| **Show File Path** | Display the file path below each suggestion in the dropdown | Off | Enable if you have notes with identical titles in different folders and need to distinguish them |
| **Enable Usage-Based Ranking** | Rank suggestions based on how frequently you select them | On | When enabled, notes you link to more often appear first in the dropdown. Perfect for surfacing your most-used references quickly |
| **Enable Recency Boost** | Boost recently-used notes in rankings | On | Prioritizes notes you've linked to recently. A note used yesterday will rank higher than one used months ago, even with the same total usage count |
| **Recency Weight** | Balance between recency and frequency (0-100%) | 30% | Higher values favor recently-used notes more. At 30%, scoring is 70% frequency + 30% recency. At 50%, they're equally weighted |
| **Decay Period (days)** | Days before rankings start to decay | 90 | Notes not used within this period gradually lose ranking (50% reduction over the next period). Prevents old favorites from dominating forever |

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

### Usage-Based Ranking
The plugin learns from your selections to improve suggestions over time:

**Initial state** (typing "John"):
- John Doe
- John Smith
- Johnny Appleseed

**After frequently linking to "John Smith"** (typing "John"):
- John Smith ⭐ (appears first due to high usage)
- John Doe
- Johnny Appleseed

The ranking is based on how many times you've selected each note. This makes your most-referenced notes instantly accessible!

### Recency Weighting & Decay
The plugin can also prioritize recently-used notes and decay old rankings:

**Scenario**: You have two notes, both linked 10 times
- "Project Alpha" - Last used 2 days ago
- "Project Beta" - Last used 6 months ago

**With recency boost enabled** (typing "Project"):
- Project Alpha ⭐ (appears first - recently used)
- Project Beta (used long ago)

**After 90 days** (default decay period):
- Notes unused for 90+ days gradually lose ranking (50% reduction over the next 90 days)
- This prevents old projects from cluttering suggestions when you're working on new things
- Frequency still matters - a note used 100 times will rank higher than one used 5 times, even if older

**Configurable weighting**:
- At 30% recency weight (default): 70% frequency + 30% recency
- At 50% recency weight: Equal balance
- At 0% recency weight: Pure frequency-based ranking (like before)

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

GNU General Public License v3.0 - see LICENSE file for details
