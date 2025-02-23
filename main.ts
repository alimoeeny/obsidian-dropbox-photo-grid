import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Dropbox, files } from 'dropbox';

interface DropboxPhotoGridSettings {
    accessToken: string;
}

const DEFAULT_SETTINGS: DropboxPhotoGridSettings = {
    accessToken: ''
};

export default class DropboxPhotoGridPlugin extends Plugin {
    settings: DropboxPhotoGridSettings;
    dbx: Dropbox | null = null;

    private getDropboxClient(): Dropbox {
        if (!this.settings.accessToken) {
            throw new Error('Dropbox access token not set. Please set it in the plugin settings.');
        }
        return new Dropbox({
            accessToken: this.settings.accessToken,
            fetch: fetch.bind(window)
        });
    }

    // Pure function to check if a file is an image
    private static isImageFile(path: string): boolean {
        return !!path.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/);
    }

    // Pure function to parse date string into Date object in local timezone
    private static parseDate(dateStr: string): Date {
        // Try parsing custom format first to ensure local timezone
        const matches = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (matches) {
            const [_, year, month, day] = matches;
            // Create date in local timezone by using Date.UTC and adjusting for local offset
            const utcDate = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day));
            const localDate = new Date(utcDate);
            const offset = localDate.getTimezoneOffset() * 60000; // convert minutes to milliseconds
            return new Date(utcDate + offset);
        }
        
        // Fallback to standard parsing
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            // Ensure we're using local midnight
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }
        
        throw new Error(`Invalid date format: ${dateStr}. Please use YYYY-MM-DD format.`);
    }

    // Pure function to check if dates match (comparing only year, month, and day)
    private static datesMatch(fileDate: Date, targetDate: Date): boolean {
        const fileYear = fileDate.getFullYear();
        const fileMonth = fileDate.getMonth();
        const fileDay = fileDate.getDate();
        
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();
        const targetDay = targetDate.getDate();

        const matches = fileYear === targetYear && 
                       fileMonth === targetMonth && 
                       fileDay === targetDay;

        console.log('Date comparison:', {
            file: {
                original: fileDate.toISOString(),
                year: fileYear,
                month: fileMonth + 1, // +1 for human-readable month
                day: fileDay
            },
            target: {
                original: targetDate.toISOString(),
                year: targetYear,
                month: targetMonth + 1, // +1 for human-readable month
                day: targetDay
            },
            matches
        });

        return matches;
    }

    // Pure function to filter files by date and type
    private static filterFiles(files: files.FileMetadata[], targetDate: Date): files.FileMetadata[] {
        console.log(`Filtering ${files.length} files for date: ${targetDate.toISOString()}`);
        
        const matchingFiles = files.filter(file => {
            if (!('path_lower' in file) || !file.path_lower) {
                console.log('Skipping file without path:', file);
                return false;
            }
            if (!DropboxPhotoGridPlugin.isImageFile(file.path_lower)) {
                console.log('Skipping non-image:', file.path_lower);
                return false;
            }
            
            const fileDate = new Date(file.client_modified);
            return DropboxPhotoGridPlugin.datesMatch(fileDate, targetDate);
        });

        console.log(`Found ${matchingFiles.length} matching files`);
        return matchingFiles;
    }

    // Pure function to check if path is a direct file path
    private static isDirectFilePath(path: string): boolean {
        return path.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) !== null;
    }

    // Pure function to create grid styles
    private static getGridStyles(): string {
        return `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            padding: 20px 0;
        `;
    }

    // Pure function to create photo container styles
    private static getPhotoContainerStyles(): string {
        return `
            aspect-ratio: 1;
            overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        `;
    }

    // Pure function to create photo styles
    private static getPhotoStyles(): string {
        return `
            width: 100%;
            height: 100%;
            object-fit: cover;
        `;
    }

    // Async function to fetch all files from Dropbox with pagination
    private async getAllFiles(dbx: Dropbox, folderPath: string): Promise<files.FileMetadata[]> {
        let allFiles: files.FileMetadata[] = [];
        let hasMore = true;
        let cursor: string | undefined;

        while (hasMore) {
            const response = cursor
                ? await dbx.filesListFolderContinue({ cursor })
                : await dbx.filesListFolder({
                    path: folderPath,
                    include_media_info: true,
                    limit: 1000
                });

            allFiles = allFiles.concat(response.result.entries as files.FileMetadata[]);
            hasMore = response.result.has_more;
            cursor = response.result.cursor;
        }

        return allFiles;
    }

    // Async function to get a single file metadata
    private async getFileMetadata(dbx: Dropbox, path: string): Promise<files.FileMetadata | null> {
        try {
            const response = await dbx.filesGetMetadata({
                path: path
            });
            return response.result as files.FileMetadata;
        } catch (error) {
            console.error('Error getting file metadata:', error);
            return null;
        }
    }

    // Async function to fetch files based on path type
    private async getFiles(dbx: Dropbox, path: string): Promise<files.FileMetadata[]> {
        if (DropboxPhotoGridPlugin.isDirectFilePath(path)) {
            const file = await this.getFileMetadata(dbx, path);
            return file ? [file] : [];
        } else {
            return this.getAllFiles(dbx, path);
        }
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new DropboxPhotoGridSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor('dropbox-photos', async (source, el) => {
            try {
                const [folderPath, date] = source.trim().split('\n');
                if (!folderPath || !date) {
                    throw new Error('Both folder path and date are required');
                }

                if (!this.settings.accessToken) {
                    el.createEl('div', { text: 'Please set your Dropbox access token in the settings' });
                    return;
                }

                const container = el.createEl('div', {
                    attr: { class: 'dropbox-photo-grid' }
                });

                try {
                    const dbx = this.getDropboxClient();
                    const allFiles = await this.getFiles(dbx, folderPath);
                    console.log(`Processing ${allFiles.length} files from path: ${folderPath}`);
                    
                    const targetDate = DropboxPhotoGridPlugin.parseDate(date);
                    console.log('Target date:', {
                        original: date,
                        parsed: targetDate.toISOString(),
                        year: targetDate.getFullYear(),
                        month: targetDate.getMonth() + 1,
                        day: targetDate.getDate()
                    });
                    
                    const matchingFiles = DropboxPhotoGridPlugin.filterFiles(allFiles, targetDate);

                    if (matchingFiles.length === 0) {
                        container.createEl('div', {
                            text: `No photos found for date: ${date}`,
                            attr: { style: 'text-align: center; padding: 20px;' }
                        });
                        return;
                    }

                    const grid = container.createEl('div', {
                        cls: 'photo-grid',
                        attr: { style: DropboxPhotoGridPlugin.getGridStyles() }
                    });

                    // Create all photo containers first
                    const photoContainers = matchingFiles.map(file => {
                        const container = grid.createEl('div', {
                            cls: 'photo-container',
                            attr: { style: DropboxPhotoGridPlugin.getPhotoContainerStyles() }
                        });
                        return { container, file };
                    });

                    // Then fetch and set all images
                    await Promise.all(photoContainers.map(async ({ container, file }) => {
                        if (!file.path_lower) return;

                        const response = await dbx.filesGetTemporaryLink({
                            path: file.path_lower
                        });

                        container.createEl('img', {
                            attr: {
                                src: response.result.link,
                                style: DropboxPhotoGridPlugin.getPhotoStyles()
                            }
                        });
                    }));

                } catch (error) {
                    console.error('Dropbox API error:', error);
                    container.createEl('div', {
                        text: `Error loading photos: ${error.message}`,
                        attr: { style: 'color: red; text-align: center; padding: 20px;' }
                    });
                }
            } catch (error) {
                console.error('Plugin error:', error);
                el.createEl('div', { text: `Error: ${error.message}` });
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class DropboxPhotoGridSettingTab extends PluginSettingTab {
    plugin: DropboxPhotoGridPlugin;

    constructor(app: App, plugin: DropboxPhotoGridPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Dropbox Access Token')
            .setDesc('Enter your Dropbox access token')
            .addText(text => text
                .setPlaceholder('Enter your token')
                .setValue(this.plugin.settings.accessToken)
                .onChange(async (value) => {
                    this.plugin.settings.accessToken = value;
                    await this.plugin.saveSettings();
                }));
    }
}
