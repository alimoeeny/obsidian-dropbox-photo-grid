# Dropbox Photo Grid Plugin for Obsidian

This plugin allows you to embed a grid of photos from your Dropbox account based on a specific date. It's perfect for displaying daily photos, memories, or any date-based photo collections.

## Features

- Display photos from Dropbox in a responsive grid layout
- Filter photos by date
- Support for both folder paths and direct file paths
- Loading indicator while fetching photos
- Respects Obsidian's theme colors
- Handles pagination for large photo collections

## Setup

1. Install the plugin in Obsidian
2. Install the Templater plugin (required for date templates)
3. Go to Settings > Dropbox Photo Grid
4. Enter your Dropbox access token

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

## Requirements

- Obsidian v0.15.0 or higher
- Templater plugin installed and enabled
- Dropbox account with API access
- Valid Dropbox access token

## Troubleshooting

- Make sure your Dropbox access token is correctly set in the plugin settings
- Check that the folder path exists in your Dropbox account
- Ensure the date format is YYYY-MM-DD
- Make sure the Templater plugin is installed and enabled
- If photos aren't showing up, check the developer console (Cmd+Option+I) for any error messages

## Support

If you encounter any issues or have suggestions, please open an issue on the GitHub repository.
