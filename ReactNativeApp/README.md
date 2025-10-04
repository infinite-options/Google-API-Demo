# Google API Demo - Multi-Platform

A comprehensive Google API integration demo supporting both **React Web** and **React Native Mobile** applications with secure backend authentication.

## 🚀 Quick Commands

```bash
# Backend (Required for both)
cd backend-mobile && npm install && npm run dev

# React Web App
cd /Users/pmarathay/code/Google-API-Demo && npm install && npm start

# React Native Mobile
cd ReactNativeApp && npm install && npm start
```

**Web App**: http://localhost:3000  
**Mobile App**: Expo development server  
**Backend API**: http://localhost:3001

## Architecture

- **Web Frontend**: React app (port 3000) - Traditional web application
- **Mobile Frontend**: React Native app (iOS/Android/Web) - Cross-platform mobile
- **Backend**: Node.js/Express API server (port 3001) - Secure OAuth handling
- **Security**: Client secret stored safely on backend
- **Photo Picker**: WebView integration for Google Photo Picker

## Features

- ✅ **Secure OAuth**: Client secret protected on backend
- ✅ **Google Drive**: View and browse files
- ✅ **Google Calendar**: View calendar events
- ✅ **Google Photos**: Photo Picker via WebView
- ✅ **Multi-Platform**: React Web + React Native (iOS/Android/Web)
- ✅ **PKCE Security**: Additional security layer

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- For mobile: Expo CLI (`npm install -g expo-cli`)
- For Android: Android Studio and Android SDK
- For iOS: Xcode (macOS only)

### 1. Backend Setup (Required for both Web & Mobile)

```bash
# Navigate to backend directory
cd backend-mobile

# Install dependencies
npm install

# Create environment file with your Google OAuth credentials
# Copy your credentials from Google Cloud Console
cat > .env << EOF
REACT_APP_GOOGLE_CLIENT_ID_WEB=your_web_client_id_here
REACT_APP_GOOGLE_CLIENT_SECRET_WEB=your_web_client_secret_here
REDIRECT_URI=http://localhost:3000
PORT=3001
FRONTEND_URL=http://localhost:3000
EOF

# Start backend server
npm run dev
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable APIs:
   - Google Drive API
   - Google Calendar API
   - Google Photos Library API
   - Google Photo Picker API
   - People API
4. Create OAuth 2.0 credentials:
   - **Application type**: Web application
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3000`
   - Copy Client ID and Secret to your `.env` file

## Running the Applications

### Option A: React Web Application

```bash
# Terminal 1: Start Backend (if not already running)
cd backend-mobile
npm run dev

# Terminal 2: Start React Web App
cd /Users/pmarathay/code/Google-API-Demo
npm install
npm start

# Open browser to http://localhost:3000
```

### Option B: React Native Mobile Application

```bash
# Terminal 1: Start Backend (if not already running)
cd backend-mobile
npm run dev

# Terminal 2: Start React Native App
cd ReactNativeApp
npm install

# Run on specific platforms
npm run web     # Web browser (Expo)
npm run android # Android emulator
npm run ios     # iOS simulator (macOS only)
```

### Option C: Both Web and Mobile (Development)

```bash
# Terminal 1: Backend
cd backend-mobile
npm run dev

# Terminal 2: React Web App
cd /Users/pmarathay/code/Google-API-Demo
npm start

# Terminal 3: React Native App
cd ReactNativeApp
npm start
```

## Application Features

### React Web App (http://localhost:3000)
- **Traditional web interface** with Google OAuth
- **Google Drive** file browsing
- **Google Calendar** event viewing
- **Google Photos** picker integration
- **Responsive design** for desktop and mobile browsers

### React Native Mobile App
- **Native mobile experience** for iOS and Android
- **Cross-platform** code sharing
- **WebView integration** for Google services
- **Expo development** for easy testing

## Troubleshooting

### Common Issues

**Backend not starting:**
```bash
# Check if port 3001 is in use
lsof -ti:3001 | xargs kill -9

# Restart backend
cd backend-mobile
npm run dev
```

**OAuth not working:**
- Verify Google Cloud Console settings
- Check redirect URIs match exactly
- Ensure all required APIs are enabled

**Mobile app not connecting:**
- Verify backend is running on port 3001
- Check network connectivity
- For Android emulator: `adb reverse tcp:3001 tcp:3001`

**Photo Picker issues:**
- Ensure Photo Picker API is enabled in Google Console
- Check OAuth scopes include Photo Picker access
- Verify access tokens are valid

## Development Tips

- **Web development**: Use React web app for quick testing
- **Mobile development**: Use Expo Go app for device testing
- **API testing**: Use backend endpoints directly for debugging
- **OAuth testing**: Test with web app first, then mobile

## Mobile-Specific Features

### Photo Picker Integration

- Uses WebView to display Google Photo Picker
- Secure backend handles OAuth and API calls
- Native-like experience with custom header

### Cross-Platform Support

- **iOS**: Native iOS app with WebView
- **Android**: Native Android app with WebView
- **Web**: Works in browsers via Expo web

### Security

- Client secret never exposed to mobile app
- All API calls go through secure backend
- PKCE provides additional security layer

## API Endpoints

The backend provides these mobile-optimized endpoints:

- `GET /api/health` - Health check
- `GET /api/oauth/url` - Get OAuth URL
- `POST /api/oauth/token` - Exchange code for token
- `GET /api/user/profile` - Get user profile
- `GET /api/drive/files` - Get Drive files
- `GET /api/calendar/events` - Get Calendar events
- `GET /api/drive/photos` - Get Drive photos
- `POST /api/photos/picker/session` - Create Photo Picker session
- `GET /api/photos/picker/media` - Get selected photos
- `GET /api/photos/picker/url` - Get Photo Picker URL for WebView
- `POST /api/oauth/refresh` - Refresh access token

## Production Deployment

### Backend

1. Deploy to secure server (Heroku, AWS, etc.)
2. Update CORS origins for production domains
3. Use production database for session storage
4. Enable HTTPS

### React Native App

1. Build for production:
   ```bash
   expo build:ios
   expo build:android
   ```
2. Update API_BASE_URL in App.js
3. Submit to app stores

## Troubleshooting

### Backend Issues

- Check that .env file exists and has correct values
- Ensure port 3001 is not in use
- Check Google Cloud Console API enablement
- Verify CORS settings for your platform

### React Native Issues

- Ensure backend is running on port 3001
- Check network connectivity
- Clear Expo cache: `expo start -c`
- Check device/simulator network settings

### Photo Picker Issues

- Ensure Photo Picker API is enabled in Google Console
- Check that WebView can load the picker URL
- Verify OAuth scopes include Photo Picker access

## Security Notes

- Client secret is never exposed to the mobile app
- All sensitive operations happen on the backend
- Mobile app only stores access tokens (which expire)
- Backend implements rate limiting and security headers
- All communication should use HTTPS in production

## Development Tips

- Use Expo Go app for quick testing
- Test on both iOS and Android devices
- Use network debugging tools to monitor API calls
- Test Photo Picker on different screen sizes
- Verify OAuth flow works on all platforms
