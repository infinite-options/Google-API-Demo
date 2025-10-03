const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// CORS configuration for mobile apps
app.use(
  cors({
    origin: [
      "http://localhost:3000", // Web development
      "http://localhost:8081", // Expo web
      "exp://localhost:19000", // Expo development
      "exp://192.168.1.100:19000", // Expo on local network
      // Add your production domains here
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Store active sessions (in production, use Redis)
const activeSessions = new Map();
const userTokens = new Map(); // Store user access tokens

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

// Middleware to validate mobile app requests
const validateMobileRequest = (req, res, next) => {
  const userAgent = req.headers["user-agent"] || "";
  const isMobileApp = userAgent.includes("Expo") || userAgent.includes("ReactNative");

  if (!isMobileApp && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "This API is for mobile apps only" });
  }

  next();
};

// Apply mobile validation to all routes except health check
app.use("/api", validateMobileRequest);

// Routes

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Google API Demo Mobile Backend is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 2. Get OAuth URL for mobile
app.get("/api/oauth/url", (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store code verifier for later use
    const sessionId = crypto.randomUUID();
    activeSessions.set(sessionId, {
      codeVerifier,
      timestamp: Date.now(),
      userAgent: req.headers["user-agent"] || "unknown",
    });

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `response_type=code&` +
      `client_id=${process.env.REACT_APP_GOOGLE_CLIENT_ID_WEB}&` +
      `redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(
        "https://www.googleapis.com/auth/userinfo.profile " +
          "https://www.googleapis.com/auth/userinfo.email " +
          "https://www.googleapis.com/auth/drive.readonly " +
          "https://www.googleapis.com/auth/calendar.readonly " +
          "https://www.googleapis.com/auth/photoslibrary.readonly " +
          "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
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
      message: "Use this URL for OAuth flow",
      expiresIn: 600, // 10 minutes
    });
  } catch (error) {
    console.error("Error generating OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// 3. Exchange code for token
app.post("/api/oauth/token", async (req, res) => {
  try {
    const { code, state, userId } = req.body;

    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    // Retrieve code verifier from session
    const session = activeSessions.get(state);
    if (!session) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    // Check if session is expired (10 minutes)
    if (Date.now() - session.timestamp > 600000) {
      activeSessions.delete(state);
      return res.status(400).json({ error: "Session expired" });
    }

    const { codeVerifier } = session;

    // Exchange code for token
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID_WEB,
        client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET_WEB,
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

    // Store user token (in production, use secure database)
    const userTokenId = userId || crypto.randomUUID();
    userTokens.set(userTokenId, {
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token,
      expires_at: Date.now() + tokenResponse.data.expires_in * 1000,
      user_id: userTokenId,
    });

    res.json({
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token,
      expires_in: tokenResponse.data.expires_in,
      scope: tokenResponse.data.scope,
      user_id: userTokenId,
    });
  } catch (error) {
    console.error("Token exchange error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Token exchange failed",
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// 4. Get user profile
app.get("/api/user/profile", async (req, res) => {
  try {
    const { user_id } = req.query;
    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const response = await axios.get("https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos", {
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

// 5. Get Drive files
app.get("/api/drive/files", async (req, res) => {
  try {
    const { user_id, pageSize = 20 } = req.query;
    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        pageSize: parseInt(pageSize),
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

// 6. Get Calendar events
app.get("/api/calendar/events", async (req, res) => {
  try {
    const { date, user_id } = req.query;
    if (!date) {
      return res.status(400).json({ error: "Date parameter is required" });
    }

    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

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

// 7. Get Drive photos
app.get("/api/drive/photos", async (req, res) => {
  try {
    const { user_id, pageSize = 20 } = req.query;
    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
      params: {
        q: "mimeType contains 'image/'",
        pageSize: parseInt(pageSize),
        fields: "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,thumbnailLink,imageMediaMetadata,webContentLink)",
        orderBy: "modifiedTime desc",
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Transform the data for mobile
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

    res.json({ photos, totalCount: photos.length });
  } catch (error) {
    console.error("Drive photos fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Drive photos",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 8. Create Photo Picker session
app.post("/api/photos/picker/session", async (req, res) => {
  try {
    const { user_id } = req.body;
    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

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

// 9. Get selected photos from Photo Picker
app.get("/api/photos/picker/media", async (req, res) => {
  try {
    const { sessionId, user_id, pageSize = 25 } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const response = await axios.get("https://photospicker.googleapis.com/v1/mediaItems", {
      params: {
        sessionId,
        pageSize: parseInt(pageSize),
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Transform the data for mobile
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

    res.json({
      photos,
      totalCount: photos.length,
      sessionId: sessionId,
    });
  } catch (error) {
    console.error("Photo Picker media fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch selected photos",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 10. Get Photo Picker URL for WebView
app.get("/api/photos/picker/url", async (req, res) => {
  try {
    const { user_id } = req.query;
    const authHeader = req.headers.authorization;

    let accessToken;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.split(" ")[1];
    } else if (user_id) {
      const userToken = userTokens.get(user_id);
      if (!userToken || Date.now() > userToken.expires_at) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      accessToken = userToken.access_token;
    } else {
      return res.status(401).json({ error: "Missing authorization" });
    }

    // Create Photo Picker session
    const sessionResponse = await axios.post(
      "https://photospicker.googleapis.com/v1/sessions",
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json({
      pickerUrl: sessionResponse.data.pickerUri,
      sessionId: sessionResponse.data.id,
      message: "Use this URL in WebView for Photo Picker",
    });
  } catch (error) {
    console.error("Photo Picker URL error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to get Photo Picker URL",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 11. Refresh token endpoint
app.post("/api/oauth/refresh", async (req, res) => {
  try {
    const { refresh_token, user_id } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID_WEB,
        client_secret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET_WEB,
        refresh_token: refresh_token,
        grant_type: "refresh_token",
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Update stored token
    if (user_id) {
      const userToken = userTokens.get(user_id);
      if (userToken) {
        userToken.access_token = response.data.access_token;
        userToken.expires_at = Date.now() + response.data.expires_in * 1000;
        userTokens.set(user_id, userToken);
      }
    }

    res.json({
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
    });
  } catch (error) {
    console.error("Token refresh error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Token refresh failed",
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mobile Backend server running on port ${PORT}`);
  console.log(`📱 Ready for React Native apps`);
  console.log(`🔐 Client secret is safely stored on the server`);
  console.log(`🌐 CORS enabled for mobile development`);
});

module.exports = app;
