import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Dimensions, Platform, Linking, TextInput } from "react-native";
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const AWS_API_URL = 'https://bmarz6chil.execute-api.us-west-1.amazonaws.com/dev';
const API_BASE_URL = AWS_API_URL;

export default function App() {
  // ============================================================================
  // STATE VARIABLES - SIMPLIFIED
  // ============================================================================
  
  // Core authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Start as false, will be updated by loadDebugInfo
  const [profile, setProfile] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  
  // API data state
  const [driveFiles, setDriveFiles] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [googlePhotos, setGooglePhotos] = useState([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [photoPickerLoading, setPhotoPickerLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [apiResponse, setApiResponse] = useState(null);
  const [apiError, setApiError] = useState(null);

  // ============================================================================
  // ASYNCSTORAGE FUNCTIONS - ONLY TWO MAIN FUNCTIONS
  // ============================================================================

  // 1. Save Previous Auth State (before starting new authentication)
  const savePreviousAuthState = async () => {
    try {
      console.log('💾 Saving previous auth state...');
      
      const prevSessionId = await AsyncStorage.getItem('authSessionId');
      const prevAccessToken = await AsyncStorage.getItem('authAccessToken');
      const prevProfile = await AsyncStorage.getItem('authProfile');
      
      if (prevSessionId || prevAccessToken || prevProfile) {
        await AsyncStorage.setItem('previousSessionId', prevSessionId);
        await AsyncStorage.setItem('previousAccessToken', prevAccessToken);
        await AsyncStorage.setItem('previousProfile', prevProfile);
        console.log('💾 ✅ Previous auth state saved');
      } else {
        console.log('💾 ℹ️ No previous auth state to save');
      }
      
      // Refresh debug info
      // await loadDebugInfo();
    } catch (error) {
      console.error('💾 ❌ Failed to save previous auth state:', error);
    }
  };

  // 2. Save Current Auth State (after successful authentication)
  const saveAuthState = async (sessionId, accessToken, profile) => {
    try {
      console.log('💾 Saving current auth state...');
      
      await AsyncStorage.setItem('authSessionId', sessionId);
      await AsyncStorage.setItem('authAccessToken', accessToken);
      await AsyncStorage.setItem('authProfile', JSON.stringify(profile));
      
      // Update state variables
      setSessionId(sessionId);
      setAccessToken(accessToken);
      setProfile(profile);
      setIsAuthenticated(true);
      
      // Update debug info directly without calling loadDebugInfo
      setDebugInfo(prev => ({
        ...prev,
        sessionId,
        accessToken,
        profile,
      }));
      
      console.log('💾 ✅ Current auth state saved and authenticated set to true');
    } catch (error) {
      console.error('💾 ❌ Failed to save current auth state:', error);
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const printAuthState = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const items = await AsyncStorage.multiGet(keys);
      
      console.log('📦 AsyncStorage contents (alphabetical order):');
      const sortedItems = items.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
      
      sortedItems.forEach(([key, value]) => {
        let displayValue = value;
        try {
          displayValue = JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          // not JSON, keep as-is
        }
        console.log(`🔑 ${key}:`, displayValue);
      });
    } catch (error) {
      console.error('❌ Error reading AsyncStorage:', error);
    }
  };

  const printAsyncStorage = async () => {
    try {
      console.log('📦 ===== ASYNCSTORAGE DETAILED DUMP =====');
      
      // Get all keys
      const keys = await AsyncStorage.getAllKeys();
      console.log('📦 Total keys in AsyncStorage:', keys.length);
      console.log('📦 Keys:', keys);
      
      // Print each variable separately
      const authSessionId = await AsyncStorage.getItem('authSessionId');
      const authAccessToken = await AsyncStorage.getItem('authAccessToken');
      const authProfile = await AsyncStorage.getItem('authProfile');
      const previousSessionId = await AsyncStorage.getItem('previousSessionId');
      const previousAccessToken = await AsyncStorage.getItem('previousAccessToken');
      const previousProfile = await AsyncStorage.getItem('previousProfile');
      const pendingSessionId = await AsyncStorage.getItem('pendingSessionId');
      
      console.log('📦 ===== CURRENT AUTH DATA =====');
      console.log('📦 authSessionId:', authSessionId ? `"${authSessionId}"` : 'null');
      console.log('📦 authAccessToken:', authAccessToken ? `"${authAccessToken.substring(0, 20)}...${authAccessToken.substring(authAccessToken.length - 10)}"` : 'null');
      console.log('📦 authProfile:', authProfile ? 'Present (JSON)' : 'null');
      
      if (authProfile) {
        try {
          const profileObj = JSON.parse(authProfile);
          console.log('📦   - Email:', profileObj.emailAddresses?.[0]?.value || 'No email');
          console.log('📦   - Name:', profileObj.names?.[0]?.displayName || 'No name');
        } catch (e) {
          console.log('📦   - Error parsing profile:', e.message);
        }
      }
      
      console.log('📦 ===== PREVIOUS AUTH DATA =====');
      console.log('📦 previousSessionId:', previousSessionId ? `"${previousSessionId}"` : 'null');
      console.log('📦 previousAccessToken:', previousAccessToken ? `"${previousAccessToken.substring(0, 20)}...${previousAccessToken.substring(previousAccessToken.length - 10)}"` : 'null');
      console.log('📦 previousProfile:', previousProfile ? 'Present (JSON)' : 'null');
      
      if (previousProfile) {
        try {
          const profileObj = JSON.parse(previousProfile);
          console.log('📦   - Email:', profileObj.emailAddresses?.[0]?.value || 'No email');
          console.log('📦   - Name:', profileObj.names?.[0]?.displayName || 'No name');
        } catch (e) {
          console.log('📦   - Error parsing previous profile:', e.message);
        }
      }
      
      console.log('📦 ===== PENDING DATA =====');
      console.log('📦 pendingSessionId:', pendingSessionId ? `"${pendingSessionId}"` : 'null');
      
      console.log('📦 ===== ALL OTHER DATA =====');
      const otherKeys = keys.filter(key => 
        !['authSessionId', 'authAccessToken', 'authProfile', 
          'previousSessionId', 'previousAccessToken', 'previousProfile', 
          'pendingSessionId'].includes(key)
      );
      
      if (otherKeys.length > 0) {
        for (const key of otherKeys) {
          const value = await AsyncStorage.getItem(key);
          console.log(`📦 ${key}:`, value ? `"${value}"` : 'null');
        }
      } else {
        console.log('📦 No other data found');
      }
      
      console.log('📦 ===== END ASYNCSTORAGE DUMP =====');
    } catch (error) {
      console.error('❌ Error reading AsyncStorage:', error);
    }
  };

  // Debug state for displaying AsyncStorage info
  const [debugInfo, setDebugInfo] = useState({
    sessionId: null,
    accessToken: null,
    profile: null,
    previousSessionId: null,
    previousAccessToken: null,
    previousProfile: null,
  });

  const loadDebugInfo = async () => {
    try {
      console.log('🔍 Loading debug info...');
      
      const sessionId = await AsyncStorage.getItem('authSessionId');
      const accessToken = await AsyncStorage.getItem('authAccessToken');
      const profileStr = await AsyncStorage.getItem('authProfile');
      const previousSessionId = await AsyncStorage.getItem('previousSessionId');
      const previousAccessToken = await AsyncStorage.getItem('previousAccessToken');
      const previousProfileStr = await AsyncStorage.getItem('previousProfile');

      console.log('🔍 AsyncStorage data:');
      console.log('🔍 sessionId:', sessionId ? 'Present' : 'None');
      console.log('🔍 accessToken:', accessToken ? 'Present' : 'None');
      console.log('🔍 profileStr:', profileStr ? 'Present' : 'None');

      let profile = null;
      let previousProfile = null;
      
      try {
        profile = profileStr ? JSON.parse(profileStr) : null;
      } catch (e) {
        console.log('Error parsing profile:', e);
      }
      
      try {
        previousProfile = previousProfileStr ? JSON.parse(previousProfileStr) : null;
      } catch (e) {
        console.log('Error parsing previous profile:', e);
      }

      setDebugInfo({
        sessionId,
        accessToken,
        profile,
        previousSessionId,
        previousAccessToken,
        previousProfile,
      });

      // Always update authentication state based on current AsyncStorage data
      const hasValidAuth = sessionId && accessToken && profile;
      console.log('🔍 Current isAuthenticated state:', isAuthenticated);
      console.log('🔍 hasValidAuth:', hasValidAuth);
      setIsAuthenticated(hasValidAuth);
      console.log('🔍 Setting isAuthenticated to:', hasValidAuth);
      
      if (hasValidAuth) {
        console.log('🔍 Debug: Found valid auth data, setting authenticated to true');
        // Also update the state variables to match AsyncStorage
        setSessionId(sessionId);
        setAccessToken(accessToken);
        setProfile(profile);
      } else {
        console.log('🔍 Debug: No valid auth data found, setting authenticated to false');
      }
    } catch (error) {
      console.error('❌ Error loading debug info:', error);
    }
  };

  const clearAsyncStorage = async () => {
    try {
      await AsyncStorage.clear();
      console.log('🧨 Cleared all AsyncStorage data');
      
      // Clear all state variables
      setIsAuthenticated(false);
      setSessionId(null);
      setAccessToken(null);
      setProfile(null);
      setDebugInfo({
        sessionId: null,
        accessToken: null,
        profile: null,
        previousSessionId: null,
        previousAccessToken: null,
        previousProfile: null,
      });
      
      Alert.alert("Success", "AsyncStorage cleared successfully!");
    } catch (error) {
      console.error('❌ Failed to clear AsyncStorage:', error);
      Alert.alert("Error", `Failed to clear AsyncStorage: ${error.message}`);
    }
  };

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

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

    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
    }
    return response.json();
  };

  // ============================================================================
  // AUTHENTICATION FUNCTIONS
  // ============================================================================

  const loginGoogle = async () => {
    try {
      setLoading(true);
      console.log("🔐 Starting Google OAuth flow...");
      
      // Save previous auth state before starting new OAuth
      await savePreviousAuthState();

      // Get OAuth URL
      const response = await apiCall(`/api/oauth/url?platform=${Platform.OS}`);
      const { authUrl, sessionId: newSessionId } = response;
      
      setSessionId(newSessionId);

      // Platform-specific OAuth handling
      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }

      // Mobile: Open in external browser
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
        Alert.alert("Google Sign In Started", "Please complete authentication in your browser, then return to this app.");
      } else {
        Alert.alert("Error", "Cannot open OAuth URL");
      }
    } catch (error) {
      console.error("Google login error:", error);
      setApiError(error.message);
      Alert.alert("Error", `Google login failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear only the current state variables (not AsyncStorage)
      setIsAuthenticated(false);
      setProfile(null);
      setAccessToken(null);
      setSessionId(null);
      setDriveFiles(null);
      setCalendarEvents(null);
      setSelectedPhotos([]);
      setGooglePhotos([]);
      
      console.log('💾 Logged out - cleared state but kept AsyncStorage data');
      
      // Refresh debug info to show the preserved AsyncStorage data
      // await loadDebugInfo();
    } catch (error) {
      console.error('❌ Failed to logout:', error);
    }
  };

  const fetchProfile = async () => {
    try {
      const profileData = await apiCall("/api/user/profile");
      setProfile(profileData);
      return profileData;
    } catch (error) {
      console.error('❌ Failed to fetch profile:', error);
      throw error;
    }
  };

  const fetchTokensAndProfile = async (sessionId) => {
    try {
      console.log('🔑 Starting authentication process for sessionId:', sessionId);
      
      // Get tokens
      console.log('🔑 Fetching tokens...');
      const tokenData = await apiCall(`/api/oauth/token/${sessionId}`, { method: "GET" });
      console.log('🔑 Tokens received:', tokenData.access_token ? 'Present' : 'None');
      
      if (!tokenData.access_token) {
        throw new Error('No access token received from backend');
      }
      
      // Update access token state immediately
      setAccessToken(tokenData.access_token);
      
      // Get profile using the access token
      console.log('🔑 Fetching profile with access token...');
      const profileData = await apiCall("/api/user/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      console.log('🔑 Profile received:', profileData.emailAddresses?.[0]?.value || 'None');
      setProfile(profileData);
      
      // Save to AsyncStorage
      console.log('🔑 Saving auth state...');
      await saveAuthState(sessionId, tokenData.access_token, profileData);
      
      console.log('🔑 ✅ Authentication completed successfully!');
      printAsyncStorage();
      console.log('🔑 Current isAuthenticated state should be true');
    } catch (error) {
      console.error('🔑 ❌ Failed to fetch tokens and profile:', error);
      setIsAuthenticated(false);
      throw error;
    }
  };

  // ============================================================================
  // API CALL FUNCTIONS
  // ============================================================================

  const fetchDriveFiles = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/api/drive/files?sessionId=${sessionId}`);
      setDriveFiles(data);
    } catch (error) {
      console.error('❌ Failed to fetch Drive files:', error);
      setApiError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      console.log('📅 Fetching calendar events for date:', selectedDate);
      console.log('--Fetch Calendar Events-----------------------------');
      await printAsyncStorage();
      console.log('----------------------------------------------------');
      
      // Use the same simple API call as the old version that worked
      const data = await apiCall(`/api/calendar/events?date=${selectedDate}&sessionId=${sessionId}`);
      setCalendarEvents(data);
      
      console.log('📅 Calendar events received:', data);
      console.log('📅 Events count (items):', data.items?.length || 0);
      console.log('📅 Events count (events):', data.events?.length || 0);
    } catch (error) {
      console.error('❌ Failed to fetch Calendar events:', error);
      setApiError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    try {
      setPhotoPickerLoading(true);
      const data = await apiCall(`/api/photos/picker/media?sessionId=${sessionId}`);
      
      // Transform data for display
      const photos = [];
      for (const item of data.mediaItems || []) {
        const baseUrl = item.mediaFile?.baseUrl;
        if (baseUrl) {
          const photo = {
            id: item.id,
            name: item.mediaFile?.filename || `Photo ${item.id}`,
            url: baseUrl,
            thumbnails: [{ url: baseUrl + "=w200-h200" }],
            mimeType: item.mediaFile?.mimeType,
            creationTime: item.createTime,
          };
          photos.push(photo);
        }
      }
      
      setGooglePhotos(photos);
      console.log('✅ Photos loaded:', photos.length);
    } catch (error) {
      console.error('❌ Failed to fetch photos:', error);
      Alert.alert("Error", "Failed to fetch photos");
    } finally {
      setPhotoPickerLoading(false);
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

      // Create Photo Picker session
      const session = await apiCall("/api/photos/picker/session", { method: "POST" });
      
      if (!session.pickerUri) {
        throw new Error("Failed to get picker URI");
      }

      // Platform-specific handling
      if (Platform.OS === "web") {
        // Web: Open in new window with polling
        const pickerWindow = window.open(session.pickerUri, "_blank", "width=800,height=600");
        
        const checkPickerStatus = setInterval(async () => {
          if (pickerWindow.closed) {
            clearInterval(checkPickerStatus);
            setTimeout(async () => {
              try {
                await fetchPhotos();
                Alert.alert("Success", "Photos loaded successfully!");
              } catch (error) {
                console.error('❌ Failed to fetch photos:', error);
              }
            }, 3000);
          }
        }, 1000);
      } else {
        // Mobile: Open in external browser
        const supported = await Linking.canOpenURL(session.pickerUri);
        if (supported) {
          await Linking.openURL(session.pickerUri);
          Alert.alert(
            "Photo Picker Opened", 
            "Please select your photos in the browser, then return to this app and click 'Refresh Photos' to see your selections."
          );
        } else {
          Alert.alert("Error", "Cannot open Photo Picker URL");
        }
      }
    } catch (error) {
      console.error("Error starting Photo Picker:", error);
      Alert.alert("Error", "Failed to start Photo Picker");
    } finally {
      setPhotoPickerLoading(false);
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString();
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('image')) return '🖼️';
    if (mimeType?.includes('video')) return '🎥';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('text')) return '📝';
    return '📁';
  };

  // ============================================================================
  // DEEP LINK HANDLING
  // ============================================================================

  const handleUrl = (event) => {
    const { url } = event;
    console.log('🔗 Deep link received:', url);
    
    try {
      // Parse session ID from deep link
      const urlObj = new URL(url);
      const sessionIdParam = urlObj.searchParams.get('sessionId');
      
      if (sessionIdParam) {
        console.log('🔗 Session ID found:', sessionIdParam);
        setSessionId(sessionIdParam);
        console.log('🔗 Calling fetchTokensAndProfile...');
        fetchTokensAndProfile(sessionIdParam).catch(error => {
          console.error('🔗 Error in fetchTokensAndProfile:', error);
        });
      } else {
        console.log('🔗 No session ID found in deep link');
      }
    } catch (error) {
      console.error('🔗 Error parsing deep link:', error);
    }
  };

  // ============================================================================
  // APP INITIALIZATION
  // ============================================================================

  useEffect(() => {
    // Set up deep link listener
    const linkingListener = Linking.addEventListener('url', handleUrl);
    
    // Check initial URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl({ url });
      }
    });

    // Load debug info on app start
    loadDebugInfo();

    return () => {
      linkingListener?.remove();
    };
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
        {isAuthenticated !== true ? (
          // LOGIN PAGE
          <View style={styles.loginContainer}>
            <Text style={styles.title}>Google API Demo</Text>
            <Text style={styles.subtitle}>React Native App</Text>
            
            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#4285F4" }]} 
              onPress={loginGoogle} 
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? "Signing in..." : "Sign In Google"}
              </Text>
            </TouchableOpacity>

            {/* Debug Buttons */}
            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#17a2b8", marginTop: 8 }]} 
              onPress={printAuthState}
            >
              <Text style={styles.loginButtonText}>📦 Show Async Storage</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#6f42c1", marginTop: 8 }]} 
              onPress={printAsyncStorage}
            >
              <Text style={styles.loginButtonText}>🔍 Detailed AsyncStorage</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.loginButton, { backgroundColor: "#dc3545", marginTop: 8 }]} 
              onPress={clearAsyncStorage}
            >
              <Text style={styles.loginButtonText}>🧨 Clear Async Storage</Text>
            </TouchableOpacity>

            {/* Debug Info Section */}
            <View style={styles.debugSection}>
              <Text style={styles.debugTitle}>🔍 Debug Info</Text>
              
              <View style={styles.debugContainer}>
                <View style={styles.debugSubSection}>
                  <Text style={styles.debugSectionTitle}>Authentication Status</Text>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>Authenticated:</Text>
                    <Text style={[styles.debugValue, { 
                      color: isAuthenticated ? '#28a745' : '#dc3545',
                      fontWeight: 'bold'
                    }]}>
                      {isAuthenticated ? 'True' : 'False'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.debugSubSection}>
                  <Text style={styles.debugSectionTitle}>Current Auth</Text>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>SessionID:</Text>
                    <Text style={styles.debugValue}>{debugInfo.sessionId || 'None'}</Text>
                  </View>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>AccessToken (last 10):</Text>
                    <Text style={styles.debugValue}>
                      {debugInfo.accessToken ? '...' + debugInfo.accessToken.substring(debugInfo.accessToken.length - 10) : 'None'}
                    </Text>
                  </View>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>Profile (email):</Text>
                    <Text style={styles.debugValue}>
                      {debugInfo.profile?.emailAddresses?.[0]?.value || 'None'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.debugSubSection}>
                  <Text style={styles.debugSectionTitle}>Previous Auth</Text>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>SessionID:</Text>
                    <Text style={styles.debugValue}>{debugInfo.previousSessionId || 'None'}</Text>
                  </View>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>AccessToken (last 10):</Text>
                    <Text style={styles.debugValue}>
                      {debugInfo.previousAccessToken ? '...' + debugInfo.previousAccessToken.substring(debugInfo.previousAccessToken.length - 10) : 'None'}
                    </Text>
                  </View>
                  
                  <View style={styles.debugRow}>
                    <Text style={styles.debugLabel}>Profile (email):</Text>
                    <Text style={styles.debugValue}>
                      {debugInfo.previousProfile?.emailAddresses?.[0]?.value || 'None'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : (
          // AUTHENTICATED PAGE
          <View style={styles.authenticatedContainer}>
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <Text style={styles.profileTitle}>Welcome!</Text>
              <Text style={styles.profileText}>
                <Text style={styles.bold}>Name:</Text> {profile?.names?.[0]?.displayName || 'N/A'}
              </Text>
              <Text style={styles.profileText}>
                <Text style={styles.bold}>Email:</Text> {profile?.emailAddresses?.[0]?.value || 'N/A'}
              </Text>
              <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            {/* Calendar Date Input */}
            <View style={styles.dateInputSection}>
              <Text style={styles.dateInputLabel}>Select Calendar Date:</Text>
              <View style={styles.dateInputContainer}>
                <TextInput
                  style={styles.dateInput}
                  value={selectedDate}
                  onChangeText={setSelectedDate}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numeric"
                />
                <Text style={styles.timezoneText}>
                  Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </Text>
              </View>
            </View>

            {/* API Buttons */}
            <View style={styles.apiSection}>
              <TouchableOpacity 
                style={[styles.apiButton, { backgroundColor: "#28a745" }]} 
                onPress={fetchDriveFiles}
                disabled={loading}
              >
                <Text style={styles.apiButtonText}>
                  {loading ? "Loading..." : "📁 Fetch Drive Files"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.apiButton, { backgroundColor: "#ffc107" }]} 
                onPress={fetchCalendarEvents}
                disabled={loading}
              >
                <Text style={styles.apiButtonText}>
                  {loading ? "Loading..." : "📅 Fetch Calendar Events"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.apiButton, { backgroundColor: "#17a2b8" }]} 
                onPress={startGooglePicker}
                disabled={photoPickerLoading}
              >
                <Text style={styles.apiButtonText}>
                  {photoPickerLoading ? "Loading..." : "📸 Start Photo Picker"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.apiButton, { backgroundColor: "#6f42c1" }]} 
                onPress={fetchPhotos}
                disabled={photoPickerLoading}
              >
                <Text style={styles.apiButtonText}>
                  {photoPickerLoading ? "Loading..." : "🔄 Refresh Photos"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Data Display */}
            {driveFiles && (
              <View style={styles.dataSection}>
                <Text style={styles.sectionTitle}>Drive Files ({driveFiles.files?.length || 0})</Text>
                {driveFiles.files?.slice(0, 5).map((file, index) => (
                  <Text key={index} style={styles.dataText}>
                    {getFileIcon(file.mimeType)} {file.name} ({formatFileSize(file.size)})
                  </Text>
                ))}
              </View>
            )}

            {calendarEvents && (
              <View style={styles.dataSection}>
                <Text style={styles.sectionTitle}>Calendar Events ({calendarEvents.items?.length || 0})</Text>
                {calendarEvents.items?.slice(0, 5).map((event, index) => (
                  <Text key={index} style={styles.dataText}>
                    📅 {event.summary} - {formatTime(event.start?.dateTime)}
                  </Text>
                ))}
              </View>
            )}

            {googlePhotos && googlePhotos.length > 0 && (
              <View style={styles.dataSection}>
                <Text style={styles.sectionTitle}>Google Photos ({googlePhotos.length})</Text>
                <View style={styles.photosGrid}>
                  {googlePhotos.slice(0, 6).map((photo, index) => (
                    <Image
                      key={index}
                      source={{ uri: photo.thumbnails[0]?.url }}
                      style={styles.photoThumbnail}
                      onError={() => console.log('Image load error:', photo.name)}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authenticatedContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  loginButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 5,
    minWidth: 200,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  profileSection: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  profileText: {
    fontSize: 16,
    marginBottom: 5,
  },
  bold: {
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 15,
    alignSelf: 'flex-start',
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  apiSection: {
    marginBottom: 20,
  },
  apiButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 5,
  },
  apiButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dataSection: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  dataText: {
    fontSize: 14,
    marginBottom: 5,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginBottom: 10,
  },
  debugSection: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#dee2e6',
    width: '100%',
  },
  debugTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#495057',
  },
  debugContainer: {
    gap: 15,
  },
  debugSubSection: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    width: '100%',
  },
  debugSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 12,
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  debugLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6c757d',
    flex: 1,
    marginRight: 10,
  },
  debugValue: {
    fontSize: 13,
    color: '#212529',
    flex: 2,
    textAlign: 'right',
    fontFamily: 'monospace',
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  dateInputSection: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  dateInputLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 8,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: 'white',
    marginRight: 10,
  },
  timezoneText: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
  },
});
