import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Dimensions, SafeAreaView, Platform, Linking, Modal } from "react-native";
import { WebView } from 'react-native-webview';
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from "axios";

// Configuration
let API_BASE_URL = "";

// Use AWS API Gateway for all platforms
const AWS_API_URL = "https://bmarz6chil.execute-api.us-west-1.amazonaws.com/dev";

// Set API_BASE_URL to AWS for all platforms
API_BASE_URL = AWS_API_URL;

console.log(`Platform: ${Platform.OS}, API_BASE_URL: ${API_BASE_URL}`);
console.log(`🚀 App Build Time: ${new Date().toLocaleString()}`);

const { width } = Dimensions.get("window");
const PHOTO_SIZE = (width - 60) / 3;

export default function App() {
  // Component render timestamp and version - moved to useState to prevent re-rendering
  const [componentRenderTime] = useState(new Date().toLocaleString());
  const appVersion = "v2.0.0"; // AWS API Gateway integration
  console.log(`🔄 Component rendered at: ${componentRenderTime} (${appVersion})`);
  
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [googlePhotos, setGooglePhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [photoPickerLoading, setPhotoPickerLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState({});
  const [apiResponse, setApiResponse] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [currentApiUrl, setCurrentApiUrl] = useState(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState(null);
  const [debugAccessToken, setDebugAccessToken] = useState(null);

  // AsyncStorage functions for session persistence
  const savePendingSession = async (sessionId) => {
    try {
      await AsyncStorage.setItem('pendingSessionId', sessionId);
      console.log('💾 Saved pending session ID:', sessionId);
    } catch (error) {
      console.error('❌ Failed to save pending session:', error);
    }
  };

  // Save complete authentication state - SIMPLIFIED
  const saveAuthState = async (sessionId, accessToken, profile) => {
    try {
      await AsyncStorage.setItem('authSessionId', sessionId);
      // await AsyncStorage.setItem('authAccessToken', accessToken);
      await AsyncStorage.setItem('authAccessToken', accessToken);
      await AsyncStorage.setItem('authProfile', JSON.stringify(profile));
      console.log('💾 ✅ Saved complete auth state to AsyncStorage');
      console.log('💾 SessionId:', sessionId);
      console.log('💾 AccessToken:', accessToken ? 'Present' : 'None');
      console.log('💾 Profile:', profile ? 'Present' : 'None');
    } catch (error) {
      console.error('💾 ❌ Failed to save auth state:', error);
    }
  };

  // Restore complete authentication state - SIMPLIFIED
  const restoreAuthState = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('authSessionId');
      const accessToken = await AsyncStorage.getItem('authAccessToken');
      const profileStr = await AsyncStorage.getItem('authProfile');
      
      console.log('💾 Checking AsyncStorage for auth state...');
      console.log('💾 SessionId:', sessionId ? 'Present' : 'None');
      console.log('💾 AccessToken:', accessToken ? 'Present' : 'None');
      console.log('💾 Profile:', profileStr ? 'Present' : 'None');
      
      if (sessionId && accessToken) {
        console.log('💾 ✅ Found complete auth state, restoring...');
        
        setSessionId(sessionId);
        setAccessToken(accessToken);
        if (profileStr) {
          setProfile(JSON.parse(profileStr));
        }
        
        console.log('💾 ✅ Auth state restored successfully!');
        return true;
      } else {
        console.log('💾 ❌ Incomplete auth state - missing sessionId or accessToken');
        return false;
      }
    } catch (error) {
      console.error('💾 ❌ Failed to restore auth state:', error);
      return false;
    }
  };

  const getPendingSession = async () => {
    try {
      const sessionId = await AsyncStorage.getItem('pendingSessionId');
      if (sessionId) {
        console.log('💾 Found pending session ID:', sessionId);
        return sessionId;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to get pending session:', error);
      return null;
    }
  };

  const clearPendingSession = async () => {
    try {
      await AsyncStorage.removeItem('pendingSessionId');
      console.log('💾 Cleared pending session ID');
    } catch (error) {
      console.error('❌ Failed to clear pending session:', error);
    }
  };

  // Resume OAuth session after app restart - SIMPLIFIED
  const resumeOAuth = async () => {
    console.log('🔄 ===== RESUMEOAUTH CALLED =====');
    
    // Try to restore complete authentication state (same pattern as Session ID)
    const authRestored = await restoreAuthState();
    if (authRestored) {
      console.log('🔄 ✅ Auth state restored successfully');
      return;
    }
    
    // If no complete auth state, check for pending session
    const pendingSessionId = await getPendingSession();
    if (pendingSessionId) {
      console.log('🔄 Found pending session, attempting to complete authentication...');
      try {
        await clearPendingSession();
        setSessionId(pendingSessionId);
        await fetchTokensAndProfile(pendingSessionId);
        console.log('🔄 ✅ Pending session completed successfully');
      } catch (error) {
        console.error('🔄 ❌ Failed to complete pending session:', error);
        // Clear invalid session data
        setSessionId(null);
        setAccessToken(null);
        setProfile(null);
        // Clear from AsyncStorage
        await AsyncStorage.removeItem('authSessionId');
        await AsyncStorage.removeItem('authAccessToken');
        await AsyncStorage.removeItem('authProfile');
        console.log('🔄 ✅ Cleared invalid session data');
      }
    } else {
      console.log('🔄 No pending session found');
    }
    console.log('🔄 ===== RESUMEOAUTH COMPLETED =====');
  };

  // Deep linking handler function
    const handleUrl = (event) => {
      const { url } = event;
      console.log('🔗 ===== DEEP LINK HANDLER CALLED =====');
      console.log('🔗 Deep link URL received:', url);
      console.log('🔗 Deep link timestamp:', new Date().toLocaleString());
      console.log('🔗 Current authentication state:', (sessionId && (accessToken || debugAccessToken)) ? 'AUTHENTICATED' : 'NOT AUTHENTICATED');
      console.log('🔗 Current sessionId:', sessionId);
      console.log('🔗 Current accessToken:', accessToken ? 'Present' : 'None');
      
      // Expect url like: googleapidemo://photos/selection?sessionId=xyz
      try {
        const parsed = new URL(url);
        console.log('🔗 Parsed URL protocol:', parsed.protocol);
        console.log('🔗 Parsed URL host:', parsed.host);
        console.log('🔗 Parsed URL pathname:', parsed.pathname);
        console.log('🔗 Parsed URL search params:', parsed.search);
        console.log('🔗 All search params:', Object.fromEntries(parsed.searchParams));
        
        if (parsed.protocol === 'googleapidemo:' && parsed.host === 'photos') {
          const sessionId = parsed.searchParams.get('sessionId');
          console.log('🔗 Extracted sessionId from googleapidemo:', sessionId);
          if (sessionId) {
            console.log('📸 Photo picker completed, fetching results for sessionId:', sessionId);
            setSessionId(sessionId);
            
            // Show immediate feedback
            Alert.alert("Deep Link Detected!", `Session ID: ${sessionId}\nProcessing authentication...`);
            
            // First authenticate, then fetch photos
            fetchTokensAndProfile(sessionId).then(() => {
              console.log('✅ Authentication completed, now fetching photos...');
              // Only fetch photos after authentication is complete
              setTimeout(() => {
                console.log('🔄 Fetching photos after successful authentication...');
            fetchPickerResult(sessionId);
              }, 1000);
            }).catch((error) => {
              console.error('❌ Authentication failed:', error);
              console.error('❌ This means the sessionId was not found on the backend');
              Alert.alert("Authentication Failed", "Could not complete authentication. The session may have expired or the backend is not accessible. Please try again.");
            });
          } else {
            console.log('❌ No sessionId found in deep link');
            Alert.alert("Deep Link Error", "No sessionId found in the deep link URL");
          }
        }
        // Also support legacy capshnz:// format
        else if (parsed.protocol === 'capshnz:' && parsed.host === 'photos') {
          const session = parsed.searchParams.get('session');
          console.log('🔗 Extracted session from capshnz:', session);
          if (session) {
            console.log('📸 Photo picker completed (legacy), fetching results for session:', session);
            setSessionId(session);
            
            // Show immediate feedback
            Alert.alert("Deep Link Detected!", `Session: ${session}\nProcessing authentication...`);
            
            // First authenticate, then fetch photos
            fetchTokensAndProfile(session).then(() => {
              console.log('✅ Authentication completed, now fetching photos...');
              // Only fetch photos after authentication is complete
              setTimeout(() => {
                console.log('🔄 Fetching photos after successful authentication...');
            fetchPickerResult(session);
              }, 1000);
            }).catch((error) => {
              console.error('❌ Authentication failed:', error);
              console.error('❌ This means the sessionId was not found on the backend');
              Alert.alert("Authentication Failed", "Could not complete authentication. The session may have expired or the backend is not accessible. Please try again.");
            });
          } else {
            console.log('❌ No session found in legacy deep link');
            Alert.alert("Deep Link Error", "No session found in the legacy deep link URL");
          }
        } else {
          console.log('🔗 Deep link URL does not match expected patterns');
          console.log('🔗 Expected: googleapidemo://photos/selection?sessionId=xyz');
          console.log('🔗 Expected: capshnz://photos/selection?session=xyz');
          console.log('🔗 Received:', url);
          console.log('🔗 Protocol:', parsed.protocol);
          console.log('🔗 Host:', parsed.host);
          Alert.alert("Deep Link Mismatch", `URL doesn't match expected patterns.\nReceived: ${url}\nExpected: googleapidemo://photos/selection?sessionId=xyz`);
        }
      } catch (error) {
        console.error('❌ Error parsing deep link URL:', error);
        console.error('❌ URL that failed to parse:', url);
        Alert.alert("Deep Link Error", `Failed to parse URL: ${url}\nError: ${error.message}`);
      }
    };

  useEffect(() => {
    console.log('🔗 ===== APP STARTUP/RESTART =====');
    console.log('🔗 Setting up deep link listeners...');
    console.log('🔗 Platform:', Platform.OS);
    console.log('🔗 Current time:', new Date().toLocaleString());
    console.log('🔗 App state on startup:', (sessionId && (accessToken || debugAccessToken)) ? 'AUTHENTICATED' : 'NOT AUTHENTICATED');
    console.log('🔗 Session ID on startup:', sessionId);
    console.log('🔗 ===== APP STARTUP/RESTART =====');

    // Listen for deep links
    const linkingListener = Linking.addEventListener('url', (event) => {
      console.log('🔗 Deep link event received:', event);
      console.log('🔗 Deep link URL:', event.url);
      console.log('🔗 Deep link timestamp:', new Date().toLocaleString());
      handleUrl(event);
    });

    // Check initial URL if app was launched via link
    Linking.getInitialURL().then((url) => {
      console.log('🔗 Checking initial URL:', url);
      if (url) {
        console.log('🔗 Initial deep link URL found:', url);
        handleUrl({ url });
      } else {
        console.log('🔗 No initial deep link URL');
      }
    }).catch((error) => {
      console.error('🔗 Error checking initial URL:', error);
    });

    // Check if we have a stored session ID
    const storedSessionId = null; // In production, use SecureStore

    if (storedSessionId) {
      console.log('🔗 Found stored session ID:', storedSessionId);
      setSessionId(storedSessionId);
      fetchProfile();
    } else {
      console.log('🔗 No stored session ID found');
    }

    // Load debug information from AsyncStorage FIRST, then resume OAuth
    const loadDebugInfo = async () => {
      try {
        const storedAccessToken = await AsyncStorage.getItem('authAccessToken');
        setDebugAccessToken(storedAccessToken);
        console.log('🔍 Debug: Stored AccessToken in AsyncStorage:', storedAccessToken ? 'Present' : 'None');
        
        // Check if we have both Session ID and Stored Access Token - if so, authenticate
        if (sessionId && storedAccessToken) {
          console.log('🔍 Both Session ID and Stored Access Token present - setting authenticated to true');
        }
        
        // Resume OAuth session after debug info is loaded
        resumeOAuth();
      } catch (error) {
        console.error('🔍 Debug: Error loading AccessToken from AsyncStorage:', error);
        // Still try to resume OAuth even if debug loading fails
        resumeOAuth();
      }
    };
    loadDebugInfo();

    // Handle OAuth callback for web platform
    if (Platform.OS === "web" && typeof window !== "undefined") {
      console.log('🔗 Web platform detected, checking URL parameters...');
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get("sessionId");
      const success = urlParams.get("success");

      console.log('🔗 URL params - sessionId:', sessionId, 'success:', success);

      if (sessionId && success === "true") {
        console.log('🎉 OAuth callback received with sessionId:', sessionId);
        setSessionId(sessionId);
        
        // Fetch tokens and profile first, then fetch picker results
        fetchTokensAndProfile(sessionId);
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // Cleanup deep linking listener
    return () => {
      console.log('🔗 Cleaning up deep link listener...');
      if (linkingListener) {
        linkingListener.remove();
      }
    };
  }, []);

  // Helper function to get OAuth URL with platform parameter
  const getOAuthUrl = async (baseUrl) => {
    // Force platform to 'android' for testing if Platform.OS is not working
    const platformParam = Platform.OS || 'android'; // Fallback to 'android' for testing
    const endpoint = `/api/oauth/url?platform=${platformParam}`;
    
    const response = await apiCallWithUrl(baseUrl, endpoint);
    return response;
  };

  // Helper function to fetch authenticated image data
  const fetchAuthenticatedImage = async (imageUrl) => {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } else {
        console.error(`Failed to fetch image: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error("Error fetching authenticated image:", error);
      return null;
    }
  };

  // Fetch tokens and profile from backend - SIMPLIFIED
  const fetchTokensAndProfile = async (sessionId) => {
    try {
      console.log('🔑 Fetching tokens and profile for sessionId:', sessionId);
      
      // Get tokens from backend
      const tokenData = await apiCall(`/api/oauth/token/${sessionId}`, { method: "GET" });
      console.log('🔑 ✅ Tokens received');
      
      setAccessToken(tokenData.access_token);
      
      // Fetch profile with the token
      const profileData = await apiCall("/api/user/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      setProfile(profileData);
      
      console.log('🔑 ✅ Authentication completed successfully!');
      
      // Save complete authentication state to AsyncStorage (same pattern as Session ID)
      await saveAuthState(sessionId, tokenData.access_token, profileData);
      
      Alert.alert(
        "Authentication Complete!", 
        "You're now signed in! Photos will be fetched automatically.",
        [
          {
            text: "OK",
            onPress: () => {
              // Automatically fetch photos after authentication
              if (sessionId) {
                console.log('🔄 Auto-fetching photos after authentication...');
                fetchPickerResult(sessionId);
              }
            }
          }
        ]
      );
      
    } catch (error) {
      console.error('🔑 ❌ Failed to fetch tokens and profile:', error);
      Alert.alert("Error", "Failed to complete authentication");
    }
  };

  // Fetch picker results from backend
  const fetchPickerResult = async (session, explicitAccessToken = null) => {
    try {
      console.log('📸 Fetching picker result for session:', session);
      setPhotoPickerLoading(true);
      
      const response = await apiCall(`/api/photos/picker/media?sessionId=${encodeURIComponent(session)}`, {
            headers: {
          // Use the explicitAccessToken if provided, otherwise fall back to state
          ...(explicitAccessToken && { Authorization: `Bearer ${explicitAccessToken}` }),
            },
          });

      // Transform the data to match React web app format
      const photos = [];
      
              for (const item of response.mediaItems || []) {
                const baseUrl = item.mediaFile?.baseUrl;

                if (baseUrl) {
                  // Fetch authenticated thumbnail
                  const thumbnailUrl = baseUrl + "=w200-h200";
                  const authenticatedThumbnailUrl = await fetchAuthenticatedImage(thumbnailUrl);

                  const photo = {
                    id: item.id,
                    name: item.mediaFile?.filename || `Photo ${item.id}`,
                    url: baseUrl,
                    thumbnails: [
                      {
                        url: authenticatedThumbnailUrl || thumbnailUrl, // Use authenticated URL if available, fallback to original
                      },
                    ],
                    mimeType: item.mediaFile?.mimeType,
                    creationTime: item.createTime,
                    width: item.mediaFile?.mediaFileMetadata?.width,
                    height: item.mediaFile?.mediaFileMetadata?.height,
                  };
                  photos.push(photo);
                }
              }
      
      if (photos.length > 0) {
        console.log('✅ Photo picker results received:', photos.length, 'photos');
        setGooglePhotos(photos);
        Alert.alert("Success", `Selected ${photos.length} photos from Google Photos!`);
      } else {
        console.log('❌ No selection found for session:', session);
        Alert.alert("No Photos", "No photos were selected in the picker");
      }
    } catch (error) {
      console.error('❌ Failed to fetch picker result:', error);
      Alert.alert("Error", "Failed to fetch selected photos");
    } finally {
      setPhotoPickerLoading(false);
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

  const apiCallWithUrl = async (baseUrl, endpoint, options = {}) => {
    const url = `${baseUrl}${endpoint}`;
    
    const config = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
    };

    // Add body for POST/PUT requests
    if (options.data && (options.method === "POST" || options.method === "PUT")) {
      config.body = JSON.stringify(options.data);
    }

    try {
      console.log(`🌐 Making API call to: ${url}`);
      console.log(`🌐 Config:`, config);
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Response status: ${response.status}`);
      console.log("✅ API Success:", data);
      return data;
    } catch (error) {
      console.error("❌ Network Error:", error.message);
      console.error("❌ Full error:", error);
      throw new Error(`Network request failed: ${error.message}`);
    }
  };

  const loginLocal = async () => {
    try {
      setLoading(true);
      setApiError(null);
      setApiResponse(null);
      console.log("🔐 Starting AWS OAuth flow...");

      // Get OAuth URL from AWS API Gateway with platform parameter
      setCurrentApiUrl(AWS_API_URL);
      const response = await getOAuthUrl(AWS_API_URL);
      console.log("🔗 AWS OAuth URL received:", JSON.stringify(response, null, 2));
      
      setApiResponse(response);
      
      const { authUrl, sessionId } = response;
      
      // Store session ID for later use
      setSessionId(sessionId);

      // For web platform, use direct window redirect
      if (Platform.OS === "web") {
        // Redirect to Google OAuth
        window.location.href = authUrl;
        return;
      }

      // For mobile platforms, open in external browser
      console.log("🌐 Opening AWS OAuth URL in external browser...");
      const supported = await Linking.canOpenURL(authUrl);
      
      if (supported) {
        await Linking.openURL(authUrl);
        Alert.alert(
          "AWS OAuth Started", 
          "Please complete the authentication in your browser, then return to this app."
        );
      } else {
        Alert.alert("Error", "Cannot open OAuth URL");
      }
    } catch (error) {
      console.error("AWS login error:", error);
      setApiError(error.message);
      Alert.alert("Error", `AWS login failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loginLive = async () => {
    try {
      setLoading(true);
      setApiError(null);
      setApiResponse(null);
      setCurrentApiUrl(AWS_API_URL);
      console.log("🔐 Starting AWS OAuth flow...");

      // Get OAuth URL from AWS API Gateway with platform parameter
      const response = await getOAuthUrl(AWS_API_URL);
      console.log("🔗 AWS OAuth URL received:", JSON.stringify(response, null, 2));
      
      setApiResponse(response);
      
      const { authUrl, sessionId } = response;
      
      // Store session ID for later use
      setSessionId(sessionId);

      // For web platform, use direct window redirect
      if (Platform.OS === "web") {
        // Redirect to Google OAuth
        window.location.href = authUrl;
        return;
      }

      // For mobile platforms, open in external browser
      console.log("🌐 Opening AWS OAuth URL in external browser...");
      const supported = await Linking.canOpenURL(authUrl);
      
      if (supported) {
        await Linking.openURL(authUrl);
        Alert.alert(
          "AWS OAuth Started", 
          "Please complete the authentication in your browser, then return to this app."
        );
      } else {
        Alert.alert("Error", "Cannot open OAuth URL");
      }
    } catch (error) {
      console.error("AWS login error:", error);
      setApiError(error.message);
      Alert.alert("Error", `AWS login failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // New function for your desired flow: Photo Picker Flow
  const startPhotoPickerFlow = async () => {
    try {
      setLoading(true);
      setApiError(null);
      setApiResponse(null);
      setCurrentApiUrl(AWS_API_URL);
      console.log("📸 Starting Photo Picker Flow...");

      // Get OAuth URL from AWS API Gateway with platform parameter
      const response = await getOAuthUrl(AWS_API_URL);
      console.log("🔗 Photo Picker OAuth URL received:", JSON.stringify(response, null, 2));
      
      setApiResponse(response);
      
      const { authUrl, sessionId } = response;
      
      // Store session ID for later use
      setSessionId(sessionId);
      
      // Save session ID to AsyncStorage before opening OAuth URL
      await savePendingSession(sessionId);

      // Open OAuth URL in browser
      console.log("🌐 Opening OAuth URL in browser...");
      const supported = await Linking.canOpenURL(authUrl);
      
      if (supported) {
        await Linking.openURL(authUrl);
        Alert.alert(
          "AWS Photo Picker Flow Started", 
          "Please complete authentication in your browser. You'll be redirected to the photo picker, then back to this app."
        );
      } else {
        Alert.alert("Error", "Cannot open OAuth URL");
      }
    } catch (error) {
      console.error("Photo Picker Flow error:", error);
      setApiError(error.message);
      Alert.alert("Error", `Photo Picker Flow failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };


  const logout = async () => {
    setProfile(null);
    setAccessToken(null);
    setSessionId(null);
    setDriveFiles(null);
    setCalendarEvents(null);
    setSelectedPhotos([]);
    setGooglePhotos([]);

    // Clear auth state from AsyncStorage (but keep Stored Access Token)
    try {
      await AsyncStorage.removeItem('authSessionId');
      await AsyncStorage.removeItem('authProfile');
      // Keep authAccessToken in AsyncStorage for future use
      console.log('💾 Cleared auth state from AsyncStorage (kept Stored Access Token)');
    } catch (error) {
      console.error('❌ Failed to clear auth state:', error);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await apiCall(`/api/user/profile?sessionId=${sessionId}`);
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
      const data = await apiCall(`/api/drive/files?sessionId=${sessionId}`);
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
      const data = await apiCall(`/api/calendar/events?date=${selectedDate}&sessionId=${sessionId}`);
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
      const data = await apiCall(`/api/drive/photos?sessionId=${sessionId}`);
      setSelectedPhotos(data.photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      Alert.alert("Error", "Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  };

  const startGooglePicker = async () => {
    if (!accessToken) {
      Alert.alert("Not Authenticated", "Please sign in first before using the Photo Picker.");
      return;
    }

    try {
      setPhotoPickerLoading(true);
      console.log("📸 Starting Google Photo Picker...");

      // First validate the session is still valid
      try {
        await apiCall("/api/user/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log("✅ Session is still valid");
      } catch (error) {
        console.log("❌ Session expired, need to re-authenticate");
        Alert.alert(
          "Session Expired", 
          "Your session has expired. Please sign in again to use the Photo Picker.",
          [
            { text: "OK", onPress: () => logout() }
          ]
        );
        return;
      }

      // Create Photo Picker session
      const session = await apiCall("/api/photos/picker/session", {
        method: "POST",
      });

      if (!session.pickerUri) {
        throw new Error("Failed to get picker URI");
      }

      console.log("Redirecting to Photo Picker UI:", session.pickerUri);

      // Open the picker in a new window/tab
      const pickerWindow = window.open(session.pickerUri, "_blank", "width=800,height=600");

      // Poll for when the window is closed or check for updates
      const checkPickerStatus = setInterval(async () => {
        if (pickerWindow.closed) {
          clearInterval(checkPickerStatus);

          // Wait a bit for the session to be updated on Google's side
          setTimeout(async () => {
            try {
              const data = await apiCall(`/api/photos/picker/media?sessionId=${session.id}`);
              
              // Transform the data to match React web app format
              const photos = [];
              
              for (const item of data.mediaItems || []) {
                const baseUrl = item.mediaFile?.baseUrl;

                if (baseUrl) {
                  // Fetch authenticated thumbnail
                  const thumbnailUrl = baseUrl + "=w200-h200";
                  const authenticatedThumbnailUrl = await fetchAuthenticatedImage(thumbnailUrl);

                  const photo = {
                    id: item.id,
                    name: item.mediaFile?.filename || `Photo ${item.id}`,
                    url: baseUrl,
                    thumbnails: [
                      {
                        url: authenticatedThumbnailUrl || thumbnailUrl, // Use authenticated URL if available, fallback to original
                      },
                    ],
                    mimeType: item.mediaFile?.mimeType,
                    creationTime: item.createTime,
                    width: item.mediaFile?.mediaFileMetadata?.width,
                    height: item.mediaFile?.mediaFileMetadata?.height,
                  };
                  photos.push(photo);
                }
              }
              
              if (photos.length > 0) {
                console.log('✅ Photo picker results received:', photos.length, 'photos');
                setGooglePhotos(photos);
                Alert.alert("Success", `Selected ${photos.length} photos from Google Photos!`);
      } else {
                console.log('❌ No selection found for session:', session.id);
                Alert.alert("No Photos", "No photos were selected in the picker");
      }
    } catch (error) {
              console.error('❌ Failed to fetch picker result:', error);
              Alert.alert("Error", "Failed to fetch selected photos");
            }
          }, 3000); // Wait 3 seconds for session to update
        }
      }, 1000);

      // Also try to fetch photos after a longer delay in case the window doesn't close properly
      setTimeout(async () => {
        clearInterval(checkPickerStatus);
        try {
          const data = await apiCall(`/api/photos/picker/media?sessionId=${session.id}`);
          
          // Transform the data to match React web app format
          const photos = [];
          
          for (const item of data.mediaItems || []) {
            const baseUrl = item.mediaFile?.baseUrl;

            if (baseUrl) {
              // Fetch authenticated thumbnail
              const thumbnailUrl = baseUrl + "=w200-h200";
              const authenticatedThumbnailUrl = await fetchAuthenticatedImage(thumbnailUrl);

              const photo = {
                id: item.id,
                name: item.mediaFile?.filename || `Photo ${item.id}`,
                url: baseUrl,
                thumbnails: [
                  {
                    url: authenticatedThumbnailUrl || thumbnailUrl, // Use authenticated URL if available, fallback to original
                  },
                ],
                mimeType: item.mediaFile?.mimeType,
                creationTime: item.createTime,
                width: item.mediaFile?.mediaFileMetadata?.width,
                height: item.mediaFile?.mediaFileMetadata?.height,
              };
              photos.push(photo);
            }
          }
          
          if (photos.length > 0) {
            console.log('✅ Photo picker results received:', photos.length, 'photos');
            setGooglePhotos(photos);
            Alert.alert("Success", `Selected ${photos.length} photos from Google Photos!`);
      } else {
            console.log('❌ No selection found for session:', session.id);
            Alert.alert("No Photos", "No photos were selected in the picker");
      }
    } catch (error) {
          console.error('❌ Failed to fetch picker result:', error);
          Alert.alert("Error", "Failed to fetch selected photos");
        }
      }, 30000); // 30 second timeout
    } catch (error) {
      console.error("Error starting Photo Picker:", error);
      Alert.alert("Error", "Failed to start Photo Picker.  Please Sign In Again.");
    } finally {
      setPhotoPickerLoading(false);
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

        {!(sessionId && (accessToken || debugAccessToken)) ? (
          <View>
            {/* Local Host Button */}
            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#007bff", marginBottom: 8 }]} 
              onPress={loginLocal} 
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? "Signing in..." : "Sign In AWS"}
              </Text>
            </TouchableOpacity>

            {/* Live Server Button */}
            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#28a745" }]} 
              onPress={loginLive} 
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? "Signing in..." : "Sign In AWS (Alt)"}
              </Text>
            </TouchableOpacity>

            {/* Photo Picker Flow Button (Your Desired Flow) */}
            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#6f42c1" }]} 
              onPress={startPhotoPickerFlow} 
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? "Starting..." : "Photo Picker Flow"}
              </Text>
            </TouchableOpacity>


            {/* API Response Display */}
            {apiResponse && (
              <View style={styles.responseContainer}>
                <Text style={styles.responseTitle}>📡 API Response:</Text>
                <ScrollView style={styles.responseScrollView}>
                  <Text style={styles.responseText}>
                    {JSON.stringify(apiResponse, null, 2)}
                  </Text>
                </ScrollView>
              </View>
            )}

            {/* API Error Display */}
            {apiError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorTitle}>❌ API Error:</Text>
                <Text style={styles.errorText}>{apiError}</Text>
              </View>
            )}

            {/* Debug Info */}
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>🔍 Debug Info:</Text>
              <Text style={styles.debugText}>Current API URL: {currentApiUrl || 'None'}</Text>
              <Text style={styles.debugText}>Platform: {Platform.OS || 'UNDEFINED'}</Text>
              <Text style={styles.debugText}>Platform Type: {typeof Platform.OS}</Text>
              <Text style={styles.debugText}>Build Time: {componentRenderTime}</Text>
              <Text style={styles.debugText}>Version: {appVersion}</Text>
              <Text style={styles.debugText}>Session ID: {sessionId || 'None'}</Text>
              <Text style={styles.debugText}>Access Token: {accessToken ? 'Present' : 'None'}</Text>
              <Text style={styles.debugText}>Access Token (last 10): {accessToken ? '...' + accessToken.substring(accessToken.length - 10) : 'None'}</Text>
              <Text style={styles.debugText}>Stored Access Token: {debugAccessToken ? 'Present' : 'None'}</Text>
              <Text style={styles.debugText}>Stored Access Token (last 10): {debugAccessToken ? '...' + debugAccessToken.substring(debugAccessToken.length - 10) : 'None'}</Text>
              <Text style={styles.debugText}>Profile: {profile ? 'Loaded' : 'None'}</Text>
              <Text style={styles.debugText}>Authenticated: {(sessionId && (accessToken || debugAccessToken)) ? 'True' : 'False'}</Text>
            </View>
          </View>
        ) : (
          <View>
            {/* Profile Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile Information</Text>
              <View style={styles.profileCard}>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Name:</Text> {profile?.names?.[0]?.displayName || "N/A"}
                </Text>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Email:</Text> {profile?.emailAddresses?.[0]?.value || "N/A"}
                </Text>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Session ID:</Text> {sessionId || "N/A"}
                </Text>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Access Token:</Text> {accessToken ? "Present" : "N/A"}
                </Text>
                <Text style={styles.profileText}>
                  <Text style={styles.bold}>Access Token (last 10): {accessToken ? '...' + accessToken.substring(accessToken.length - 10) : 'None'}</Text>
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
                <TouchableOpacity style={[styles.photoButton, photoPickerLoading && styles.disabledButton]} onPress={startGooglePicker} disabled={photoPickerLoading}>
                  <Text style={styles.photoButtonText}>{photoPickerLoading ? "Starting Picker..." : "Start Photo Picker"}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>
                💡 The Photo Picker will open in your browser. Selected photos will appear automatically when you return to the app.
              </Text>
              <TouchableOpacity 
                style={[styles.photoButton, { backgroundColor: "#ff6b6b", marginTop: 8 }, photoPickerLoading && styles.disabledButton]} 
                onPress={() => {
                  if (sessionId) {
                    console.log('🔄 Manual refresh triggered for sessionId:', sessionId);
                    fetchPickerResult(sessionId);
                  } else {
                    Alert.alert("No Session", "Please complete authentication first");
                  }
                }}
                disabled={photoPickerLoading}
              >
                <Text style={styles.photoButtonText}>
                  {photoPickerLoading ? "🔄 Refreshing..." : "🔄 Refresh Photos"}
                </Text>
              </TouchableOpacity>
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
  helpText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
  responseContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  responseTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#495057",
    marginBottom: 8,
  },
  responseScrollView: {
    maxHeight: 150,
  },
  responseText: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#495057",
    lineHeight: 14,
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f8d7da",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f5c6cb",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#721c24",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#721c24",
  },
  debugContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#e7f3ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b3d9ff",
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0066cc",
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: "#0066cc",
    marginBottom: 4,
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
  // WebView Modal styles
  webViewContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  webViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  webViewCloseButton: {
    backgroundColor: "#ff6b6b",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  webViewCloseButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  webViewHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  webViewSpacer: {
    width: 80, // Same width as close button to center title
  },
  webViewContent: {
    flex: 1,
    padding: 16,
  },
  webViewInstructions: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
  },
  webViewPlaceholder: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e9ecef",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  webViewPlaceholderText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
  },
  webViewPlaceholderSubtext: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    fontStyle: "italic",
  },
});
