class DropboxThumbnailViewer {
    constructor(containerId, accessToken) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with ID '${containerId}' not found`);
        }
        this.dbx = new Dropbox.Dropbox({ accessToken });
        this.initializeStyles();
    }

    initializeStyles() {
        // Add required styles if they don't exist
        if (!document.getElementById('dropbox-thumbnail-styles')) {
            const styles = `
                .dbx-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 20px;
                    padding: 20px 0;
                }
                .dbx-card {
                    background-color: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: transform 0.2s;
                }
                .dbx-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                }
                .dbx-thumbnail-container {
                    position: relative;
                    padding-top: 100%;
                    background-color: #f5f5f5;
                }
                .dbx-thumbnail {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .dbx-file-info {
                    padding: 10px;
                }
                .dbx-file-name {
                    font-size: 14px;
                    margin-bottom: 5px;
                    word-break: break-word;
                }
                .dbx-file-size {
                    font-size: 12px;
                    color: #666;
                }
                .dbx-placeholder {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #999;
                    font-size: 12px;
                    text-align: center;
                }
                .dbx-loading {
                    text-align: center;
                    padding: 20px;
                    font-size: 16px;
                    color: #666;
                }
            `;
            const styleSheet = document.createElement('style');
            styleSheet.id = 'dropbox-thumbnail-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    isSameDate(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    async displayThumbnails(folderPath, date) {
        // Clear the container
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        // Show loading message
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'dbx-loading';
        loadingDiv.textContent = 'Loading files...';
        this.container.appendChild(loadingDiv);
        
        const targetDate = new Date(date);

        try {
            // Get files from the folder
            const files = await this.getFilesForDate(folderPath, targetDate);
            
            if (files.length === 0) {
                // Clear the container
                while (this.container.firstChild) {
                    this.container.removeChild(this.container.firstChild);
                }
                
                // Show no files message
                const noFilesDiv = document.createElement('div');
                noFilesDiv.className = 'dbx-loading';
                noFilesDiv.textContent = 'No files found for the selected date.';
                this.container.appendChild(noFilesDiv);
                return;
            }

            // Create grid container
            const grid = document.createElement('div');
            grid.className = 'dbx-grid';

            // Process each file
            for (const file of files) {
                const card = await this.createFileCard(file);
                grid.appendChild(card);
            }

            // Clear the container
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }
            this.container.appendChild(grid);

        } catch (error) {
            console.error('Error:', error);
            
            // Clear the container
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }
            
            // Show error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'dbx-loading';
            errorDiv.textContent = `Error: ${error.message}`;
            this.container.appendChild(errorDiv);
        }
    }

    async getFilesForDate(folderPath, targetDate) {
        let files = [];
        let response = await this.dbx.filesListFolder({path: folderPath});
        
        while (true) {
            for (const entry of response.result.entries) {
                if (entry['.tag'] === 'file') {
                    const fileDate = new Date(entry.client_modified);
                    if (this.isSameDate(fileDate, targetDate)) {
                        files.push(entry);
                    }
                }
            }

            if (!response.result.has_more) {
                break;
            }

            response = await this.dbx.filesListFolderContinue({
                cursor: response.result.cursor
            });
        }

        return files;
    }

    async createFileCard(file) {
        const card = document.createElement('div');
        card.className = 'dbx-card';

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'dbx-thumbnail-container';

        try {
            if (file.path_lower.match(/\.(jpg|jpeg|png|gif|heic)$/i)) {
                const thumbnail = await this.dbx.filesGetThumbnail({
                    path: file.path_lower,
                    format: 'jpeg',
                    size: 'w256h256',
                    mode: 'strict'
                });

                const img = document.createElement('img');
                img.className = 'dbx-thumbnail';
                img.src = URL.createObjectURL(thumbnail.result.fileBlob);
                thumbnailContainer.appendChild(img);
            } else {
                this.addPlaceholder(thumbnailContainer, 'No preview available');
            }
        } catch (error) {
            console.error('Error fetching thumbnail:', error);
            this.addPlaceholder(thumbnailContainer, 'Preview failed');
        }

        const fileInfo = document.createElement('div');
        fileInfo.className = 'dbx-file-info';

        const fileName = document.createElement('div');
        fileName.className = 'dbx-file-name';
        fileName.textContent = file.name;

        const fileSize = document.createElement('div');
        fileSize.className = 'dbx-file-size';
        fileSize.textContent = this.formatBytes(file.size);

        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);

        card.appendChild(thumbnailContainer);
        card.appendChild(fileInfo);

        return card;
    }

    addPlaceholder(container, text) {
        const placeholder = document.createElement('div');
        placeholder.className = 'dbx-placeholder';
        placeholder.textContent = text;
        container.appendChild(placeholder);
    }
}

// Example usage:
// const viewer = new DropboxThumbnailViewer('container-id', 'your-access-token');
// viewer.displayThumbnails('/path/to/folder', '2023-11-15');
