const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware with CORS-friendly configuration
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// CORS configuration for both web and mobile
app.use(
  cors({
    origin: [
      "http://localhost:3000", // React web app
      "http://localhost:8081", // Expo web
      "http://127.0.0.1:8081", // Expo web (alternative)
      "http://10.0.2.2:8081", // Android emulator
      "exp://localhost:19000", // Expo development
      "exp://192.168.1.100:19000", // Expo on local network
      "exp://10.0.2.2:19000", // Android emulator Expo
      // Add your production domains here
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-User-ID"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Store active sessions (in production, use Redis or database)
const activeSessions = new Map();
const userTokens = new Map();

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

// 1. Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: "Google API Demo Backend is running"
  });
});

// 2. Get OAuth URL
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

    console.log("🔗 Generated OAuth URL for session:", sessionId);
    console.log("🔗 Redirect URI:", process.env.REDIRECT_URI);

    res.json({
      authUrl,
      sessionId,
      expiresIn: 600, // 10 minutes
      message: "Use this URL for OAuth flow",
    });
  } catch (error) {
    console.error("Error generating OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// 3. OAuth callback endpoint (where Google redirects)
app.get("/oauth2/callback", async (req, res) => {
  console.log("🔄 OAuth Callback Received from Google");
  console.log("📝 Query params:", req.query);
  console.log("📝 Full URL:", req.url);
  
  const { code, state, error } = req.query;
  
  if (error) {
    console.error("❌ OAuth error from Google:", error);
    return res.status(400).json({ 
      error: "OAuth authorization failed", 
      details: error 
    });
  }
  
  if (!code) {
    console.error("❌ No code received from Google");
    return res.status(400).json({ error: "No authorization code received" });
  }

  try {
    // Get stored code verifier
    const session = activeSessions.get(state);
    if (!session) {
      console.error("❌ Invalid or expired state parameter");
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    // Exchange code for tokens
    const params = new URLSearchParams();
    params.append("code", code);
    params.append("client_id", process.env.GOOGLE_CLIENT_ID);
    params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET);
    params.append("redirect_uri", process.env.REDIRECT_URI);
    params.append("grant_type", "authorization_code");
    params.append("code_verifier", session.codeVerifier);

    console.log("🔄 Exchanging code for tokens...");
    console.log("🔑 Code:", code);
    console.log("🔑 State:", state);
    console.log("🔗 Redirect URI:", process.env.REDIRECT_URI);

    const tokenResp = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );

    const tokens = tokenResp.data;
    console.log("✅ Successfully exchanged code for tokens");
    console.log("🔑 Tokens received:", JSON.stringify(tokens, null, 2));

    // Store tokens with state for later retrieval
    if (state) {
      activeSessions.set(state, {
        ...session,
        tokens: tokens,
        timestamp: Date.now()
      });
      console.log("💾 Tokens stored for state:", state);
    }

    // For web platform, redirect to frontend with tokens
    if (req.headers['user-agent']?.includes('Mozilla')) {
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`;
      console.log("🌐 Redirecting to frontend:", frontendUrl);
      return res.redirect(frontendUrl);
    }

    // For mobile platform, redirect with deep link
    const deepLinkUrl = `capshnz://photos/done?session=${state || 'unknown'}`;
    console.log("🔗 Redirecting to deep link:", deepLinkUrl);
    res.redirect(deepLinkUrl);
  } catch (error) {
    console.error("❌ Error in OAuth callback:", error.response?.data || error.message);
    console.error("❌ Full error:", error);
    res.status(500).json({ 
      error: "OAuth callback failed",
      details: error.response?.data || error.message
    });
  }
});

// 4. Exchange OAuth code for tokens (for mobile apps)
app.post("/api/oauth/token", async (req, res) => {
  const { code, state } = req.body;
  
  console.log("🔄 OAuth Token Exchange Request Received");
  console.log("📝 Request body:", JSON.stringify(req.body, null, 2));
  
  if (!code) {
    console.log("❌ Missing code in request");
    return res.status(400).json({ error: "Missing code" });
  }

  console.log("🔄 Exchanging OAuth code for tokens");
  console.log("🔑 Code:", code);
  console.log("🔑 State:", state);

  try {
    // Get stored code verifier
    const session = activeSessions.get(state);
    if (!session) {
      console.error("❌ Invalid or expired state parameter");
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const params = new URLSearchParams();
    params.append("code", code);
    params.append("client_id", process.env.GOOGLE_CLIENT_ID);
    params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET);
    params.append("redirect_uri", process.env.REDIRECT_URI);
    params.append("grant_type", "authorization_code");
    params.append("code_verifier", session.codeVerifier);

    console.log("🌐 Making request to Google OAuth token endpoint");
    console.log("🔗 URL: https://oauth2.googleapis.com/token");
    console.log("📝 Params:", params.toString());

    const tokenResp = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );

    const tokens = tokenResp.data;
    console.log("✅ Successfully exchanged code for tokens");
    console.log("🔑 Tokens received:", JSON.stringify(tokens, null, 2));

    // Store tokens with state for later retrieval
    if (state) {
      activeSessions.set(state, {
        ...session,
        tokens: tokens,
        timestamp: Date.now()
      });
    }

    res.json({ success: true, ...tokens });
  } catch (err) {
    console.error("❌ Error exchanging code:", err.response?.data || err.message);
    console.error("❌ Full error response:", err.response);
    res.status(500).json({ error: "Token exchange failed" });
  }
});

// 5. Get user profile
app.get("/api/user/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { user_id } = req.query;

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

    const response = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Profile fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch profile",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 6. Get Google Drive files
app.get("/api/drive/files", async (req, res) => {
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

    const response = await axios.get(
      "https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,size,createdTime,webViewLink,thumbnailLink)",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Drive files fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Drive files",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 7. Get Google Calendar events
app.get("/api/calendar/events", async (req, res) => {
  try {
    const { user_id, date } = req.query;
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

    const timeMin = date ? `${date}T00:00:00Z` : new Date().toISOString();
    const timeMax = date ? `${date}T23:59:59Z` : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const response = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Calendar events fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch calendar events",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 8. Get Google Photos
app.get("/api/photos/library", async (req, res) => {
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

    const response = await axios.get(
      "https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=25",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Photos fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch photos",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// 9. Get Photo Picker URL for WebView
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

// 10. Store picker selection
app.post("/api/picker/selection", (req, res) => {
  const { state, selection } = req.body;
  
  if (!state || !Array.isArray(selection)) {
    return res.status(400).json({ error: "Missing state or selection" });
  }

  console.log("📸 Storing picker selection for state:", state);

  // Store selection in session
  const session = activeSessions.get(state);
  if (session) {
    session.pickerSelection = selection;
    session.timestamp = Date.now();
    activeSessions.set(state, session);
  } else {
    // Create new session if doesn't exist
    activeSessions.set(state, {
      pickerSelection: selection,
      timestamp: Date.now()
    });
  }

  res.json({ success: true, message: "Selection stored successfully" });
});

// 11. Get picker results
app.get("/api/picker/result", (req, res) => {
  const { session } = req.query;
  
  if (!session) {
    return res.status(400).json({ error: "Missing session" });
  }

  console.log("📸 Fetching picker result for session:", session);

  const result = activeSessions.get(session);
  if (!result || !result.pickerSelection) {
    return res.status(404).json({ error: "Selection not found" });
  }

  res.json({ 
    success: true, 
    selection: result.pickerSelection,
    timestamp: result.timestamp
  });
});

// 12. Refresh token endpoint
app.post("/api/oauth/refresh", async (req, res) => {
  try {
    const { refresh_token, user_id } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const params = new URLSearchParams();
    params.append("refresh_token", refresh_token);
    params.append("client_id", process.env.GOOGLE_CLIENT_ID);
    params.append("client_secret", process.env.GOOGLE_CLIENT_SECRET);
    params.append("grant_type", "refresh_token");

    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const tokens = response.data;
    
    // Update stored tokens if user_id provided
    if (user_id) {
      userTokens.set(user_id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
      });
    }

    res.json(tokens);
  } catch (error) {
    console.error("Token refresh error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Token refresh failed",
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// 13. Test endpoint for debugging
app.get("/test", (req, res) => {
  console.log("🧪 TEST ENDPOINT HIT!");
  console.log("🧪 Request from:", req.ip);
  console.log("🧪 User-Agent:", req.headers["user-agent"]);
  res.json({ 
    message: "Backend is accessible!", 
    timestamp: new Date().toISOString(),
    ip: req.ip 
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Consolidated Backend server running on port ${PORT}`);
  console.log(`📱 Ready for both web and mobile apps`);
  console.log(`🔐 OAuth redirect URI: ${process.env.REDIRECT_URI}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`🔒 Security: Rate limiting, Helmet, CORS enabled`);
});

module.exports = app;