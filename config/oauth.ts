import Constants from "expo-constants";
import { Platform } from "react-native";

// OAuth configuration for different platforms
export const oauthConfig = {
  // Web client ID (for web platform)
  webClientId: Constants.expoConfig?.extra?.webClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,

  // Android client ID
  androidClientId: Constants.expoConfig?.extra?.androidClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,

  // iOS client ID (same as Android for this demo)
  iosClientId: Constants.expoConfig?.extra?.iosClientId || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,

  // Client secret (only needed for web)
  clientSecret: Constants.expoConfig?.extra?.clientSecret || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET_WEB,

  // Redirect URIs for different platforms
  redirectUri: Platform.select({
    web: "http://localhost:8081",
    ios: "com.googleusercontent.apps.255360526528-j5g199i7073sojr0e5obteprc4icote4:/oauth2redirect",
    android: "com.infiniteoptions.apidemo:/oauth2redirect",
  }) as string,

  // Scopes for Google APIs
  scopes: [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/photoslibrary.readonly",
    "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
  ],

  // Google API endpoints
  endpoints: {
    token: "https://oauth2.googleapis.com/token",
    userInfo: "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses",
    drive: "https://www.googleapis.com/drive/v3/files",
    calendar: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    photoPicker: "https://photospicker.googleapis.com/v1",
  },
};

// Get the appropriate client ID for the current platform
export const getClientId = () => {
  switch (Platform.OS) {
    case "web":
      return oauthConfig.webClientId;
    case "ios":
      return oauthConfig.iosClientId;
    case "android":
      return oauthConfig.androidClientId;
    default:
      return oauthConfig.webClientId;
  }
};

// Get the appropriate redirect URI for the current platform
export const getRedirectUri = () => {
  return oauthConfig.redirectUri;
};
