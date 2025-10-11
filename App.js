// App.js — single-file React Native app
import React, { useEffect, useState } from "react";
import { View, Text, Button, TouchableOpacity, ScrollView, StyleSheet, Linking, Platform, Alert, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Environment variables from your .env file (exported by your bundler)
 * Make sure your bundler / Expo is configured to expose these at runtime.
 */
const {
  EXPO_PUBLIC_ABLY_API_KEY,
  REACT_APP_GOOGLE_CLIENT_ID_WEB,
  REACT_APP_GOOGLE_CLIENT_SECRET_WEB,
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_MOBILE,
  EXPO_PUBLIC_GOOGLE_CLIENT_SECRET_WEB,
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
  REDIRECT_URI,
  REACT_APP_SECURE_MODE,
} = process.env;

/** Backend base url you gave */
const baseURL = "https://bmarz6chil.execute-api.us-west-1.amazonaws.com/dev";

/** AsyncStorage keys (explicit) */
const CURRENT_SESSION = "currentSession";
const CURRENT_ACCESS_TOKEN = "currentAccessToken";
const CURRENT_PROFILE = "currentProfile";

export default function App() {
  // Get safe area insets
  const insets = useSafeAreaInsets();

  // 4 variables (3 AsyncStorage-backed values + 1 boolean)
  const [currentSession, setCurrentSession] = useState(null);
  const [currentAccessToken, setCurrentAccessToken] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);

  // Additional state for Google services
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [photoDataUrls, setPhotoDataUrls] = useState({});

  // Local (non-AsyncStorage) holders for authUrl and sessionId returned by the backend
  const [authUrl, setAuthUrl] = useState(null);
  const [googleSessionId, setGoogleSessionId] = useState(null);

  // UI state: which screen to show
  const [screen, setScreen] = useState("login"); // "login" or "app"

  // small UI message area to show last-button pressed
  const [lastAction, setLastAction] = useState("");

  useEffect(() => {
    // load AsyncStorage values once on mount
    (async () => {
      try {
        const [cs, cat, cp] = await Promise.all([AsyncStorage.getItem(CURRENT_SESSION), AsyncStorage.getItem(CURRENT_ACCESS_TOKEN), AsyncStorage.getItem(CURRENT_PROFILE)]);
        setCurrentSession(cs);
        setCurrentAccessToken(cat);
        setCurrentProfile(cp);

        // If currentSession & access token exist, mark authenticated (simple heuristic)
        const isAuth = !!cs && !!cat && !!cp;
        setAuthenticated(isAuth);
        setScreen(isAuth ? "app" : "login");
      } catch (err) {
        console.warn("Failed to load AsyncStorage:", err);
      }
    })();

    // Set up deep linking listener
    const handleUrl = (event) => {
      const { url } = event;
      console.log("🔗 Deep link URL received:", url);

      try {
        const parsed = new URL(url);
        console.log("🔗 Parsed URL protocol:", parsed.protocol);
        console.log("🔗 Parsed URL host:", parsed.host);
        console.log("🔗 Parsed URL pathname:", parsed.pathname);
        console.log("🔗 All search params:", Object.fromEntries(parsed.searchParams));

        if (parsed.protocol === "googleapidemo:" && parsed.host === "photos") {
          const sessionId = parsed.searchParams.get("sessionId");
          console.log("🔗 Extracted sessionId from googleapidemo:", sessionId);
          if (sessionId) {
            console.log("📸 Photo picker completed, fetching results for sessionId:", sessionId);
            setGoogleSessionId(sessionId);

            // Show immediate feedback
            Alert.alert("Deep Link Detected!", `Session ID: ${sessionId}\nProcessing authentication...`);

            // Fetch tokens and profile, then complete login
            fetchTokensAndProfile(sessionId);
          } else {
            console.log("❌ No sessionId found in deep link");
            Alert.alert("Deep Link Error", "No sessionId found in the deep link URL");
          }
        }
        // Also support legacy capshnz:// format
        else if (parsed.protocol === "capshnz:" && parsed.host === "photos") {
          const session = parsed.searchParams.get("session");
          console.log("🔗 Extracted session from capshnz:", session);
          if (session) {
            console.log("📸 Photo picker completed (legacy), fetching results for session:", session);
            setGoogleSessionId(session);

            // Show immediate feedback
            Alert.alert("Deep Link Detected!", `Session: ${session}\nProcessing authentication...`);

            // Fetch tokens and profile, then complete login
            fetchTokensAndProfile(session);
          } else {
            console.log("❌ No session found in legacy deep link");
            Alert.alert("Deep Link Error", "No session found in the legacy deep link URL");
          }
        } else {
          console.log("🔗 Deep link URL does not match expected patterns");
          console.log("🔗 Expected: googleapidemo://photos/selection?sessionId=xyz");
          console.log("🔗 Expected: capshnz://photos/selection?session=xyz");
          console.log("🔗 Received:", url);
          Alert.alert("Deep Link Mismatch", `URL doesn't match expected patterns.\nReceived: ${url}\nExpected: googleapidemo://photos/selection?sessionId=xyz`);
        }
      } catch (error) {
        console.error("❌ Error parsing deep link URL:", error);
        Alert.alert("Deep Link Error", `Failed to parse URL: ${url}\nError: ${error.message}`);
      }
    };

    // Listen for deep links
    const linkingListener = Linking.addEventListener("url", handleUrl);

    // Check initial URL if app was launched via link
    Linking.getInitialURL()
      .then((url) => {
        console.log("🔗 Checking initial URL:", url);
        if (url) {
          console.log("🔗 Initial deep link URL found:", url);
          handleUrl({ url });
        } else {
          console.log("🔗 No initial deep link URL");
        }
      })
      .catch((error) => {
        console.error("🔗 Error checking initial URL:", error);
      });

    // Handle OAuth callback for web platform
    if (Platform.OS === "web" && typeof window !== "undefined") {
      console.log("🔗 Web platform detected, checking URL parameters...");
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get("sessionId");
      const success = urlParams.get("success");

      console.log("🔗 URL params - sessionId:", sessionId, "success:", success);

      if (sessionId && success === "true") {
        console.log("🎉 OAuth callback received with sessionId:", sessionId);

        // Send message to parent window (if this is a popup)
        if (window.opener) {
          // Send sessionId to main window via postMessage
          window.opener.postMessage(
            {
              type: "OAUTH_SUCCESS",
              sessionId: sessionId,
            },
            window.location.origin
          );

          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);

          // Close the popup
          window.close();
        } else {
          // Fallback: if not in popup, handle directly in this window
          setGoogleSessionId(sessionId);
          fetchTokensAndProfile(sessionId);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }

    // Cleanup deep linking listener
    return () => {
      console.log("🔗 Cleaning up deep link listener...");
      if (linkingListener) {
        linkingListener.remove();
      }
    };
  }, []);

  // Helper: display AsyncStorage values as an object for UI
  const allAsyncStorageValues = {
    currentSession,
    currentAccessToken,
    currentProfile,
  };

  // API helper function
  const apiCall = async (endpoint, options = {}) => {
    const url = `${baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(currentAccessToken && { Authorization: `Bearer ${currentAccessToken}` }),
        ...options.headers,
      },
    };

    // Add body for POST/PUT requests
    if (options.data && (options.method === "POST" || options.method === "PUT")) {
      config.body = JSON.stringify(options.data);
    }

    try {
      console.log(`Making API call to: ${url}`, config);
      const response = await fetch(url, config);

      console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`API Success:`, data);
      return data;
    } catch (error) {
      console.error("API Error:", error.message);
      throw new Error(error.message);
    }
  };

  // Fetch tokens and profile from backend
  const fetchTokensAndProfile = async (sessionId) => {
    try {
      console.log("🔑 Fetching tokens and profile for sessionId:", sessionId);

      // Get tokens from backend
      const tokenResponse = await fetch(`${baseURL}/api/oauth/token/${sessionId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`Token API Error ${tokenResponse.status}:`, errorText);
        throw new Error(`HTTP ${tokenResponse.status}: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      console.log("🔑 ✅ Tokens received");

      // Fetch profile with the token
      const profileResponse = await fetch(`${baseURL}/api/user/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error(`Profile API Error ${profileResponse.status}:`, errorText);
        throw new Error(`HTTP ${profileResponse.status}: ${errorText}`);
      }

      const profileData = await profileResponse.json();
      console.log("🔑 ✅ Profile received");

      // Complete login with real data
      await completeLogin({
        sessionId: sessionId,
        accessToken: tokenData.access_token,
        profile: JSON.stringify(profileData),
      });

      Alert.alert("Authentication Complete!", "You're now signed in!", [{ text: "OK" }]);
    } catch (error) {
      console.error("🔑 ❌ Failed to fetch tokens and profile:", error);
      Alert.alert("Authentication Error", `Failed to complete authentication: ${error.message}`);
    }
  };

  // Sign in button: call backend to get authUrl and sessionId (platform-specific)
  const platformParam = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";
  const signInGoogle = async () => {
    try {
      const endpoint = `/api/oauth/url?platform=${encodeURIComponent(platformParam)}`;
      const url = `${baseURL}${endpoint}`;
      console.log("Calling backend for auth url:", url);

      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("Backend returned non-OK:", resp.status);
        const text = await resp.text();
        console.warn(text);
        return;
      }
      const data = await resp.json();
      // expected shape: { authUrl, sessionId } per your spec
      const { authUrl: returnedAuthUrl, sessionId } = data;
      console.log("backend returned:", data);

      // store locally (state), NOT in AsyncStorage
      setAuthUrl(returnedAuthUrl);
      setGoogleSessionId(sessionId);

      // open in browser (user completes OAuth there)
      if (returnedAuthUrl) {
        if (Platform.OS === "web") {
          // For web, open in new tab to avoid replacing current page
          const oauthWindow = window.open(returnedAuthUrl, "_blank", "width=600,height=700");

          // Listen for messages from the OAuth window
          const handleMessage = (event) => {
            if (event.origin !== window.location.origin) return;

            if (event.data.type === "OAUTH_SUCCESS" && event.data.sessionId) {
              console.log("🎉 OAuth success received via postMessage:", event.data.sessionId);
              setGoogleSessionId(event.data.sessionId);
              fetchTokensAndProfile(event.data.sessionId);
              oauthWindow.close();
              window.removeEventListener("message", handleMessage);
            }
          };

          window.addEventListener("message", handleMessage);

          Alert.alert("Google Sign In Started", "Please complete authentication in the popup window. The app will automatically detect when you're done.");
        } else {
          // For mobile, use Linking.openURL
          Linking.openURL(returnedAuthUrl);
          Alert.alert("Google Sign In Started", "Please complete authentication in your browser, then return to this app.");
        }
      } else {
        console.warn("No authUrl returned from backend.");
      }
    } catch (err) {
      console.warn("signInGoogle error:", err);
      Alert.alert("Error", `Google login failed: ${err.message}`);
    }
  };

  /**
   * Complete login with real tokens and profile from backend.
   * This function stores current AsyncStorage keys and sets authenticated -> true.
   */
  const completeLogin = async ({ sessionId, accessToken, profile }) => {
    try {
      console.log("🔑 Completing login with sessionId:", sessionId);

      // Store current values in AsyncStorage
      await AsyncStorage.setItem(CURRENT_SESSION, sessionId ?? "");
      await AsyncStorage.setItem(CURRENT_ACCESS_TOKEN, accessToken ?? "");
      await AsyncStorage.setItem(CURRENT_PROFILE, profile ?? "");
      console.log("💾 ✅ Current session data stored in AsyncStorage");

      // Update local state
      setCurrentSession(sessionId);
      setCurrentAccessToken(accessToken);
      setCurrentProfile(profile);

      setAuthenticated(true);
      setScreen("app");
      setLastAction("✅ Authentication completed successfully! Session/token/profile stored in AsyncStorage.");
      console.log("✅ completeLogin done: sessionId", sessionId);
    } catch (err) {
      console.error("❌ completeLogin error:", err);
      Alert.alert("Login Error", `Failed to complete login: ${err.message}`);
    }
  };

  // Logout: set authenticated false and clear current AsyncStorage
  const logout = async () => {
    try {
      await AsyncStorage.removeItem(CURRENT_SESSION);
      await AsyncStorage.removeItem(CURRENT_ACCESS_TOKEN);
      await AsyncStorage.removeItem(CURRENT_PROFILE);

      setCurrentSession(null);
      setCurrentAccessToken(null);
      setCurrentProfile(null);
      setDriveFiles(null);
      setCalendarEvents(null);
      setDrivePhotos([]);
      setPhotoDataUrls({});

      setAuthenticated(false);
      setScreen("login");
      setLastAction("Logged out and cleared current AsyncStorage values.");
      console.log("Logged out. current values cleared.");
    } catch (err) {
      console.warn("logout error:", err);
    }
  };

  // Google Services API calls
  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await apiCall(`/api/user/profile?sessionId=${currentSession}`);
      setCurrentProfile(JSON.stringify(profileData));
      setLastAction("✅ Profile fetched successfully");
    } catch (error) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to fetch profile");
      setLastAction("❌ Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendar = async () => {
    try {
      console.log("Fetching Calendar events for date:", selectedDate);
      setLoading(true);
      const data = await apiCall(`/api/calendar/events?date=${selectedDate}&sessionId=${currentSession}`);
      setCalendarEvents(data);
      setLastAction(`✅ Calendar events fetched for ${selectedDate}`);
    } catch (error) {
      console.error("Error fetching Calendar events:", error);
      Alert.alert("Error", "Failed to fetch Calendar events");
      setLastAction("❌ Failed to fetch calendar events");
    } finally {
      setLoading(false);
    }
  };

  const fetchDriveFiles = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/drive/files?sessionId=${currentSession}`);
      setDriveFiles(data);
      setLastAction("✅ Drive files fetched successfully");
    } catch (error) {
      console.error("Error fetching Drive files:", error);
      Alert.alert("Error", "Failed to fetch Drive files");
      setLastAction("❌ Failed to fetch drive files");
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivePhotos = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/drive/photos?sessionId=${currentSession}`);
      const photos = data.photos || [];
      setDrivePhotos(photos);

      // For now, let's just use the direct Google Drive URLs
      // The thumbnails from the API should work directly
      setPhotoDataUrls({}); // Clear any previous data URLs

      setLastAction(`✅ Drive photos fetched successfully (${photos.length} photos)`);
    } catch (error) {
      console.error("Error fetching photos:", error);
      Alert.alert("Error", "Failed to fetch photos");
      setLastAction("❌ Failed to fetch drive photos");
    } finally {
      setLoading(false);
    }
  };

  const fetchGooglePhotos = async () => {
    try {
      setLoading(true);
      setLastAction("✅ Google Photos functionality ready");
      Alert.alert("Google Photos", "Google Photos picker functionality is available");
    } catch (error) {
      console.error("Error with Google Photos:", error);
      Alert.alert("Error", "Failed to access Google Photos");
      setLastAction("❌ Failed to access Google Photos");
    } finally {
      setLoading(false);
    }
  };

  // DEVELOPMENT ONLY: Simulate successful login using demo data.
  // This bypasses the real OAuth flow for testing purposes.
  const simulateSuccessUsingBackend = async () => {
    Alert.alert("Development Mode", "This will simulate a successful login using demo data. In production, use the real OAuth flow.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        onPress: async () => {
          // In a real app you'd exchange the backend sessionId for an access token (via backend)
          // For demo we fabricate an access token and profile object
          const demoAccessToken = `demo-token-${Date.now()}`;
          const demoProfile = JSON.stringify({
            id: "demo-user-123",
            name: "Demo User",
            email: "demo@example.com",
          });

          // prefer using googleSessionId if present; otherwise use a generated one
          const sessionIdToUse = googleSessionId ?? `demo-session-${Date.now()}`;

          await completeLogin({
            sessionId: sessionIdToUse,
            accessToken: demoAccessToken,
            profile: demoProfile,
          });
        },
      },
    ]);
  };

  // Utility functions
  const formatFileSize = (size) => {
    if (!size) return "";
    const bytes = parseInt(size);
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateTimeString) => {
    if (!dateTimeString) return "";
    return new Date(dateTimeString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes("folder")) return "📁";
    if (mimeType?.includes("image")) return "🖼️";
    if (mimeType?.includes("document")) return "📄";
    if (mimeType?.includes("spreadsheet")) return "📊";
    if (mimeType?.includes("presentation")) return "📽️";
    return "📄";
  };

  // Render helpers
  const renderKeyValue = (key, value) => (
    <View key={key} style={styles.kvRow}>
      <Text style={styles.kvKey}>{key}:</Text>
      <Text style={styles.kvValue}>{value === null || value === "" ? "null" : String(value)}</Text>
    </View>
  );

  // ---- Login Screen ----
  const LoginScreen = () => (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Login Screen</Text>

        <TouchableOpacity style={styles.googleButton} onPress={signInGoogle}>
          <Text style={styles.googleButtonText}>Sign In Google</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Authentication Status</Text>
          <Text>{String(authenticated)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AsyncStorage values</Text>
          {Object.entries(allAsyncStorageValues).map(([k, v]) => renderKeyValue(k, v))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backend response (local only)</Text>
          {renderKeyValue("authUrl", authUrl)}
          {renderKeyValue("googleSessionId", googleSessionId)}
        </View>

        <View style={{ marginVertical: 8 }}>
          <Button title='🧪 Simulate Login (DEV ONLY)' onPress={simulateSuccessUsingBackend} />
        </View>

        <View style={{ marginVertical: 8 }}>
          <Text style={styles.hint}>
            <Text style={styles.bold}>Real OAuth Flow:</Text> Press "Sign In Google" to open the auth URL. After completing OAuth in your browser, the app will automatically detect the deep link
            callback and complete authentication.
          </Text>
        </View>

        <View style={{ marginVertical: 8 }}>
          <Text style={styles.hint}>
            <Text style={styles.bold}>Deep Link Support:</Text> The app supports both googleapidemo://photos/selection?sessionId=xyz and capshnz://photos/selection?session=xyz URL formats.
          </Text>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );

  // ---- App Screen ----
  const AppScreen = () => {
    if (loading) {
      return (
        <View style={[styles.container, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>App Screen</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Authentication Status</Text>
            <Text>{String(authenticated)}</Text>
          </View>

          {currentProfile && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>User Profile</Text>
              {(() => {
                try {
                  const profile = JSON.parse(currentProfile);
                  return (
                    <View>
                      <Text style={styles.profileText}>
                        <Text style={styles.bold}>Name:</Text> {profile.names?.[0]?.displayName || profile.name || "N/A"}
                      </Text>
                      <Text style={styles.profileText}>
                        <Text style={styles.bold}>Email:</Text> {profile.emailAddresses?.[0]?.value || profile.email || "N/A"}
                      </Text>
                      <Text style={styles.profileText}>
                        <Text style={styles.bold}>ID:</Text> {profile.resourceName || profile.id || "N/A"}
                      </Text>
                    </View>
                  );
                } catch (e) {
                  return <Text style={styles.profileText}>Profile data (raw): {currentProfile}</Text>;
                }
              })()}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AsyncStorage values</Text>
            {Object.entries(allAsyncStorageValues).map(([k, v]) => renderKeyValue(k, v))}
          </View>

          <View style={styles.buttonsGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={fetchProfile}>
              <Text style={styles.actionButtonText}>Google Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={fetchCalendar}>
              <Text style={styles.actionButtonText}>Google Calendar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={fetchDriveFiles}>
              <Text style={styles.actionButtonText}>Google Drive Files</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={fetchDrivePhotos}>
              <Text style={styles.actionButtonText}>Google Drive Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={fetchGooglePhotos}>
              <Text style={styles.actionButtonText}>Google Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={logout}>
              <Text style={styles.actionButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text>Last action: {lastAction}</Text>
          </View>

          {/* Drive Files Results */}
          {driveFiles && (
            <View style={styles.resultsCard}>
              <Text style={styles.resultsTitle}>Recent Drive Files ({driveFiles.files?.length || 0})</Text>
              {driveFiles.files && driveFiles.files.length > 0 ? (
                driveFiles.files.map((file) => (
                  <View key={file.id} style={styles.fileItem}>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>{file.name}</Text>
                      <Text style={styles.fileType}>
                        {getFileIcon(file.mimeType)} {file.mimeType?.includes("folder") ? "Folder" : "File"}
                      </Text>
                    </View>
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileDate}>{formatDate(file.modifiedTime)}</Text>
                      {file.size && <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No files found</Text>
              )}
            </View>
          )}

          {/* Calendar Events Results */}
          {calendarEvents && (
            <View style={styles.resultsCard}>
              <Text style={styles.resultsTitle}>
                Calendar Events for {formatDate(selectedDate)} ({calendarEvents.items?.length || 0})
              </Text>
              {calendarEvents.items && calendarEvents.items.length > 0 ? (
                calendarEvents.items.map((event) => (
                  <View key={event.id} style={styles.eventItem}>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle}>{event.summary || "No Title"}</Text>
                      <Text style={styles.eventTime}>{event.start?.dateTime ? `🕐 ${formatTime(event.start.dateTime)}` : event.start?.date ? "📅 All Day Event" : "⏰ No start time"}</Text>
                      {event.description && <Text style={styles.eventDescription}>{event.description.substring(0, 100)}...</Text>}
                    </View>
                    <View style={styles.eventMeta}>
                      {event.end?.dateTime && <Text style={styles.eventEndTime}>Ends: {formatTime(event.end.dateTime)}</Text>}
                      {event.location && <Text style={styles.eventLocation}>📍 {event.location}</Text>}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No events found for this date</Text>
              )}
            </View>
          )}

          {/* Drive Photos Results */}
          {drivePhotos && drivePhotos.length > 0 && (
            <View style={styles.resultsCard}>
              <Text style={styles.resultsTitle}>Drive Photos ({drivePhotos.length})</Text>
              <View style={styles.photosGrid}>
                {drivePhotos.map((photo, index) => {
                  // Use the original thumbnail URL from the API response
                  const thumbnailUrl = photo.thumbnails?.[0]?.url;

                  // Debug logging
                  console.log(`Photo ${index}: ${photo.name}`);
                  console.log(`  - Thumbnail URL:`, thumbnailUrl);
                  console.log(`  - MIME type:`, photo.mimeType);

                  return (
                    <View key={index} style={styles.photoItem}>
                      <View style={styles.photoContainer}>
                        {thumbnailUrl ? (
                          <Image
                            source={{ uri: thumbnailUrl }}
                            style={styles.photoThumbnail}
                            resizeMode='cover'
                            onError={() => console.log("Failed to load thumbnail for:", photo.name)}
                            onLoad={() => console.log("Successfully loaded thumbnail for:", photo.name)}
                          />
                        ) : (
                          <View style={styles.photoPlaceholder}>
                            <Text style={styles.photoIcon}>🖼️</Text>
                            <Text style={styles.loadingText}>No thumbnail</Text>
                          </View>
                        )}
                        <Text style={styles.photoName} numberOfLines={2}>
                          {photo.name}
                        </Text>
                      </View>
                      <View style={styles.photoInfo}>
                        <Text style={styles.photoType}>{photo.mimeType?.includes("image") ? "🖼️ Image" : "📄 File"}</Text>
                        {photo.size && <Text style={styles.photoSize}>{formatFileSize(photo.size)}</Text>}
                        {photo.modifiedTime && <Text style={styles.photoDate}>{formatDate(photo.modifiedTime)}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </View>
    );
  };

  return screen === "app" || authenticated ? <AppScreen /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f2" },
  scroll: { padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  googleButton: {
    backgroundColor: "#4285F4",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  googleButtonText: { color: "white", fontWeight: "700" },
  section: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontWeight: "700", marginBottom: 6 },
  kvRow: { flexDirection: "row", marginBottom: 6 },
  kvKey: { width: 160, fontWeight: "600" },
  kvValue: { flex: 1 },
  hint: { color: "#444", fontSize: 12 },
  bold: { fontWeight: "bold" },
  profileText: { fontSize: 14, marginBottom: 4, color: "#333" },
  buttonsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  actionButton: {
    width: "48%",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  actionButtonText: { fontWeight: "600" },
  // Results display styles
  resultsCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#34A853",
  },
  fileItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 4,
  },
  fileType: {
    fontSize: 12,
    color: "#666",
  },
  fileMeta: {
    alignItems: "flex-end",
  },
  fileDate: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: "#666",
  },
  eventItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  eventDescription: {
    fontSize: 12,
    color: "#666",
  },
  eventMeta: {
    alignItems: "flex-end",
  },
  eventEndTime: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 12,
    color: "#666",
  },
  noDataText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  // Photo grid styles
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoItem: {
    width: "48%",
    marginBottom: 12,
    backgroundColor: "white",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    overflow: "hidden",
  },
  photoContainer: {
    position: "relative",
  },
  photoThumbnail: {
    width: "100%",
    height: 120,
  },
  photoPlaceholder: {
    width: "100%",
    height: 120,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  photoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  photoName: {
    fontSize: 12,
    color: "#333",
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  photoInfo: {
    padding: 8,
  },
  photoType: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  photoSize: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  photoDate: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
});
