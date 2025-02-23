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

    // Pure function to check if dates match
    private static datesMatch(fileDate: Date, targetDate: Date): boolean {
        return fileDate.toDateString() === targetDate.toDateString();
    }

    // Pure function to filter files by date and type
    private static filterFiles(files: files.FileMetadata[], targetDate: Date): files.FileMetadata[] {
        return files.filter(file => {
            // Check if it's a file (not a folder)
            if (!('path_lower' in file) || !file.path_lower) {
                return false;
            }
            if (!DropboxPhotoGridPlugin.isImageFile(file.path_lower)) {
                return false;
            }
            return DropboxPhotoGridPlugin.datesMatch(
                new Date(file.client_modified),
                targetDate
            );
        });
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
                    limit: 100
                });

            allFiles = allFiles.concat(response.result.entries as files.FileMetadata[]);
            hasMore = response.result.has_more;
            cursor = response.result.cursor;
        }

        return allFiles;
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
                    const allFiles = await this.getAllFiles(dbx, folderPath);
                    const targetDate = new Date(date);
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
