# Migration Guide: From Separate Backends to Consolidated Backend

This guide will help you migrate from the separate `backend/` and `backend-mobile/` directories to the new consolidated backend.

## 🎯 Overview

The consolidated backend combines the best features from both existing backends:
- **Security features** from `backend-mobile/` (helmet, rate limiting)
- **API endpoints** from both backends
- **Cleaner code** with removed duplicates
- **Better error handling** and logging

## 📋 Pre-Migration Checklist

- [ ] Backup your existing backend code
- [ ] Note down your current environment variables
- [ ] Test your current frontend applications
- [ ] Have your Google OAuth credentials ready

## 🚀 Step-by-Step Migration

### Step 1: Copy Consolidated Backend

```bash
# Copy the consolidated backend to your new project
cp -r consolidated-backend/ /path/to/your/new/project/backend/

# Navigate to the new backend
cd /path/to/your/new/project/backend/
```

### Step 2: Install Dependencies

```bash
# Install all required dependencies
npm install

# Verify installation
npm list
```

### Step 3: Environment Configuration

Create a `.env` file with your existing credentials:

```env
# Google OAuth Configuration (use your existing values)
GOOGLE_CLIENT_ID=your_existing_google_client_id
GOOGLE_CLIENT_SECRET=your_existing_google_client_secret
REDIRECT_URI=http://localhost:3001/oauth2/callback

# Server Configuration
PORT=3001
NODE_ENV=development

# Frontend Configuration
FRONTEND_URL=http://localhost:3000
```

### Step 4: Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services > Credentials
3. Update your OAuth 2.0 client redirect URIs:
   - Add: `http://localhost:3001/oauth2/callback`
   - Remove old redirect URIs if no longer needed

### Step 5: Test the Backend

```bash
# Start the consolidated backend
npm run dev

# Test health endpoint
curl http://localhost:3001/health

# Test OAuth URL generation
curl http://localhost:3001/api/oauth/url
```

### Step 6: Update Frontend Applications

#### For React Web App:
- No changes needed - endpoints are the same
- Update API base URL if different port

#### For React Native App:
- No changes needed - endpoints are the same
- Update API base URL if different port

### Step 7: Verify OAuth Flow

1. **Web App:**
   - Start React app: `npm start`
   - Test OAuth login
   - Verify redirect works

2. **Mobile App:**
   - Start React Native app: `npx expo start --android`
   - Test OAuth login
   - Verify deep linking works

## 🔄 API Endpoint Mapping

| Original Backend | Consolidated Backend | Status |
|------------------|---------------------|---------|
| `GET /api/oauth/url` | `GET /api/oauth/url` | ✅ Same |
| `POST /api/oauth/token` | `POST /api/oauth/token` | ✅ Same |
| `GET /api/user/profile` | `GET /api/user/profile` | ✅ Same |
| `GET /api/drive/files` | `GET /api/drive/files` | ✅ Same |
| `GET /api/calendar/events` | `GET /api/calendar/events` | ✅ Same |
| `GET /api/photos/library` | `GET /api/photos/library` | ✅ Same |
| `GET /api/photos/picker/url` | `GET /api/photos/picker/url` | ✅ Same |
| `POST /api/picker/selection` | `POST /api/picker/selection` | ✅ Same |
| `GET /api/picker/result` | `GET /api/picker/result` | ✅ Same |
| `POST /api/oauth/refresh` | `POST /api/oauth/refresh` | ✅ Same |
| `GET /oauth2/callback` | `GET /oauth2/callback` | ✅ Same |
| `GET /health` | `GET /health` | ✅ Same |

## 🆕 New Features

The consolidated backend includes these new features:

1. **Enhanced Security:**
   - Rate limiting (100 requests per 15 minutes)
   - Helmet security headers
   - Improved CORS configuration

2. **Better Logging:**
   - Detailed OAuth flow logging
   - Request/response logging
   - Error tracking

3. **Test Endpoint:**
   - `GET /test` - For debugging and testing

4. **Improved Error Handling:**
   - Better error messages
   - Consistent error responses
   - Detailed error logging

## 🐛 Troubleshooting

### Common Issues:

1. **Port Already in Use:**
   ```bash
   # Kill process using port 3001
   lsof -ti:3001 | xargs kill -9
   ```

2. **CORS Errors:**
   - Check that your frontend URL is in the CORS origins list
   - Update CORS configuration if needed

3. **OAuth Redirect Issues:**
   - Verify redirect URI in Google Cloud Console
   - Check that redirect URI matches exactly

4. **Token Exchange Failures:**
   - Check Google OAuth credentials
   - Verify client ID and secret are correct
   - Check redirect URI configuration

### Debug Commands:

```bash
# Check if backend is running
curl http://localhost:3001/health

# Test OAuth URL generation
curl http://localhost:3001/api/oauth/url

# Check environment variables
node -e "require('dotenv').config(); console.log(process.env.GOOGLE_CLIENT_ID)"
```

## 📊 Performance Improvements

The consolidated backend offers these performance improvements:

1. **Reduced Memory Usage:**
   - Single server process instead of two
   - Optimized session storage

2. **Better Error Handling:**
   - Faster error responses
   - Reduced error logging overhead

3. **Security Enhancements:**
   - Rate limiting prevents abuse
   - Security headers improve performance

## 🔒 Security Considerations

1. **Environment Variables:**
   - Never commit `.env` files
   - Use different credentials for development/production
   - Rotate credentials regularly

2. **Production Deployment:**
   - Use HTTPS for all endpoints
   - Implement proper logging and monitoring
   - Use a reverse proxy (nginx)
   - Set up proper CORS for production domains

3. **Database Integration:**
   - Replace in-memory storage with Redis/PostgreSQL
   - Implement proper session management
   - Add database connection pooling

## ✅ Post-Migration Checklist

- [ ] Backend starts without errors
- [ ] Health endpoint responds correctly
- [ ] OAuth URL generation works
- [ ] Web app OAuth flow works
- [ ] Mobile app OAuth flow works
- [ ] All API endpoints respond correctly
- [ ] Error handling works as expected
- [ ] Logging is working properly
- [ ] Security features are active
- [ ] Performance is acceptable

## 📞 Support

If you encounter issues during migration:

1. Check the logs for error messages
2. Verify environment variables
3. Test individual endpoints
4. Check Google Cloud Console configuration
5. Review this migration guide

## 🎉 Success!

Once migration is complete, you'll have:
- A single, maintainable backend
- Better security and performance
- Cleaner code structure
- Comprehensive documentation
- Support for both web and mobile apps
