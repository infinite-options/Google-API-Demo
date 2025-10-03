# Secure Google API Demo Setup

This guide shows how to run the Google API Demo with a secure backend that keeps the client secret safe.

## Architecture

- **Frontend**: React app (port 3000) - no client secret exposed
- **Backend**: Node.js/Express server (port 3001) - client secret stored securely
- **Security**: All Google API calls go through the backend proxy

## Setup Instructions

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

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

### 2. Frontend Setup

```bash
# In the main directory (where package.json is)
# Install dependencies (if not already done)
npm install

# Create .env file for frontend
echo "REACT_APP_API_URL=http://localhost:3001" > .env

# Start frontend
npm start
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
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3000`
   - **Client ID**: Copy this to backend .env file
   - **Client Secret**: Copy this to backend .env file

## Running the Application

### Terminal 1 (Backend)

```bash
cd backend
npm run dev
```

### Terminal 2 (Frontend)

```bash
npm start
```

### Terminal 3 (Optional - Use Secure Frontend)

```bash
# Replace App.js with AppSecure.js
cp src/AppSecure.js src/App.js
npm start
```

## Security Benefits

✅ **Client Secret Protected**: Stored only on backend server
✅ **PKCE Security**: Still uses PKCE for additional security
✅ **API Proxy**: All Google API calls go through secure backend
✅ **No Exposed Credentials**: Frontend has no access to client secret
✅ **Production Ready**: Safe for deployment

## API Endpoints

The backend provides these secure endpoints:

- `GET /api/oauth/url` - Get OAuth URL
- `POST /api/oauth/token` - Exchange code for token
- `GET /api/user/profile` - Get user profile
- `GET /api/drive/files` - Get Drive files
- `GET /api/calendar/events` - Get Calendar events
- `GET /api/drive/photos` - Get Drive photos
- `POST /api/photos/picker/session` - Create Photo Picker session
- `GET /api/photos/picker/media` - Get selected photos

## Troubleshooting

### Backend Issues

- Check that .env file exists and has correct values
- Ensure port 3001 is not in use
- Check Google Cloud Console API enablement

### Frontend Issues

- Ensure backend is running on port 3001
- Check REACT_APP_API_URL in .env file
- Clear browser cache/localStorage

### OAuth Issues

- Verify redirect URI matches exactly in Google Console
- Check that all required APIs are enabled
- Ensure client ID and secret are correct

## Production Deployment

For production deployment:

1. **Backend**: Deploy to secure server (Heroku, AWS, etc.)
2. **Frontend**: Deploy to CDN (Netlify, Vercel, etc.)
3. **Environment**: Update URLs in both .env files
4. **Google Console**: Update redirect URIs for production domain
5. **HTTPS**: Ensure all communication is over HTTPS

## Security Notes

- Client secret is never exposed to the frontend
- All sensitive operations happen on the backend
- Frontend only stores access tokens (which expire)
- Backend can implement additional security measures (rate limiting, token validation, etc.)
