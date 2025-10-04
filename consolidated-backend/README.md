# Google API Demo - Consolidated Backend

A unified, production-ready backend server that supports both web (React) and mobile (React Native) applications for Google API integration.

## 🚀 Features

- **OAuth 2.0 Authentication** - Secure Google OAuth flow with PKCE
- **Multi-Platform Support** - Works with both web and mobile apps
- **Google APIs Integration**:
  - Google Drive (file listing)
  - Google Calendar (events)
  - Google Photos (library access)
  - Google Photo Picker (web-only)
- **Security Features**:
  - Rate limiting (100 requests per 15 minutes)
  - Helmet security headers
  - CORS configuration
  - PKCE for OAuth security
- **Deep Linking Support** - For mobile app callbacks
- **Comprehensive Logging** - Detailed request/response logging

## 📋 Prerequisites

- Node.js 16+ 
- npm or yarn
- Google Cloud Console project with OAuth credentials

## 🛠️ Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**
   ```env
   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   REDIRECT_URI=http://localhost:3001/oauth2/callback
   
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   
   # Frontend Configuration
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start the server:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🔗 API Endpoints

### Authentication
- `GET /api/oauth/url` - Get OAuth authorization URL
- `GET /oauth2/callback` - OAuth callback (Google redirects here)
- `POST /api/oauth/token` - Exchange code for tokens
- `POST /api/oauth/refresh` - Refresh access token

### User Data
- `GET /api/user/profile` - Get user profile
- `GET /api/drive/files` - Get Google Drive files
- `GET /api/calendar/events` - Get calendar events
- `GET /api/photos/library` - Get Google Photos

### Photo Picker
- `GET /api/photos/picker/url` - Get Photo Picker URL
- `POST /api/picker/selection` - Store selected photos
- `GET /api/picker/result` - Get selected photos

### Utility
- `GET /health` - Health check
- `GET /test` - Test endpoint for debugging

## 🌐 CORS Configuration

The server is configured to accept requests from:
- `http://localhost:3000` (React web app)
- `http://localhost:8081` (Expo web)
- `http://10.0.2.2:8081` (Android emulator)
- Expo development URLs

## 📱 Mobile App Integration

For React Native apps, the backend supports:
- Deep linking callbacks (`capshnz://photos/done?session=xyz`)
- Token exchange via `/api/oauth/token`
- Photo picker result retrieval
- Comprehensive error handling and logging

## 🔒 Security

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Helmet Security Headers**: XSS protection, content type sniffing prevention
- **CORS Protection**: Configured for specific origins
- **PKCE**: OAuth security enhancement
- **Input Validation**: Request parameter validation

## 🚀 Production Deployment

1. **Environment Setup:**
   ```bash
   NODE_ENV=production
   PORT=3001
   REDIRECT_URI=https://yourdomain.com/oauth2/callback
   FRONTEND_URL=https://yourdomain.com
   ```

2. **Database Integration:**
   - Replace in-memory storage with Redis/PostgreSQL
   - Implement proper session management
   - Add database connection pooling

3. **Security Enhancements:**
   - Use HTTPS for all endpoints
   - Implement proper logging and monitoring
   - Add request validation middleware
   - Set up proper CORS for production domains

4. **Scaling:**
   - Use PM2 or similar process manager
   - Implement load balancing
   - Add health check endpoints
   - Set up monitoring and alerting

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes | - |
| `REDIRECT_URI` | OAuth callback URL | Yes | - |
| `PORT` | Server port | No | 3001 |
| `FRONTEND_URL` | Frontend URL for web redirects | No | http://localhost:3000 |
| `NODE_ENV` | Environment (development/production) | No | development |

## 🔄 Migration from Existing Backends

### From `backend/` and `backend-mobile/`:

1. **Copy Files:**
   ```bash
   # Copy consolidated backend to your new project
   cp -r consolidated-backend/ /path/to/your/new/project/backend/
   ```

2. **Update Dependencies:**
   ```bash
   cd /path/to/your/new/project/backend/
   npm install
   ```

3. **Environment Variables:**
   - Use the same Google OAuth credentials
   - Update `REDIRECT_URI` to point to your new backend
   - Set `FRONTEND_URL` to your frontend URL

4. **Frontend Updates:**
   - Update API base URLs if needed
   - The endpoints are the same, so minimal changes required
   - Test OAuth flow with new backend

### Key Differences from Original Backends:

- **Combined Features**: Security + all API endpoints in one file
- **Better Error Handling**: Comprehensive error logging and responses
- **Improved CORS**: Supports both web and mobile origins
- **Enhanced Security**: Rate limiting and security headers
- **Cleaner Code**: Removed duplicates and experimental code

## 🧪 Testing

1. **Health Check:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Test Endpoint:**
   ```bash
   curl http://localhost:3001/test
   ```

3. **OAuth Flow:**
   ```bash
   curl http://localhost:3001/api/oauth/url
   ```

## 📊 Monitoring

The backend includes comprehensive logging for:
- OAuth flow steps
- API requests and responses
- Error details
- Performance metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details