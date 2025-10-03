const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Store active sessions (in production, use Redis or database)
const activeSessions = new Map();

// Utility functions
function base64urlencode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateCodeVerifier() {
  return base64urlencode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64urlencode(crypto.createHash("sha256").update(verifier).digest());
}

// Routes

// 1. Get OAuth URL (replaces frontend OAuth URL generation)
app.get("/api/oauth/url", (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store code verifier for later use
    const sessionId = crypto.randomUUID();
    activeSessions.set(sessionId, { codeVerifier, timestamp: Date.now() });

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `response_type=code&` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(
        "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/photoslibrary.readonly https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
      )}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256&` +
      `include_granted_scopes=true&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${sessionId}`;

    res.json({
      authUrl,
      sessionId,
      message: "Use this URL to redirect user to Google OAuth",
    });
  } catch (error) {
    console.error("Error generating OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// 2. Exchange code for token (secure server-side exchange)
app.post("/api/oauth/token", async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    // Retrieve code verifier from session
    const session = activeSessions.get(state);
    if (!session) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const { codeVerifier } = session;

    // Exchange code for token
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: process.env.REDIRECT_URI,
        code_verifier: codeVerifier,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Clean up session
    activeSessions.delete(state);

    res.json({
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token,
      expires_in: tokenResponse.data.expires_in,
      scope: tokenResponse.data.scope,
    });
  } catch (error) {
    console.error("Token exchange error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Token exchange failed",
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// 3. Get user profile
app.get("/api/user/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const response = await axios.get("https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Profile fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch profile",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 4. Get Drive files
app.get("/api/drive/files", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        pageSize: 20,
        fields: "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink,imageMediaMetadata)",
        orderBy: "modifiedTime desc",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Drive files fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Drive files",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 5. Get Calendar events
app.get("/api/calendar/events", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Date parameter is required" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const timeMin = `${date}T00:00:00Z`;
    const timeMax = `${date}T23:59:59Z`;

    const response = await axios.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      params: {
        timeMin,
        timeMax,
        maxResults: 20,
        singleEvents: true,
        orderBy: "startTime",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Calendar events fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Calendar events",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 6. Get Drive photos
app.get("/api/drive/photos", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        q: "mimeType contains 'image/'",
        pageSize: 20,
        fields: "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink,imageMediaMetadata,webContentLink)",
        orderBy: "modifiedTime desc",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Transform the data
    const photos =
      response.data.files?.map((file) => ({
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        thumbnails: file.thumbnailLink ? [{ url: file.thumbnailLink }] : [],
        mimeType: file.mimeType,
        size: file.size,
        modifiedTime: file.modifiedTime,
        imageMetadata: file.imageMediaMetadata,
      })) || [];

    res.json({ photos });
  } catch (error) {
    console.error("Drive photos fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Drive photos",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 7. Create Photo Picker session
app.post("/api/photos/picker/session", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const response = await axios.post(
      "https://photospicker.googleapis.com/v1/sessions",
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Photo Picker session creation error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create Photo Picker session",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 8. Get selected photos from Photo Picker
app.get("/api/photos/picker/media", async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const accessToken = authHeader.split(" ")[1];

    const response = await axios.get("https://photospicker.googleapis.com/v1/mediaItems", {
      params: {
        sessionId,
        pageSize: 25,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Transform the data
    const photos = [];
    for (const item of response.data.mediaItems || []) {
      const baseUrl = item.mediaFile?.baseUrl;
      if (baseUrl) {
        const thumbnailUrl = baseUrl + "=w200-h200";
        photos.push({
          id: item.id,
          name: item.mediaFile?.filename || `Photo ${item.id}`,
          url: baseUrl,
          thumbnails: [{ url: thumbnailUrl }],
          mimeType: item.mediaFile?.mimeType,
          creationTime: item.createTime,
          width: item.mediaFileMetadata?.width,
          height: item.mediaFileMetadata?.height,
        });
      }
    }

    res.json({ photos });
  } catch (error) {
    console.error("Photo Picker media fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch selected photos",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Google API Demo Backend is running" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📱 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`🔐 Client secret is safely stored on the server`);
});

module.exports = app;
