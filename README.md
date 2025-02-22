# Obsidian Dropbox Photo Grid

This plugin allows you to embed a grid of photos from your Dropbox account based on a specific date. Photos are displayed in a responsive grid layout with smooth hover effects.

## Setup

1. Install the plugin in Obsidian
2. Go to plugin settings and enter your Dropbox access token
   - You can get an access token from the [Dropbox App Console](https://www.dropbox.com/developers/apps)

## Usage

To embed a photo grid in your notes, use the following code block syntax:

```dropbox-photos
/Photos/2023
2023-11-15
```

The first line is the Dropbox folder path where your photos are stored.
The second line is the date for which you want to display photos.

## Features

- Responsive grid layout
- Smooth hover effects
- Error handling and user feedback
- Configurable through settings

## Requirements

- Obsidian v0.15.0 or higher
- Dropbox account with API access
- Valid Dropbox access token
