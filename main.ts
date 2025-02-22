import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Dropbox } from 'dropbox';
import { MarkdownPostProcessorContext } from 'obsidian';

interface DropboxPhotoGridSettings {
    accessToken: string;
}

const DEFAULT_SETTINGS: DropboxPhotoGridSettings = {
    accessToken: ''
};

export default class DropboxPhotoGridPlugin extends Plugin {
    settings: DropboxPhotoGridSettings;
    dbx: Dropbox;

    async onload() {
        await this.loadSettings();
        
        // Initialize Dropbox client
        this.dbx = new Dropbox({ accessToken: this.settings.accessToken });

        // Add a settings tab
        this.addSettingTab(new DropboxPhotoGridSettingTab(this.app, this));

        // Register the markdown code block processor
        this.registerMarkdownCodeBlockProcessor('dropbox-photos', async (source, el, ctx: MarkdownPostProcessorContext) => {
            try {
                const [folderPath, date] = source.trim().split('\n');
                if (!folderPath || !date) {
                    throw new Error('Both folder path and date are required');
                }

                if (!this.settings.accessToken) {
                    el.createEl('div', { text: 'Please set your Dropbox access token in the settings' });
                    return;
                }

                const containerId = `dropbox-grid-${Date.now()}`;
                const container = el.createEl('div', { 
                    attr: { 
                        id: containerId,
                        class: 'dropbox-photo-grid'
                    } 
                });

                try {
                    // List files in the folder
                    const response = await this.dbx.filesListFolder({
                        path: folderPath,
                        include_media_info: true
                    });

                    // Filter files by date and only include images
                    const files = response.result.entries.filter(file => {
                        if (file['.tag'] !== 'file') return false;
                        if (!file.path_lower?.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/)) return false;
                        
                        const fileDate = new Date(file.client_modified);
                        const targetDate = new Date(date);
                        return fileDate.toDateString() === targetDate.toDateString();
                    });

                    // Create grid layout
                    const grid = container.createEl('div', { 
                        cls: 'photo-grid',
                        attr: {
                            style: `
                                display: grid;
                                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                                gap: 20px;
                                padding: 20px 0;
                            `
                        }
                    });

                    // Add photos to grid
                    for (const file of files) {
                        if (!file.path_lower) continue; // Skip if path is undefined
                        
                        const response = await this.dbx.filesGetTemporaryLink({
                            path: file.path_lower // TypeScript now knows this is not undefined
                        });

                        const photoContainer = grid.createEl('div', {
                            cls: 'photo-container',
                            attr: {
                                style: `
                                    aspect-ratio: 1;
                                    overflow: hidden;
                                    border-radius: 8px;
                                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                                    transition: transform 0.2s;
                                `
                            }
                        });

                        photoContainer.createEl('img', {
                            attr: {
                                src: response.result.link,
                                style: `
                                    width: 100%;
                                    height: 100%;
                                    object-fit: cover;
                                `
                            }
                        });
                    }

                    if (files.length === 0) {
                        container.createEl('div', { 
                            text: `No photos found for date: ${date}`,
                            attr: {
                                style: 'text-align: center; padding: 20px;'
                            }
                        });
                    }
                } catch (error) {
                    container.createEl('div', { 
                        text: `Error loading photos: ${error.message}`,
                        attr: {
                            style: 'color: red; text-align: center; padding: 20px;'
                        }
                    });
                }
            } catch (error) {
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
