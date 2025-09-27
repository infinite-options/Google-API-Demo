import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { oauthConfig, getClientId, getRedirectUri } from "../config/oauth";

// Configure WebBrowser for better OAuth experience
WebBrowser.maybeCompleteAuthSession();

export interface GoogleProfile {
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  webViewLink: string;
  thumbnailLink?: string;
  imageMediaMetadata?: any;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  location?: string;
}

export interface PhotoItem {
  id: string;
  name: string;
  url: string;
  thumbnails: Array<{ url: string }>;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  creationTime?: string;
  width?: number;
  height?: number;
  imageMetadata?: any;
}

export interface PhotoPickerSession {
  id: string;
  pickerUri: string;
}

class GoogleApiService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  // Set access token
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  // Get access token
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Generate code verifier for PKCE
  private generateCodeVerifier(): string {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Generate code challenge from verifier
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
    return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  // Authenticate with Google OAuth
  async authenticate(): Promise<{ success: boolean; profile?: GoogleProfile; error?: string }> {
    try {
      const clientId = getClientId();
      const redirectUri = getRedirectUri();

      if (!clientId) {
        throw new Error("Client ID not configured for this platform");
      }

      if (!redirectUri) {
        throw new Error("Redirect URI not configured for this platform");
      }

      console.log("Starting OAuth flow with:", { clientId, redirectUri, platform: Platform.OS });

      if (Platform.OS === "web") {
        return await this.authenticateWeb(clientId, redirectUri);
      } else {
        return await this.authenticateMobile(clientId, redirectUri);
      }
    } catch (error) {
      console.error("Authentication error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  // Web authentication using PKCE
  private async authenticateWeb(clientId: string, redirectUri: string): Promise<{ success: boolean; profile?: GoogleProfile; error?: string }> {
    try {
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);

      // Store code verifier for later use
      if (typeof window !== "undefined") {
        sessionStorage.setItem("code_verifier", codeVerifier);
      }

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `response_type=code&` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(oauthConfig.scopes.join(" "))}&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256&` +
        `include_granted_scopes=true&` +
        `access_type=offline&` +
        `prompt=consent`;

      console.log("Opening auth URL:", authUrl);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");

        if (code) {
          return await this.exchangeCodeForToken(code, codeVerifier, clientId, redirectUri);
        }
      }

      return { success: false, error: "Authentication was cancelled or failed" };
    } catch (error) {
      console.error("Web authentication error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Web authentication failed" };
    }
  }

  // Mobile authentication using AuthSession
  private async authenticateMobile(clientId: string, redirectUri: string): Promise<{ success: boolean; profile?: GoogleProfile; error?: string }> {
    try {
      const discovery = {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
      };

      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: oauthConfig.scopes,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        extraParams: {
          access_type: "offline",
          prompt: "consent",
        },
      });

      const result = await request.promptAsync(discovery);

      if (result.type === "success" && result.params?.code) {
        return await this.exchangeCodeForTokenMobile(result.params.code, clientId, redirectUri);
      }

      return { success: false, error: "Authentication was cancelled or failed" };
    } catch (error) {
      console.error("Mobile authentication error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Mobile authentication failed" };
    }
  }

  // Exchange authorization code for access token (Web)
  private async exchangeCodeForToken(code: string, codeVerifier: string, clientId: string, redirectUri: string): Promise<{ success: boolean; profile?: GoogleProfile; error?: string }> {
    try {
      const body = new URLSearchParams();
      body.append("client_id", clientId);
      body.append("grant_type", "authorization_code");
      body.append("code", code);
      body.append("redirect_uri", redirectUri);
      body.append("code_verifier", codeVerifier);
      body.append("client_secret", oauthConfig.clientSecret || "");

      const response = await fetch(oauthConfig.endpoints.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      const data = await response.json();

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;

        const profile = await this.fetchProfile();
        return { success: true, profile };
      } else {
        return { success: false, error: data.error_description || "Failed to get access token" };
      }
    } catch (error) {
      console.error("Token exchange error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Token exchange failed" };
    }
  }

  // Exchange authorization code for access token (Mobile)
  private async exchangeCodeForTokenMobile(code: string, clientId: string, redirectUri: string): Promise<{ success: boolean; profile?: GoogleProfile; error?: string }> {
    try {
      const body = new URLSearchParams();
      body.append("client_id", clientId);
      body.append("grant_type", "authorization_code");
      body.append("code", code);
      body.append("redirect_uri", redirectUri);

      const response = await fetch(oauthConfig.endpoints.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      const data = await response.json();

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;

        const profile = await this.fetchProfile();
        return { success: true, profile };
      } else {
        return { success: false, error: data.error_description || "Failed to get access token" };
      }
    } catch (error) {
      console.error("Token exchange error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Token exchange failed" };
    }
  }

  // Fetch user profile
  async fetchProfile(): Promise<GoogleProfile> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    const response = await fetch(oauthConfig.endpoints.userInfo, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    return await response.json();
  }

  // Fetch Drive files
  async fetchDriveFiles(): Promise<{ files: DriveFile[] }> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    const url = `${oauthConfig.endpoints.drive}?pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink,imageMediaMetadata)&orderBy=modifiedTime desc`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Drive files: ${response.status}`);
    }

    return await response.json();
  }

  // Fetch Calendar events
  async fetchCalendarEvents(date: string): Promise<{ items: CalendarEvent[] }> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    const timeMin = `${date}T00:00:00Z`;
    const timeMax = `${date}T23:59:59Z`;
    const url = `${oauthConfig.endpoints.calendar}?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=20&singleEvents=true&orderBy=startTime`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Calendar events: ${response.status}`);
    }

    return await response.json();
  }

  // Fetch photos from Drive
  async fetchDrivePhotos(): Promise<PhotoItem[]> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    const url = `${oauthConfig.endpoints.drive}?q=mimeType contains 'image/'&pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink,imageMediaMetadata,webContentLink)&orderBy=modifiedTime desc`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Drive photos: ${response.status}`);
    }

    const data = await response.json();

    return (
      data.files?.map((file: any) => ({
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        thumbnails: file.thumbnailLink ? [{ url: file.thumbnailLink }] : [],
        mimeType: file.mimeType,
        size: file.size,
        modifiedTime: file.modifiedTime,
        imageMetadata: file.imageMediaMetadata,
      })) || []
    );
  }

  // Create Photo Picker session
  async createPhotoPickerSession(): Promise<PhotoPickerSession> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    const response = await fetch(`${oauthConfig.endpoints.photoPicker}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Photo Picker session error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
    }

    const sessionData = await response.json();
    console.log("Photo Picker session created:", sessionData);
    console.log("Session ID:", sessionData.id);
    console.log("Picker URI:", sessionData.pickerUri);
    return sessionData;
  }

  // Fetch selected photos from Photo Picker
  async fetchSelectedPhotos(sessionId: string, retryCount = 0): Promise<PhotoItem[]> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    try {
      const response = await fetch(`${oauthConfig.endpoints.photoPicker}/mediaItems?sessionId=${sessionId}&pageSize=25`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.error?.status === "FAILED_PRECONDITION" && retryCount < 3) {
          // Retry with increasing delays
          const delay = (retryCount + 1) * 2000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return await this.fetchSelectedPhotos(sessionId, retryCount + 1);
        }

        throw new Error(`Photo Picker API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
      }

      const data = await response.json();
      const photos: PhotoItem[] = [];

      for (const item of data.mediaItems || []) {
        const baseUrl = item.mediaFile?.baseUrl;

        if (baseUrl) {
          // Create thumbnail URL with proper sizing
          const thumbnailUrl = baseUrl + "=w200-h200";

          const photo: PhotoItem = {
            id: item.id,
            name: item.mediaFile?.filename || `Photo ${item.id}`,
            url: baseUrl,
            thumbnails: [{ url: thumbnailUrl }],
            mimeType: item.mediaFile?.mimeType,
            creationTime: item.createTime,
            width: item.mediaFileMetadata?.width,
            height: item.mediaFileMetadata?.height,
          };
          photos.push(photo);

          console.log("Photo item created:", {
            id: photo.id,
            name: photo.name,
            thumbnailUrl: photo.thumbnails[0].url,
            baseUrl: photo.url,
          });
        }
      }

      return photos;
    } catch (error) {
      console.error("Error fetching selected photos:", error);
      throw error;
    }
  }

  // Open Photo Picker (Web only)
  async openPhotoPicker(): Promise<PhotoItem[]> {
    if (Platform.OS !== "web") {
      throw new Error("Photo Picker is only available on web platform");
    }

    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    try {
      const session = await this.createPhotoPickerSession();

      if (!session.pickerUri) {
        throw new Error("Failed to get picker URI");
      }

      // Open picker in new window
      const pickerWindow = window.open(session.pickerUri, "_blank", "width=800,height=600");

      if (!pickerWindow) {
        throw new Error("Failed to open picker window");
      }

      // Wait for window to close and fetch photos
      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(async () => {
          if (pickerWindow.closed) {
            clearInterval(checkClosed);

            // Wait for session to update
            setTimeout(async () => {
              try {
                const photos = await this.fetchSelectedPhotos(session.id);
                resolve(photos);
              } catch (error) {
                reject(error);
              }
            }, 3000);
          }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkClosed);
          reject(new Error("Photo picker timeout"));
        }, 30000);
      });
    } catch (error) {
      console.error("Error opening Photo Picker:", error);
      throw error;
    }
  }
}

export default new GoogleApiService();
