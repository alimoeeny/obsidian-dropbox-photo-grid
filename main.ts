import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { Dropbox, files } from 'dropbox';
import * as http from 'http';

// Get electron modules
const electron = require('electron');
const { remote } = electron;

interface DropboxPhotoGridSettings {
    accessToken: string;
    refreshToken: string;
    clientId: string;
    codeVerifier: string;
}

const DEFAULT_SETTINGS: DropboxPhotoGridSettings = {
    accessToken: '',
    refreshToken: '',
    clientId: '',
    codeVerifier: ''
};

export default class DropboxPhotoGridPlugin extends Plugin {
    settings: DropboxPhotoGridSettings;
    dbx: Dropbox | null = null;

    // Pure function to create a fetch-compatible response from Obsidian's RequestUrlResponse
    private static createFetchResponse(response: RequestUrlResponse): Response {
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.status.toString(),
            headers: new Headers(response.headers),
            // Convert methods to proper async functions that return promises
            json: async () => Promise.resolve(response.json),
            text: async () => Promise.resolve(response.text),
            arrayBuffer: async () => Promise.resolve(response.arrayBuffer),
        } as unknown as Response;
    }

    private async getDropboxClient(): Promise<Dropbox> {
        if (!this.settings.clientId) {
            throw new Error('Dropbox client ID not set. Please set it in the plugin settings.');
        }

        // If we have a refresh token, use it to get a new access token
        if (this.settings.refreshToken) {
            try {
                const response = await requestUrl({
                    url: 'https://api.dropbox.com/oauth2/token',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: this.settings.refreshToken,
                        client_id: this.settings.clientId,
                    }).toString(),
                });

                if (response.status === 200) {
                    const data = response.json;
                    this.settings.accessToken = data.access_token;
                    await this.saveSettings();
                }
            } catch (error) {
                console.error('Error refreshing access token:', error);
            }
        }

        if (!this.settings.accessToken) {
            throw new Error('No valid Dropbox access token available. Please authenticate through the plugin settings.');
        }

        // Create a fetch-compatible function using Obsidian's requestUrl
        const obsidianFetch = async (url: string, init?: RequestInit): Promise<Response> => {
            try {
                // Create options object for requestUrl from fetch parameters
                const options: RequestUrlParam = {
                    url,
                    method: init?.method || 'GET',
                    headers: init?.headers as Record<string, string>,
                    body: init?.body as string,
                };
                
                const response = await requestUrl(options);
                
                // Use the pure function to create a Response-like object
                return DropboxPhotoGridPlugin.createFetchResponse(response);
            } catch (error) {
                console.error('Error in obsidianFetch:', error);
                throw error;
            }
        };

        return new Dropbox({
            accessToken: this.settings.accessToken,
            fetch: obsidianFetch
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

    // Pure function to get loading indicator styles
    private static getLoadingStyles(): string {
        return `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            gap: 10px;
        `;
    }

    // Pure function to get spinner styles
    private static getSpinnerStyles(): string {
        return `
            border: 3px solid var(--background-modifier-border);
            border-top: 3px solid var(--text-accent);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
        `;
    }

    // Pure function to get keyframes for spinner
    private static getSpinnerKeyframes(): string {
        return `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
    }

    // Pure function to get overlay modal styles
    private static getOverlayStyles(): string {
        return `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
    }

    // Pure function to get enlarged image styles
    private static getEnlargedImageStyles(): string {
        return `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `;
    }

    // Pure function to create the overlay for enlarged image view
    private static createImageOverlay(imageUrl: string): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'dropbox-photo-overlay';
        overlay.setAttribute('style', DropboxPhotoGridPlugin.getOverlayStyles());
        
        const enlargedImg = document.createElement('img');
        enlargedImg.src = imageUrl;
        enlargedImg.setAttribute('style', DropboxPhotoGridPlugin.getEnlargedImageStyles());
        
        overlay.appendChild(enlargedImg);
        
        // Add click event to close
        overlay.addEventListener('click', () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
            }, 300);
        });
        
        // Fade in the overlay
        document.body.appendChild(overlay);
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 10);
        
        return overlay;
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

        // Add spinner keyframes to document
        const style = document.createElement('style');
        const textNode = document.createTextNode(DropboxPhotoGridPlugin.getSpinnerKeyframes());
        style.appendChild(textNode);
        document.head.appendChild(style);

        this.registerMarkdownCodeBlockProcessor('dropbox-photos', async (source, el) => {
            try {
                const [folderPath, date] = source.trim().split('\n');
                if (!folderPath || !date) {
                    throw new Error('Both folder path and date are required');
                }

                if (!this.settings.clientId) {
                    el.createEl('div', { text: 'Please set your Dropbox client ID in the settings' });
                    return;
                }

                const container = el.createEl('div', {
                    attr: { class: 'dropbox-photo-grid' }
                });

                // Show loading indicator
                const loadingContainer = container.createEl('div', {
                    attr: { style: DropboxPhotoGridPlugin.getLoadingStyles() }
                });
                
                const spinner = loadingContainer.createEl('div', {
                    attr: { style: DropboxPhotoGridPlugin.getSpinnerStyles() }
                });
                
                loadingContainer.createEl('div', {
                    text: 'Loading photos from Dropbox...'
                });

                try {
                    const dbx = await this.getDropboxClient();
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

                    // Remove loading indicator
                    loadingContainer.remove();

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

                        const response = await requestUrl({
                            url: 'https://api.dropboxapi.com/2/files/get_temporary_link',
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${this.settings.accessToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                path: file.path_lower,
                            }),
                        });

                        if (response.status === 200) {
                            const data = response.json;
                            const img = container.createEl('img', {
                                attr: {
                                    src: data.link,
                                    style: DropboxPhotoGridPlugin.getPhotoStyles()
                                }
                            });
                            
                            // Add cursor pointer style to indicate it's clickable
                            img.style.cursor = 'pointer';
                            
                            // Add click event to show enlarged image
                            img.addEventListener('click', (e) => {
                                e.preventDefault();
                                DropboxPhotoGridPlugin.createImageOverlay(data.link);
                            });
                        }
                    }));

                } catch (error) {
                    // Remove loading indicator and show error
                    loadingContainer.remove();
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

        // Add plugin version information
        const versionInfo = containerEl.createEl('div', {
            cls: 'dropbox-photo-grid-version',
        });
        
        versionInfo.createEl('h2', {
            text: 'Dropbox Photo Grid',
        });
        
        // Get version from manifest
        const manifest = this.plugin.manifest;
        versionInfo.createEl('p', {
            text: `Version: ${manifest.version}`,
            attr: { style: 'margin-top: 0; color: var(--text-muted);' }
        });
        
        versionInfo.createEl('hr');

        new Setting(containerEl)
            .setName('Dropbox Client ID')
            .setDesc('Enter your Dropbox app client ID')
            .addText(text => text
                .setPlaceholder('Enter your client ID')
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Authenticate with Dropbox')
            .setDesc('Click to start OAuth flow')
            .addButton(button => button
                .setButtonText('Authenticate')
                .onClick(async () => {
                    if (!this.plugin.settings.clientId) {
                        new Notice('Please set your Client ID first');
                        return;
                    }

                    // Generate PKCE code verifier and challenge
                    const codeVerifier = this.generateCodeVerifier();
                    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

                    // Store code verifier temporarily
                    this.plugin.settings.codeVerifier = codeVerifier;
                    await this.plugin.saveSettings();

                    // Construct OAuth URL
                    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
                    authUrl.searchParams.append('client_id', this.plugin.settings.clientId);
                    authUrl.searchParams.append('response_type', 'code');
                    authUrl.searchParams.append('code_challenge', codeChallenge);
                    authUrl.searchParams.append('code_challenge_method', 'S256');
                    authUrl.searchParams.append('token_access_type', 'offline');
                    authUrl.searchParams.append('redirect_uri', 'http://localhost:53134/callback');

                    // Open OAuth window
                    window.open(authUrl.toString());

                    // Start local server to handle callback
                    this.startOAuthServer();
                }));

        if (this.plugin.settings.refreshToken) {
            new Setting(containerEl)
                .setName('Authentication Status')
                .setDesc('You are authenticated with Dropbox')
                .addButton(button => button
                    .setButtonText('Clear Authentication')
                    .onClick(async () => {
                        this.plugin.settings.accessToken = '';
                        this.plugin.settings.refreshToken = '';
                        await this.plugin.saveSettings();
                        this.display();
                    }));
        }
    }

    private generateCodeVerifier(): string {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    private async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    private async startOAuthServer() {
        const server = http.createServer(async (req, res) => {
            if (req.url?.startsWith('/callback')) {
                const url = new URL(req.url, 'http://localhost:53134');
                const code = url.searchParams.get('code');

                if (code) {
                    try {
                        // Exchange the code for tokens
                        const response = await requestUrl({
                            url: 'https://api.dropboxapi.com/oauth2/token',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: new URLSearchParams({
                                code,
                                grant_type: 'authorization_code',
                                client_id: this.plugin.settings.clientId,
                                code_verifier: this.plugin.settings.codeVerifier,
                                redirect_uri: 'http://localhost:53134/callback',
                            }).toString(),
                        });

                        if (response.status === 200) {
                            const data = response.json;
                            
                            // Store the tokens
                            this.plugin.settings.accessToken = data.access_token;
                            this.plugin.settings.refreshToken = data.refresh_token;
                            await this.plugin.saveSettings();

                            // Show success message
                            new Notice('Successfully authenticated with Dropbox!');
                            
                            // Update the settings UI
                            this.display();
                        } else {
                            new Notice('Failed to authenticate with Dropbox');
                            console.error('Token exchange failed:', response.text);
                        }
                    } catch (error) {
                        new Notice('Error during authentication');
                        console.error('Authentication error:', error);
                    }

                    // Send response to browser
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                            <body>
                                <h1>Authentication Complete</h1>
                                <p>You can close this window and return to Obsidian.</p>
                                <script>window.close()</script>
                            </body>
                        </html>
                    `);

                    // Close the server
                    server.close();
                }
            }
        });

        // Start listening on the port
        server.listen(53134, 'localhost', () => {
            console.log('OAuth callback server listening on port 53134');
        });

        // Handle server errors
        server.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                new Notice('Port 53134 is already in use. Please try again in a few moments.');
            } else {
                new Notice('Error starting OAuth server');
                console.error('Server error:', error);
            }
        });
    }
}
