# Google APIs Demo - React Native

A React Native application that demonstrates how to use various Google APIs including OAuth authentication, Google Drive, Google Calendar, and Google Photos (Photo Picker API).

## Features

- **Google OAuth Authentication**: Sign in with Google across iOS, Android, and web platforms
- **Google Drive Integration**: View and browse recent files from Google Drive
- **Google Calendar Integration**: View calendar events for specific dates
- **Google Photos Integration**:
  - Load images from Google Drive
  - Use Google Photo Picker API (web only) to select specific photos
- **Cross-Platform Support**: Works on iOS, Android, and web

## Prerequisites

Before running this application, you need to set up Google OAuth credentials:

### 1. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Drive API
   - Google Calendar API
   - Google Photos Library API
   - Google Photo Picker API
   - People API

### 2. OAuth 2.0 Client Configuration

You need to create OAuth 2.0 clients for different platforms:

#### Web Client

- **Client Type**: Web application
- **Authorized JavaScript origins**:
  - `http://localhost:8081` (for Expo web)
  - `http://localhost:3000` (for development)
- **Authorized redirect URIs**:
  - `http://localhost:8081`
  - `http://localhost:3000`
  - `http://localhost:3000/oauth2callback`

#### Android Client

- **Client Type**: Android
- **Package name**: `com.infiniteoptions.apidemo`
- **SHA-1 certificate fingerprint**: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

#### iOS Client

- **Client Type**: iOS
- **Bundle ID**: `com.infiniteoptions.apidemo`

### 3. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=your_web_client_id_here
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=your_android_client_id_here
EXPO_PUBLIC_GOOGLE_CLIENT_SECRET_WEB=your_web_client_secret_here

# Legacy React App variables (for compatibility)
REACT_APP_GOOGLE_CLIENT_ID_WEB=your_web_client_id_here
REACT_APP_GOOGLE_CLIENT_SECRET_WEB=your_web_client_secret_here
```

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd Google-API-Demo
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment variables in the `.env` file

4. For iOS development, you may need to install CocoaPods:

```bash
cd ios && pod install && cd ..
```

## Running the Application

### Web

```bash
npm run web
```

### iOS

```bash
npm run ios
```

### Android

```bash
npm run android
```

## Project Structure

```
├── app/
│   ├── (tabs)/
│   │   └── index.tsx          # Main app screen with Google APIs integration
│   └── _layout.tsx            # Root layout
├── config/
│   └── oauth.ts               # OAuth configuration for different platforms
├── services/
│   └── googleApiService.ts    # Google APIs service layer
├── components/                # Reusable UI components
└── assets/                    # Images and other assets
```

## Key Components

### GoogleApiService

The main service class that handles:

- OAuth authentication flow
- Google Drive API calls
- Google Calendar API calls
- Google Photos API calls
- Photo Picker integration

### OAuth Configuration

Platform-specific OAuth configuration including:

- Client IDs for web, iOS, and Android
- Redirect URIs
- Scopes for different Google APIs

## Google Photo Picker API

The Google Photo Picker API is currently only available on web platforms. It allows users to:

1. Open a Google Photos selection interface
2. Select specific photos from their Google Photos library
3. Retrieve the selected photos with thumbnails

### Usage Flow:

1. User clicks "Open Google Photo Picker"
2. A new window opens with the Google Photos picker interface
3. User selects photos and clicks "Done"
4. The selected photos are automatically loaded into the app

## Troubleshooting

### Common Issues

1. **OAuth Authentication Fails**

   - Verify your client IDs and secrets are correct
   - Check that redirect URIs match exactly
   - Ensure the required APIs are enabled in Google Cloud Console

2. **Photo Picker Not Working**

   - Photo Picker is only available on web platform
   - Ensure you have the correct scopes enabled
   - Check that the Photo Picker API is enabled in Google Cloud Console

3. **API Calls Failing**
   - Verify the access token is valid
   - Check that the required scopes are granted
   - Ensure the APIs are enabled in Google Cloud Console

### Debug Mode

The app includes extensive logging. Check the console for detailed error messages and API responses.

## API Scopes

The application requests the following scopes:

- `https://www.googleapis.com/auth/userinfo.profile` - User profile information
- `https://www.googleapis.com/auth/userinfo.email` - User email address
- `https://www.googleapis.com/auth/drive.readonly` - Read-only access to Google Drive
- `https://www.googleapis.com/auth/calendar.readonly` - Read-only access to Google Calendar
- `https://www.googleapis.com/auth/photoslibrary.readonly` - Read-only access to Google Photos
- `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` - Photo Picker access

## Security Notes

- Never commit your client secrets to version control
- Use environment variables for sensitive configuration
- The client secret is only needed for web platform OAuth flow
- Mobile platforms use PKCE (Proof Key for Code Exchange) for security

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test on all platforms
5. Submit a pull request

## License

This project is licensed under the MIT License.
