# Dropbox Photo Grid for Obsidian

This plugin allows you to embed a grid of photos from your Dropbox account based on a specific date. It's perfect for displaying daily photos, memories, or any date-based photo collections within your Obsidian vault.

## Features

- Display photos from Dropbox in a responsive grid layout
- Filter photos by date
- Support for both folder paths and direct file paths
- Loading indicator while fetching photos
- Respects Obsidian's theme colors
- Handles pagination for large photo collections
- Show memories from "On This Day" in previous years


## Installation

### Community Plugins
1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Dropbox Photo Grid"
4. Install the plugin and enable it

### Manual Installation
1. Download the latest release from the [releases page](https://github.com/alimoeeny/obsidian-dropbox-photo-grid/releases)
2. Extract the files to your vault's `.obsidian/plugins/obsidian-dropbox-photo-grid/` directory
3. Reload Obsidian
4. Enable the plugin in the Community Plugins settings

## Setup

1. Go to Settings > Dropbox Photo Grid
2. Click "Connect to Dropbox" to authorize the plugin
3. The plugin will automatically handle authentication

## Usage

### Basic Syntax

```markdown
```dropbox-photos
/path/to/folder
YYYY-MM-DD
```
```

### Using with Templates

First, make sure you have the Templater plugin installed and enabled. Then use the following syntax in your templates:

```markdown
```dropbox-photos
/Camera Uploads/<% tp.date.now("YYYY") %>/
<% tp.date.now("YYYY-MM-DD") %>
```
```

For example, if you want to create a daily note template that shows photos from that day:

```markdown
# Daily Note - <% tp.date.now("YYYY-MM-DD") %>

## Today's Photos
```dropbox-photos
/Camera Uploads/<% tp.date.now("YYYY") %>/
<% tp.date.now("YYYY-MM-DD") %>
```

## Journal Entry

### Template Tips

1. **Yearly Folders**: If your photos are organized in yearly folders (e.g., `/Camera Uploads/2024/`):
   ```markdown
   ```dropbox-photos
   /Camera Uploads/<% tp.date.now("YYYY") %>/
   <% tp.date.now("YYYY-MM-DD") %>
   ```
   ```

2. **Previous Years**: To show photos from the same day in previous years:
   ```markdown
   # Photos from Today Last Year
   ```dropbox-photos
   /Camera Uploads/<% tp.date.now("YYYY", -365) %>/
   <% tp.date.now("YYYY-MM-DD", -365) %>
   ```

   # Photos from Today Two Years Ago
   ```dropbox-photos
   /Camera Uploads/<% tp.date.now("YYYY", -730) %>/
   <% tp.date.now("YYYY-MM-DD", -730) %>
   ```
   ```

3. **Previous Days**: To show photos from specific days ago:
   ```markdown
   ```dropbox-photos
   /Camera Uploads/<% tp.date.now("YYYY", -7) %>/
   <% tp.date.now("YYYY-MM-DD", -7) %>
   ```
   ```

### Example: Daily Note with Current and Last Year's Photos

```markdown
# Daily Note - <% tp.date.now("YYYY-MM-DD") %>

## Today's Photos
```dropbox-photos
/Camera Uploads/<% tp.date.now("YYYY") %>/
<% tp.date.now("YYYY-MM-DD") %>
```

## On This Day Last Year
```dropbox-photos
/Camera Uploads/<% tp.date.now("YYYY", -365) %>/
<% tp.date.now("YYYY-MM-DD", -365) %>
```

## Journal Entry

### Path Examples

1. **Folder path** (shows all photos from the date):
   ```markdown
   ```dropbox-photos
   /Camera Uploads/2024
   2024-02-22
   ```
   ```

2. **Direct file path** (shows specific photo):
   ```markdown
   ```dropbox-photos
   /Camera Uploads/2024/2024-02-22 08.33.05.png
   2024-02-22
   ```
   ```

## Security and Privacy

- This plugin requires Dropbox authentication to access your photos
- Your Dropbox credentials are stored securely in Obsidian's local storage
- The plugin only requests access to files and folders you specify
- No data is sent to third-party servers

## Support

If you encounter any issues or have feature requests:

1. Check the [GitHub Issues](https://github.com/alimoeeny/obsidian-dropbox-photo-grid/issues) page
2. Create a new issue if your problem hasn't been reported
3. Include your Obsidian version and operating system details

## Changelog

### 1.0.0
- Initial release
- Basic Dropbox integration
- Photo grid display with date filtering

## Development

This plugin is developed using TypeScript and the Obsidian API. Contributions are welcome!

To build the plugin from source:
1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` to start compilation in watch mode
4. Copy the `main.js`, `manifest.json`, and `styles.css` files to your vault's plugins directory

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to the Obsidian team for their excellent plugin API
- Thanks to Dropbox for their SDK
