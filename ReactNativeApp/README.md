# Google API Demo - React Native

A React Native application that demonstrates secure Google API integration with Photo Picker support for iOS and Android.

## Architecture

- **Frontend**: React Native app (iOS/Android/Web)
- **Backend**: Node.js/Express API server
- **Security**: Client secret stored safely on backend
- **Photo Picker**: WebView integration for Google Photo Picker

## Features

- ✅ **Secure OAuth**: Client secret protected on backend
- ✅ **Google Drive**: View and browse files
- ✅ **Google Calendar**: View calendar events
- ✅ **Google Photos**: Photo Picker via WebView
- ✅ **Cross-Platform**: iOS, Android, and Web support
- ✅ **PKCE Security**: Additional security layer

## Setup Instructions

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend-mobile

# Install dependencies
npm install

# Create environment file
cp env.example .env

# Edit .env file with your Google OAuth credentials
# GOOGLE_CLIENT_ID=your_client_id_here
# GOOGLE_CLIENT_SECRET=your_client_secret_here
# REDIRECT_URI=http://localhost:3000
# PORT=3001
# FRONTEND_URL=http://localhost:3000

# Start backend server
npm run dev
```

### 2. React Native Setup

```bash
# Navigate to React Native app directory
cd ReactNativeApp

# Install dependencies
npm install

# Start Expo development server
npm start

# Run on specific platforms
npm run ios     # iOS simulator
npm run android # Android emulator
npm run web     # Web browser
```

### 3. Google Cloud Console Setup

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
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for web)
     - `exp://localhost:19000` (for Expo)
   - **Authorized redirect URIs**:
     - `http://localhost:3000`
     - `exp://localhost:19000`
   - **Client ID**: Copy to backend .env file
   - **Client Secret**: Copy to backend .env file

## Running the Application

### Terminal 1 (Backend)

```bash
cd backend-mobile
npm run dev
```

### Terminal 2 (React Native)

```bash
cd ReactNativeApp
npm start
```

Then choose your platform:

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web browser

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
