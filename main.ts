import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import { Dropbox, files } from "dropbox";
import * as http from "http";
import EXIF from "exif-js";

// Get electron modules
const electron = require("electron");
const { remote } = electron;

interface DropboxPhotoGridSettings {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  codeVerifier: string;
}

const DEFAULT_SETTINGS: DropboxPhotoGridSettings = {
  accessToken: "",
  refreshToken: "",
  clientId: "",
  codeVerifier: "",
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
      throw new Error("Dropbox client ID not set. Please set it in the plugin settings.");
    }

    // If we have a refresh token, use it to get a new access token
    if (this.settings.refreshToken) {
      try {
        const response = await requestUrl({
          url: "https://api.dropbox.com/oauth2/token",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
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
        console.error("Error refreshing access token:", error);
      }
    }

    if (!this.settings.accessToken) {
      throw new Error("No valid Dropbox access token available. Please authenticate through the plugin settings.");
    }

    // Create a fetch-compatible function using Obsidian's requestUrl
    const obsidianFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      try {
        // Create options object for requestUrl from fetch parameters
        const options: RequestUrlParam = {
          url,
          method: init?.method || "GET",
          headers: init?.headers as Record<string, string>,
          body: init?.body as string,
        };

        const response = await requestUrl(options);

        // Use the pure function to create a Response-like object
        return DropboxPhotoGridPlugin.createFetchResponse(response);
      } catch (error) {
        console.error("Error in obsidianFetch:", error);
        throw error;
      }
    };

    return new Dropbox({
      accessToken: this.settings.accessToken,
      fetch: obsidianFetch,
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

    const matches = fileYear === targetYear && fileMonth === targetMonth && fileDay === targetDay;

    return matches;
  }

  // Pure function to filter files by date and type
  private static filterFiles(files: files.FileMetadata[], targetDate: Date): files.FileMetadata[] {
    const matchingFiles = files.filter((file) => {
      if (!("path_lower" in file) || !file.path_lower) {
        return false;
      }
      if (!DropboxPhotoGridPlugin.isImageFile(file.path_lower)) {
        return false;
      }

      const fileDate = new Date(file.client_modified);
      return DropboxPhotoGridPlugin.datesMatch(fileDate, targetDate);
    });

    return matchingFiles;
  }

  // Pure function to check if path is a direct file path
  private static isDirectFilePath(path: string): boolean {
    return path.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) !== null;
  }

  // Create the overlay for enlarged image view with navigation
  private static createImageOverlay(imageUrl: string, filename: string, currentIndex: number, allImageUrls: string[]): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "dropbox-photo-overlay";

    const enlargedImg = document.createElement("img");
    enlargedImg.src = imageUrl;

    overlay.appendChild(enlargedImg);

    // Create metadata panel
    const metadataPanel = document.createElement("div");
    metadataPanel.className = "dropbox-photo-metadata-panel";
    metadataPanel.style.display = "none";
    overlay.appendChild(metadataPanel);

    // Add click event to close (only when clicking outside the metadata panel)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target === enlargedImg) {
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
        }, 300);
      }
    });

    // Track if metadata has been loaded
    let metadataLoaded = false;

    // Add keyboard navigation
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        // Navigate to next image
        const nextIndex = (currentIndex + 1) % allImageUrls.length;
        const nextUrl = allImageUrls[nextIndex];

        // Replace current image
        enlargedImg.src = nextUrl;

        // Update current index for future navigation
        currentIndex = nextIndex;

        // Reset metadata state for new image
        metadataLoaded = false;
        if (metadataPanel.style.display === "block") {
          metadataPanel.innerHTML = "<div class='metadata-loading'>Loading metadata...</div>";
        }
      } else if (e.key === "ArrowLeft") {
        // Navigate to previous image
        const prevIndex = (currentIndex - 1 + allImageUrls.length) % allImageUrls.length;
        const prevUrl = allImageUrls[prevIndex];

        // Replace current image
        enlargedImg.src = prevUrl;

        // Update current index for future navigation
        currentIndex = prevIndex;

        // Reset metadata state for new image
        metadataLoaded = false;
        if (metadataPanel.style.display === "block") {
          metadataPanel.innerHTML = "<div class='metadata-loading'>Loading metadata...</div>";
        }
      } else if (e.key === "Escape") {
        // Close overlay on Escape key
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
        }, 300);
      } else if (e.key === "i" || e.key === "I") {
        // Toggle metadata panel
        if (metadataPanel.style.display === "none") {
          metadataPanel.style.display = "block";

          // Only load metadata if not already loaded
          if (!metadataLoaded) {
            metadataPanel.innerHTML = "<div class='metadata-loading'>Loading metadata...</div>";

            try {
              // Get the current image URL
              const currentUrl = enlargedImg.src;

              // Extract basic information from the current image
              const naturalWidth = enlargedImg.naturalWidth;
              const naturalHeight = enlargedImg.naturalHeight;

              // Format the metadata for display without making API calls
              let metadataHtml = "<h3>Image Information</h3>";

              // Basic image info
              metadataHtml += "<div class='metadata-section'>";

              // Filename
              metadataHtml += `<div class='metadata-item'><span class='metadata-label'>Filename:</span> ${filename}</div>`;

              // Image dimensions
              metadataHtml += `<div class='metadata-item'><span class='metadata-label'>Dimensions:</span> ${naturalWidth} x ${naturalHeight} pixels</div>`;

              // Current date/time (as a fallback)
              const now = new Date();
              metadataHtml += `<div class='metadata-item'><span class='metadata-label'>Viewed on:</span> ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>`;

              metadataHtml += "</div>";

              // Location data
              let locationHtml = "";
              EXIF.getData(currentUrl, function () {
                const latitude = EXIF.getTag(this, "GPSLatitude");
                const longitude = EXIF.getTag(this, "GPSLongitude");
                const latitudeRef = EXIF.getTag(this, "GPSLatitudeRef");
                const longitudeRef = EXIF.getTag(this, "GPSLongitudeRef");

                if (latitude && longitude) {
                  let lat = latitude[0] + latitude[1] / 60 + latitude[2] / 3600;
                  let lon = longitude[0] + longitude[1] / 60 + longitude[2] / 3600;

                  if (latitudeRef === "S") {
                    lat = -lat;
                  }
                  if (longitudeRef === "W") {
                    lon = -lon;
                  }

                  locationHtml += "<div class='metadata-section'>";
                  locationHtml += "<h4>Location Information</h4>";
                  locationHtml += `<div class='metadata-item'><span class='metadata-label'>Latitude:</span> ${lat}</div>`;
                  locationHtml += `<div class='metadata-item'><span class='metadata-label'>Longitude:</span> ${lon}</div>`;
                  locationHtml += "</div>";
                }
              });

              metadataHtml += locationHtml;

              // Note about extended metadata
              metadataHtml += "<div class='metadata-note'>";
              metadataHtml += "Note: EXIF data is extracted locally. Location data may not be available for all images.";
              metadataHtml += "</div>";

              metadataPanel.innerHTML = metadataHtml;
              metadataLoaded = true;
            } catch (error) {
              console.error("Error loading metadata:", error);
              metadataPanel.innerHTML = "<div class='metadata-error'>Error loading metadata.</div>";
            }
          }
        } else {
          metadataPanel.style.display = "none";
        }
      }
    };

    // Add keyboard event listener
    document.addEventListener("keydown", keyHandler);

    // Remove event listener when overlay is closed
    overlay.addEventListener("remove", () => {
      document.removeEventListener("keydown", keyHandler);
    });

    // Fade in the overlay
    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.style.opacity = "1";
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
            limit: 1000,
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
        path: path,
      });
      return response.result as files.FileMetadata;
    } catch (error) {
      console.error("Error getting file metadata:", error);
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

    this.registerMarkdownCodeBlockProcessor("dropbox-photos", async (source, el) => {
      try {
        const [folderPath, date] = source.trim().split("\n");
        if (!folderPath || !date) {
          throw new Error("Both folder path and date are required");
        }

        if (!this.settings.clientId) {
          el.createEl("div", { text: "Please set your Dropbox client ID in the settings" });
          return;
        }

        const container = el.createEl("div", {
          cls: "dropbox-photo-grid",
        });

        // Show loading indicator
        const loadingContainer = container.createEl("div", {
          cls: "loading-container",
        });

        const spinner = loadingContainer.createEl("div", {
          cls: "spinner",
        });

        loadingContainer.createEl("div", {
          text: "Loading photos from Dropbox...",
        });

        try {
          const dbx = await this.getDropboxClient();
          const allFiles = await this.getFiles(dbx, folderPath);

          const targetDate = DropboxPhotoGridPlugin.parseDate(date);

          const matchingFiles = DropboxPhotoGridPlugin.filterFiles(allFiles, targetDate);

          // Remove loading indicator
          loadingContainer.remove();

          if (matchingFiles.length === 0) {
            container.createEl("div", {
              text: `No photos found for date: ${date}`,
              attr: { style: "text-align: center; padding: 20px;" },
            });
            return;
          }

          const grid = container.createEl("div", {
            cls: "photo-grid",
          });

          // Create all photo containers first
          const photoContainers = matchingFiles.map((file) => {
            const container = grid.createEl("div", {
              cls: "photo-container",
            });
            return { container, file };
          });

          // Then fetch and set all images
          await Promise.all(
            photoContainers.map(async ({ container, file }) => {
              if (!file.path_lower) return;

              const response = await requestUrl({
                url: "https://api.dropboxapi.com/2/files/get_temporary_link",
                method: "POST",
                headers: {
                  Authorization: `Bearer ${this.settings.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  path: file.path_lower,
                }),
              });

              if (response.status === 200) {
                const data = response.json;
                const img = container.createEl("img");
                img.src = data.link;

                // Add click event to show enlarged image
                img.addEventListener("click", (e) => {
                  e.preventDefault();

                  // Collect all image URLs for navigation
                  const allImageUrls: string[] = [];
                  let currentIndex = 0;

                  // Find all images in the grid and collect their URLs
                  const allImages = grid.querySelectorAll("img");
                  allImages.forEach((image, index) => {
                    allImageUrls.push(image.src);
                    // If this is the clicked image, store its index
                    if (image === e.target) {
                      currentIndex = index;
                    }
                  });

                  DropboxPhotoGridPlugin.createImageOverlay(data.link, file.name, currentIndex, allImageUrls);
                });
              }
            })
          );
        } catch (error) {
          // Remove loading indicator and show error
          loadingContainer.remove();
          console.error("Dropbox API error:", error);
          container.createEl("div", {
            text: `Error loading photos: ${error.message}`,
            attr: { style: "color: red; text-align: center; padding: 20px;" },
          });
        }
      } catch (error) {
        console.error("Plugin error:", error);
        el.createEl("div", { text: `Error: ${error.message}` });
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
      .setName("Dropbox client ID")
      .setDesc("Enter your Dropbox app client ID")
      .addText((text) =>
        text
          .setPlaceholder("Enter your client ID")
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            this.plugin.settings.clientId = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Authenticate with Dropbox")
      .setDesc("Click to start OAuth flow")
      .addButton((button) =>
        button.setButtonText("Authenticate").onClick(async () => {
          if (!this.plugin.settings.clientId) {
            new Notice("Please set your Client ID first");
            return;
          }

          // Generate PKCE code verifier and challenge
          const codeVerifier = this.generateCodeVerifier();
          const codeChallenge = await this.generateCodeChallenge(codeVerifier);

          // Store code verifier temporarily
          this.plugin.settings.codeVerifier = codeVerifier;
          await this.plugin.saveSettings();

          // Construct OAuth URL
          const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
          authUrl.searchParams.append("client_id", this.plugin.settings.clientId);
          authUrl.searchParams.append("response_type", "code");
          authUrl.searchParams.append("code_challenge", codeChallenge);
          authUrl.searchParams.append("code_challenge_method", "S256");
          authUrl.searchParams.append("token_access_type", "offline");
          authUrl.searchParams.append("redirect_uri", "http://localhost:53134/callback");

          // Open OAuth window
          window.open(authUrl.toString());

          // Start local server to handle callback
          this.startOAuthServer();
        })
      );

    if (this.plugin.settings.refreshToken) {
      new Setting(containerEl)
        .setName("Authentication status")
        .setDesc("You are authenticated with Dropbox")
        .addButton((button) =>
          button.setButtonText("Clear Authentication").onClick(async () => {
            this.plugin.settings.accessToken = "";
            this.plugin.settings.refreshToken = "";
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private async startOAuthServer() {
    const server = http.createServer(async (req, res) => {
      if (req.url?.startsWith("/callback")) {
        const url = new URL(req.url, "http://localhost:53134");
        const code = url.searchParams.get("code");

        if (code) {
          try {
            // Exchange the code for tokens
            const response = await requestUrl({
              url: "https://api.dropboxapi.com/oauth2/token",
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                code,
                grant_type: "authorization_code",
                client_id: this.plugin.settings.clientId,
                code_verifier: this.plugin.settings.codeVerifier,
                redirect_uri: "http://localhost:53134/callback",
              }).toString(),
            });

            if (response.status === 200) {
              const data = response.json;

              // Store the tokens
              this.plugin.settings.accessToken = data.access_token;
              this.plugin.settings.refreshToken = data.refreshToken;
              await this.plugin.saveSettings();

              // Show success message
              new Notice("Successfully authenticated with Dropbox!");

              // Update the settings UI
              this.display();
            } else {
              new Notice("Failed to authenticate with Dropbox");
              console.error("Token exchange failed:", response.text);
            }
          } catch (error) {
            new Notice("Error during authentication");
            console.error("Authentication error:", error);
          }

          // Send response to browser
          res.writeHead(200, { "Content-Type": "text/html" });
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
    server.listen(53134, "localhost", () => {});

    // Handle server errors
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        new Notice("Port 53134 is already in use. Please try again in a few moments.");
      } else {
        new Notice("Error starting OAuth server");
        console.error("Server error:", error);
      }
    });
  }
}
