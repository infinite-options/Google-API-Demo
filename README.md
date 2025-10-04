# Google API Demo - React Web Application

A React web application that demonstrates secure Google API integration with Photo Picker support, Drive file browsing, and Calendar event viewing.

## 🚀 Quick Start

```bash
# 1. Backend (Required)
cd backend
npm install
npm run dev

# 2. React Web App
npm install
npm start

# Open http://localhost:3000
```

## 📋 Complete Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Console account

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file with your Google OAuth credentials
cat > .env << EOF
GOOGLE_CLIENT_ID=your_web_client_id_here
GOOGLE_CLIENT_SECRET=your_web_client_secret_here
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

### 3. React Web App Setup

```bash
# Install dependencies
npm install

# Start development server
npm start

# Open http://localhost:3000 in your browser
```

## 🎯 Features

- ✅ **Google OAuth Authentication** - Secure login with Google
- ✅ **Google Drive Integration** - Browse and view your Drive files
- ✅ **Google Calendar** - View calendar events and schedule
- ✅ **Google Photos Picker** - Select photos from your Google Photos
- ✅ **Responsive Design** - Works on desktop and mobile browsers
- ✅ **Secure Backend** - Client secret protected on server

## 🏗️ Architecture

- **Frontend**: React app (port 3000) - User interface
- **Backend**: Node.js/Express API (port 3001) - OAuth handling
- **Security**: Client secret stored safely on backend
- **APIs**: Google Drive, Calendar, Photos, and People APIs

## 🔧 Development

### Available Scripts

```bash
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
npm run eject      # Eject from Create React App
```

### Backend API Endpoints

- `GET /api/health` - Health check
- `GET /api/oauth/url` - Get OAuth URL
- `POST /api/oauth/token` - Exchange code for token
- `GET /api/user/profile` - Get user profile
- `GET /api/drive/files` - Get Drive files
- `GET /api/calendar/events` - Get Calendar events
- `GET /api/photos/picker/url` - Get Photo Picker URL

## 🐛 Troubleshooting

### Common Issues

**Backend not starting:**
```bash
# Check if port 3001 is in use
lsof -ti:3001 | xargs kill -9
cd backend
npm run dev
```

**OAuth not working:**
- Verify Google Cloud Console settings
- Check redirect URIs match exactly: `http://localhost:3000`
- Ensure all required APIs are enabled
- Verify client ID and secret in `.env` file

**CORS errors:**
- Ensure backend is running on port 3001
- Check CORS configuration in backend
- Verify frontend is running on port 3000

**Photo Picker issues:**
- Ensure Photo Picker API is enabled in Google Console
- Check OAuth scopes include Photo Picker access
- Verify access tokens are valid

## 📱 Mobile Version

This project also includes a React Native mobile version. See `ReactNativeApp/README.md` for mobile-specific instructions.

## 🚀 Production Deployment

### Backend
1. Deploy to secure server (Heroku, AWS, etc.)
2. Update CORS origins for production domains
3. Use production database for session storage
4. Enable HTTPS

### Frontend
1. Build for production: `npm run build`
2. Deploy to CDN (Netlify, Vercel, etc.)
3. Update API URLs for production backend
4. Configure production OAuth redirect URIs

## 📄 License

MIT License - see LICENSE file for details
