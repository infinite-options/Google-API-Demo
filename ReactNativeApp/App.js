import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Dimensions, SafeAreaView, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import axios from "axios";

// Configuration
let API_BASE_URL = "";

// Platform-specific API URL configuration
if (__DEV__) {
  if (Platform.OS === "ios") {
    API_BASE_URL = "http://localhost:3001"; // iOS simulator maps localhost → your machine
  } else if (Platform.OS === "android") {
    API_BASE_URL = "http://10.0.2.2:3001"; // Android emulator special alias
  } else if (Platform.OS === "web") {
    API_BASE_URL = "http://localhost:3001"; // Web platform uses localhost
  } else {
    // For physical devices, use your machine's LAN IP
    API_BASE_URL = "http://192.168.1.100:3001"; // Replace with your actual LAN IP
  }
} else {
  // For production (point to deployed backend)
  API_BASE_URL = "https://your-production-api.com";
}

console.log(`Platform: ${Platform.OS}, API_BASE_URL: ${API_BASE_URL}`);

const { width } = Dimensions.get("window");
const PHOTO_SIZE = (width - 60) / 3;

export default function App() {
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [googlePhotos, setGooglePhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [photoPickerSessionId, setPhotoPickerSessionId] = useState(null);
  const [photoPickerLoading, setPhotoPickerLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  useEffect(() => {
    // Check if we have stored credentials
    const storedToken = null; // In production, use SecureStore
    const storedUserId = null; // In production, use SecureStore

    if (storedToken && storedUserId) {
      setAccessToken(storedToken);
      setUserId(storedUserId);
      fetchProfile();
    }

    // Handle OAuth callback for web platform
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");

      if (code && state) {
        const storedSessionId = window.sessionStorage.getItem("oauth_session_id");

        if (storedSessionId === state) {
          // Process OAuth callback
          handleOAuthCallback(code, state);
        } else {
          console.error("Invalid state parameter");
          Alert.alert("Error", "Invalid OAuth state");
        }
      }
    }
  }, []);

  const handleOAuthCallback = async (code, state) => {
    try {
      setLoading(true);
      console.log("Processing OAuth callback...");

      // Exchange code for token
      const tokenData = await apiCall("/api/oauth/token", {
        method: "POST",
        data: { code, state, userId: crypto.randomUUID() },
      });

      console.log("Token exchange successful:", tokenData);

      setAccessToken(tokenData.access_token);
      setUserId(tokenData.user_id);

      // Wait a moment for state to update, then fetch profile
      setTimeout(async () => {
        try {
          console.log("Fetching profile with token:", tokenData.access_token);

          // Fetch profile directly with the token
          const profileData = await apiCall(`/api/user/profile?user_id=${tokenData.user_id}`, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });

          setProfile(profileData);

          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          window.sessionStorage.removeItem("oauth_session_id");

          Alert.alert("Success", "Successfully signed in with Google!");
        } catch (profileError) {
          console.error("Profile fetch error:", profileError);
          Alert.alert("Error", "Profile fetch failed");
        }
      }, 100);
    } catch (error) {
      console.error("OAuth callback error:", error);
      Alert.alert("Error", "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  // API helper function
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(userId && { "X-User-ID": userId }),
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

  const login = async () => {
    try {
      setLoading(true);

      // Get OAuth URL from backend
      const { authUrl, sessionId } = await apiCall("/api/oauth/url");

      // For web platform, use direct window redirect
      if (Platform.OS === "web") {
        // Store session ID for later verification
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("oauth_session_id", sessionId);
        }

        // Redirect to Google OAuth
        window.location.href = authUrl;
        return;
      }

      // For mobile platforms, use WebBrowser
      const result = await WebBrowser.openAuthSessionAsync(authUrl, "http://localhost:8081");

      if (result.type === "success" && result.url) {
        console.log("OAuth success, processing URL:", result.url);
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (code && state) {
          console.log("Code and state found, exchanging for token...");
          // Exchange code for token
          const tokenData = await apiCall("/api/oauth/token", {
            method: "POST",
            data: { code, state, userId: crypto.randomUUID() },
          });

          setAccessToken(tokenData.access_token);
          setUserId(tokenData.user_id);

          // Store credentials (in production, use SecureStore)
          // await SecureStore.setItemAsync('access_token', tokenData.access_token);
          // await SecureStore.setItemAsync('user_id', tokenData.user_id);

          // Fetch profile
          await fetchProfile();

          Alert.alert("Success", "Successfully signed in with Google!");
        } else {
          console.log("No code or state found in URL");
          Alert.alert("Error", "OAuth callback missing required parameters");
        }
      } else if (result.type === "cancel") {
        console.log("OAuth cancelled by user");
        Alert.alert("Cancelled", "Sign in was cancelled");
      } else {
        console.log("OAuth failed:", result);
        Alert.alert("Error", "Sign in failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setProfile(null);
    setAccessToken(null);
    setUserId(null);
    setDriveFiles(null);
    setCalendarEvents(null);
    setSelectedPhotos([]);
    setGooglePhotos([]);

    // Clear stored credentials (in production, use SecureStore)
    // await SecureStore.deleteItemAsync('access_token');
    // await SecureStore.deleteItemAsync('user_id');
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await apiCall(`/api/user/profile?user_id=${userId}`);
      setProfile(profileData);
    } catch (error) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchDriveFiles = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/drive/files?user_id=${userId}`);
      setDriveFiles(data);
    } catch (error) {
      console.error("Error fetching Drive files:", error);
      Alert.alert("Error", "Failed to fetch Drive files");
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/calendar/events?date=${selectedDate}&user_id=${userId}`);
      setCalendarEvents(data);
    } catch (error) {
      console.error("Error fetching Calendar events:", error);
      Alert.alert("Error", "Failed to fetch Calendar events");
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/drive/photos?user_id=${userId}`);
      setSelectedPhotos(data.photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      Alert.alert("Error", "Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  };

  const openPhotoPicker = async () => {
    try {
      setPhotoPickerLoading(true);

      // Get Photo Picker URL from backend
      const { pickerUrl, sessionId } = await apiCall(`/api/photos/picker/url?user_id=${userId}`);
      console.log("Photo Picker response:", { pickerUrl, sessionId });

      // Store session ID for later use
      setPhotoPickerSessionId(sessionId);

      // Open picker in new window
      const pickerWindow = window.open(pickerUrl, "photoPicker", "width=800,height=600,scrollbars=yes,resizable=yes,status=yes,toolbar=no,menubar=no,location=no");

      if (!pickerWindow) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      // Focus the window
      pickerWindow.focus();

      // Show instructions after opening
      Alert.alert("Photo Picker Opened", "Select your photos in the picker window, then click 'Fetch Selected Photos' to load them into the app.", [
        {
          text: "OK",
          onPress: () => console.log("User acknowledged picker instructions"),
        },
      ]);
    } catch (error) {
      console.error("Error opening Photo Picker:", error);
      Alert.alert("Error", "Failed to open Photo Picker");
    } finally {
      setPhotoPickerLoading(false);
    }
  };

  const fetchSelectedPhotos = async () => {
    if (!photoPickerSessionId) {
      Alert.alert("No Session", "Please open the Photo Picker first.");
      return;
    }

    try {
      setLoading(true);
      const data = await apiCall(`/api/photos/picker/media?sessionId=${photoPickerSessionId}&user_id=${userId}`);

      if (data.photos && data.photos.length > 0) {
        setGooglePhotos(data.photos);
        Alert.alert("Success", `Loaded ${data.photos.length} photos from Google Photos!`);
      } else {
        Alert.alert("No Photos", "No photos were selected. Please try selecting photos in the picker first.");
      }
    } catch (error) {
      console.error("Error fetching selected photos:", error);
      if (error.message.includes("user has not picked media items")) {
        Alert.alert("No Photos Selected", "Please select photos in the Photo Picker first, then click 'Fetch Selected Photos'.");
      } else {
        Alert.alert("Error", "Failed to fetch selected photos. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#4285F4' />
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Google APIs Demo (React Native)</Text>

        <View style={styles.securityNotice}>
          <Text style={styles.securityText}>
            🔐 <Text style={styles.bold}>Secure Mode:</Text> Client secret is safely stored on the backend server.
          </Text>
        </View>

        {!profile ? (
          <TouchableOpacity style={styles.loginButton} onPress={login}>
            <Text style={styles.loginButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
        ) : (
          <View>
            {/* Profile Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile Information</Text>
              <View style={styles.profileCard}>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Name:</Text> {profile.names?.[0]?.displayName || "N/A"}
                </Text>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Email:</Text> {profile.emailAddresses?.[0]?.value || "N/A"}
                </Text>
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Google Services */}
            <Text style={styles.sectionTitle}>Google Services</Text>

            {/* Drive Section */}
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>📁 Google Drive</Text>
              <Text style={styles.serviceDescription}>View your most recently modified files</Text>
              <TouchableOpacity style={styles.serviceButton} onPress={fetchDriveFiles}>
                <Text style={styles.serviceButtonText}>Load Recent Drive Files</Text>
              </TouchableOpacity>
            </View>

            {/* Calendar Section */}
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>📅 Google Calendar</Text>
              <Text style={styles.serviceDescription}>View events for a specific date</Text>
              <TouchableOpacity style={styles.serviceButton} onPress={fetchCalendarEvents}>
                <Text style={styles.serviceButtonText}>Load Calendar Events</Text>
              </TouchableOpacity>
            </View>

            {/* Photos Section */}
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>📷 Google Images</Text>
              <Text style={styles.serviceDescription}>Load images from Google Drive or use the Google Photo Picker</Text>
              <View style={styles.photoButtonsContainer}>
                <TouchableOpacity style={styles.photoButton} onPress={fetchPhotos}>
                  <Text style={styles.photoButtonText}>Load Drive Images</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoButton, photoPickerLoading && styles.disabledButton]} onPress={openPhotoPicker} disabled={photoPickerLoading}>
                  <Text style={styles.photoButtonText}>{photoPickerLoading ? "Opening Picker..." : "Open Photo Picker"}</Text>
                </TouchableOpacity>
                {photoPickerSessionId && (
                  <TouchableOpacity style={styles.photoButton} onPress={fetchSelectedPhotos}>
                    <Text style={styles.photoButtonText}>Fetch Selected Photos</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Results sections */}
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
            {selectedPhotos && selectedPhotos.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>Drive Images ({selectedPhotos.length})</Text>
                <View style={styles.photosGrid}>
                  {selectedPhotos.map((photo, index) => (
                    <View key={index} style={styles.photoItem}>
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoIcon}>📷</Text>
                        <Text style={styles.photoName}>{photo.name}</Text>
                      </View>
                      <View style={styles.photoInfo}>
                        <Text style={styles.photoType}>{photo.mimeType?.includes("image") ? "🖼️ Image" : "📄 File"}</Text>
                        {photo.size && <Text style={styles.photoSize}>{formatFileSize(photo.size)}</Text>}
                        {photo.modifiedTime && <Text style={styles.photoDate}>{formatDate(photo.modifiedTime)}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Google Photos Results */}
            {googlePhotos && googlePhotos.length > 0 && (
              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>Google Photos Library ({googlePhotos.length})</Text>
                <View style={styles.photosGrid}>
                  {googlePhotos.map((photo, index) => (
                    <View key={index} style={styles.photoItem}>
                      {photo.thumbnails?.[0]?.url && !imageErrors[photo.id] ? (
                        <Image
                          source={{ uri: photo.thumbnails[0].url }}
                          style={styles.photoImage}
                          resizeMode='cover'
                          onLoad={() => console.log("Thumbnail loaded successfully:", photo.name)}
                          onError={(error) => {
                            console.log("Thumbnail load error, trying full image:", photo.name, error.nativeEvent);
                            setImageErrors((prev) => ({ ...prev, [photo.id]: "thumbnail_failed" }));
                          }}
                        />
                      ) : photo.url && imageErrors[photo.id] === "thumbnail_failed" ? (
                        <Image
                          source={{ uri: photo.url }}
                          style={styles.photoImage}
                          resizeMode='cover'
                          onLoad={() => console.log("Full image loaded successfully:", photo.name)}
                          onError={(error) => {
                            console.log("Full image also failed:", photo.name, error.nativeEvent);
                            setImageErrors((prev) => ({ ...prev, [photo.id]: "both_failed" }));
                          }}
                        />
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <Text style={styles.photoIcon}>📷</Text>
                          <Text style={styles.photoErrorText}>{imageErrors[photo.id] === "both_failed" ? "Image unavailable" : "Loading..."}</Text>
                        </View>
                      )}
                      <View style={styles.photoInfo}>
                        <Text style={styles.photoName}>{photo.name}</Text>
                        {photo.width && photo.height && (
                          <Text style={styles.photoDimensions}>
                            📐 {photo.width}x{photo.height}
                          </Text>
                        )}
                        {photo.creationTime && <Text style={styles.photoDate}>📅 {formatDate(photo.creationTime)}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#333",
  },
  securityNotice: {
    padding: 12,
    backgroundColor: "#d4edda",
    borderWidth: 1,
    borderColor: "#c3e6cb",
    borderRadius: 8,
    marginBottom: 16,
  },
  securityText: {
    fontSize: 14,
    color: "#155724",
  },
  bold: {
    fontWeight: "bold",
  },
  loginButton: {
    backgroundColor: "#4285F4",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#EA4335",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  logoutButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#333",
  },
  profileCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  profileText: {
    fontSize: 16,
    marginBottom: 8,
    color: "#333",
  },
  serviceCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  serviceDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  serviceButton: {
    backgroundColor: "#34A853",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  serviceButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  photoButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoButton: {
    backgroundColor: "#4285F4",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
    flex: 1,
    minWidth: 120,
  },
  photoButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledButton: {
    backgroundColor: "#ccc",
    opacity: 0.6,
  },
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
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoItem: {
    width: PHOTO_SIZE,
    marginBottom: 12,
    backgroundColor: "white",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    overflow: "hidden",
  },
  photoPlaceholder: {
    width: "100%",
    height: PHOTO_SIZE,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  photoIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  photoErrorText: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
  },
  photoImage: {
    width: "100%",
    height: PHOTO_SIZE,
  },
  photoInfo: {
    padding: 8,
  },
  photoName: {
    fontSize: 12,
    color: "#333",
    marginBottom: 4,
    textAlign: "center",
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
  photoDimensions: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  // Photo Picker WebView styles
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: "#666",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  doneButton: {
    padding: 8,
  },
  doneButtonText: {
    fontSize: 16,
    color: "#4285F4",
    fontWeight: "600",
  },
  webview: {
    flex: 1,
  },
});
