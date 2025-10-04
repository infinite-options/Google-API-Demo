#!/usr/bin/env python3
"""
Google API Demo - Consolidated Backend (Python Flask Version)
A unified backend server that supports both web (React) and mobile (React Native) applications for Google API integration.
"""

import os
import json
import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode, parse_qs
from typing import Dict, Any, Optional, Tuple

import requests
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)

# Configuration
PORT = int(os.getenv('PORT', 3001))
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
REDIRECT_URI = os.getenv('REDIRECT_URI', 'http://localhost:3001/oauth2/callback')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# Security configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', secrets.token_hex(32))

# Rate limiting
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["100 per 15 minutes"]
)

# CORS configuration for both web and mobile
CORS(app, origins=[
    "http://localhost:3000",  # React web app
    "http://localhost:8081",  # Expo web
    "http://127.0.0.1:8081",  # Expo web (alternative)
    "http://10.0.2.2:8081",   # Android emulator
    "exp://localhost:19000",  # Expo development
    "exp://192.168.1.100:19000",  # Expo on local network
    "exp://10.0.2.2:19000",   # Android emulator Expo
], supports_credentials=True)

# Store active sessions (in production, use Redis or database)
active_sessions: Dict[str, Dict[str, Any]] = {}
user_tokens: Dict[str, Dict[str, Any]] = {}

# Utility functions
def base64url_encode(data: bytes) -> str:
    """URL-safe base64 encoding for PKCE"""
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def generate_code_verifier() -> str:
    """Generate PKCE code verifier"""
    return base64url_encode(secrets.token_bytes(32))

def generate_code_challenge(verifier: str) -> str:
    """Generate PKCE code challenge"""
    digest = hashlib.sha256(verifier.encode('utf-8')).digest()
    return base64url_encode(digest)

def get_access_token_from_request() -> Tuple[Optional[str], Optional[str]]:
    """Extract access token from request (Bearer token or user_id)"""
    auth_header = request.headers.get('Authorization')
    user_id = request.args.get('user_id')
    
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1], None
    
    if user_id:
        user_token = user_tokens.get(user_id)
        if user_token and datetime.now().timestamp() < user_token.get('expires_at', 0):
            return user_token['access_token'], user_id
    
    return None, None

def make_google_api_request(url: str, access_token: str, method: str = 'GET', data: Optional[Dict] = None) -> Dict[str, Any]:
    """Make authenticated request to Google API"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    if method == 'GET':
        response = requests.get(url, headers=headers)
    elif method == 'POST':
        headers['Content-Type'] = 'application/json'
        response = requests.post(url, headers=headers, json=data or {})
    else:
        raise ValueError(f"Unsupported HTTP method: {method}")
    
    response.raise_for_status()
    return response.json()

# Routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'OK',
        'timestamp': datetime.now().isoformat(),
        'uptime': 'N/A',  # Python doesn't have built-in uptime tracking
        'message': 'Google API Demo Backend is running'
    })

@app.route('/api/oauth/url', methods=['GET'])
def get_oauth_url():
    """Generate OAuth URL with PKCE"""
    try:
        code_verifier = generate_code_verifier()
        code_challenge = generate_code_challenge(code_verifier)
        
        # Store code verifier for later use
        session_id = str(uuid.uuid4())
        active_sessions[session_id] = {
            'code_verifier': code_verifier,
            'timestamp': datetime.now().timestamp()
        }
        
        # Build OAuth URL
        params = {
            'response_type': 'code',
            'client_id': GOOGLE_CLIENT_ID,
            'redirect_uri': REDIRECT_URI,
            'scope': ' '.join([
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/calendar.readonly',
                'https://www.googleapis.com/auth/photoslibrary.readonly',
                'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'
            ]),
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
            'include_granted_scopes': 'true',
            'access_type': 'offline',
            'prompt': 'consent',
            'state': session_id
        }
        
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        
        logger.info(f"🔗 Generated OAuth URL for session: {session_id}")
        logger.info(f"🔗 Redirect URI: {REDIRECT_URI}")
        
        return jsonify({
            'authUrl': auth_url,
            'sessionId': session_id,
            'expiresIn': 600,  # 10 minutes
            'message': 'Use this URL for OAuth flow'
        })
        
    except Exception as error:
        logger.error(f"Error generating OAuth URL: {error}")
        return jsonify({'error': 'Failed to generate OAuth URL'}), 500

@app.route('/oauth2/callback', methods=['GET'])
def oauth_callback():
    """Handle OAuth callback from Google"""
    logger.info("🔄 OAuth Callback Received from Google")
    logger.info(f"📝 Query params: {request.args}")
    logger.info(f"📝 Full URL: {request.url}")
    
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    
    if error:
        logger.error(f"❌ OAuth error from Google: {error}")
        return jsonify({'error': 'OAuth authorization failed', 'details': error}), 400
    
    if not code:
        logger.error("❌ No code received from Google")
        return jsonify({'error': 'No authorization code received'}), 400
    
    try:
        # Get stored code verifier
        session = active_sessions.get(state)
        if not session:
            logger.error("❌ Invalid or expired state parameter")
            return jsonify({'error': 'Invalid or expired session'}), 400
        
        # Exchange code for tokens
        token_data = {
            'code': code,
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'redirect_uri': REDIRECT_URI,
            'grant_type': 'authorization_code',
            'code_verifier': session['code_verifier']
        }
        
        logger.info("🔄 Exchanging code for tokens...")
        logger.info(f"🔑 Code: {code}")
        logger.info(f"🔑 State: {state}")
        logger.info(f"🔗 Redirect URI: {REDIRECT_URI}")
        
        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        response.raise_for_status()
        
        tokens = response.json()
        logger.info("✅ Successfully exchanged code for tokens")
        logger.info(f"🔑 Tokens received: {json.dumps(tokens, indent=2)}")
        
        # Store tokens with state for later retrieval
        if state:
            active_sessions[state].update({
                'tokens': tokens,
                'timestamp': datetime.now().timestamp()
            })
            logger.info(f"💾 Tokens stored for state: {state}")
        
        # For web platform, redirect to frontend with tokens
        user_agent = request.headers.get('User-Agent', '')
        if 'Mozilla' in user_agent:
            frontend_url = f"{FRONTEND_URL}?access_token={tokens['access_token']}&refresh_token={tokens.get('refresh_token', '')}"
            logger.info(f"🌐 Redirecting to frontend: {frontend_url}")
            return redirect(frontend_url)
        
        # For mobile platform, redirect with deep link
        deep_link_url = f"capshnz://photos/done?session={state or 'unknown'}"
        logger.info(f"🔗 Redirecting to deep link: {deep_link_url}")
        return redirect(deep_link_url)
        
    except requests.RequestException as error:
        logger.error(f"❌ Error in OAuth callback: {error}")
        return jsonify({'error': 'OAuth callback failed', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"❌ Unexpected error in OAuth callback: {error}")
        return jsonify({'error': 'OAuth callback failed', 'details': str(error)}), 500

@app.route('/api/oauth/token', methods=['POST'])
def exchange_oauth_token():
    """Exchange OAuth code for tokens (for mobile apps)"""
    data = request.get_json()
    code = data.get('code')
    state = data.get('state')
    
    logger.info("🔄 OAuth Token Exchange Request Received")
    logger.info(f"📝 Request body: {json.dumps(data, indent=2)}")
    
    if not code:
        logger.info("❌ Missing code in request")
        return jsonify({'error': 'Missing code'}), 400
    
    logger.info("🔄 Exchanging OAuth code for tokens")
    logger.info(f"🔑 Code: {code}")
    logger.info(f"🔑 State: {state}")
    
    try:
        # Get stored code verifier
        session = active_sessions.get(state)
        if not session:
            logger.error("❌ Invalid or expired state parameter")
            return jsonify({'error': 'Invalid or expired session'}), 400
        
        token_data = {
            'code': code,
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'redirect_uri': REDIRECT_URI,
            'grant_type': 'authorization_code',
            'code_verifier': session['code_verifier']
        }
        
        logger.info("🌐 Making request to Google OAuth token endpoint")
        logger.info(f"🔗 URL: https://oauth2.googleapis.com/token")
        logger.info(f"📝 Params: {urlencode(token_data)}")
        
        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        response.raise_for_status()
        
        tokens = response.json()
        logger.info("✅ Successfully exchanged code for tokens")
        logger.info(f"🔑 Tokens received: {json.dumps(tokens, indent=2)}")
        
        # Store tokens with state for later retrieval
        if state:
            active_sessions[state].update({
                'tokens': tokens,
                'timestamp': datetime.now().timestamp()
            })
        
        return jsonify({'success': True, **tokens})
        
    except requests.RequestException as error:
        logger.error(f"❌ Error exchanging code: {error}")
        return jsonify({'error': 'Token exchange failed'}), 500
    except Exception as error:
        logger.error(f"❌ Unexpected error exchanging code: {error}")
        return jsonify({'error': 'Token exchange failed'}), 500

@app.route('/api/user/profile', methods=['GET'])
def get_user_profile():
    """Get user profile from Google"""
    try:
        access_token, user_id = get_access_token_from_request()
        if not access_token:
            return jsonify({'error': 'Missing authorization'}), 401
        
        response_data = make_google_api_request(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            access_token
        )
        
        return jsonify(response_data)
        
    except requests.RequestException as error:
        logger.error(f"Profile fetch error: {error}")
        return jsonify({'error': 'Failed to fetch profile', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error fetching profile: {error}")
        return jsonify({'error': 'Failed to fetch profile', 'details': str(error)}), 500

@app.route('/api/drive/files', methods=['GET'])
def get_drive_files():
    """Get Google Drive files"""
    try:
        access_token, user_id = get_access_token_from_request()
        if not access_token:
            return jsonify({'error': 'Missing authorization'}), 401
        
        url = 'https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,size,createdTime,webViewLink,thumbnailLink)'
        response_data = make_google_api_request(url, access_token)
        
        return jsonify(response_data)
        
    except requests.RequestException as error:
        logger.error(f"Drive files fetch error: {error}")
        return jsonify({'error': 'Failed to fetch Drive files', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error fetching Drive files: {error}")
        return jsonify({'error': 'Failed to fetch Drive files', 'details': str(error)}), 500

@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    """Get Google Calendar events"""
    try:
        access_token, user_id = get_access_token_from_request()
        if not access_token:
            return jsonify({'error': 'Missing authorization'}), 401
        
        date = request.args.get('date')
        if date:
            time_min = f"{date}T00:00:00Z"
            time_max = f"{date}T23:59:59Z"
        else:
            now = datetime.now()
            time_min = now.isoformat() + 'Z'
            time_max = (now + timedelta(days=1)).isoformat() + 'Z'
        
        url = f'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin={time_min}&timeMax={time_max}&singleEvents=true&orderBy=startTime'
        response_data = make_google_api_request(url, access_token)
        
        return jsonify(response_data)
        
    except requests.RequestException as error:
        logger.error(f"Calendar events fetch error: {error}")
        return jsonify({'error': 'Failed to fetch calendar events', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error fetching calendar events: {error}")
        return jsonify({'error': 'Failed to fetch calendar events', 'details': str(error)}), 500

@app.route('/api/photos/library', methods=['GET'])
def get_photos_library():
    """Get Google Photos library"""
    try:
        access_token, user_id = get_access_token_from_request()
        if not access_token:
            return jsonify({'error': 'Missing authorization'}), 401
        
        url = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=25'
        response_data = make_google_api_request(url, access_token)
        
        return jsonify(response_data)
        
    except requests.RequestException as error:
        logger.error(f"Photos fetch error: {error}")
        return jsonify({'error': 'Failed to fetch photos', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error fetching photos: {error}")
        return jsonify({'error': 'Failed to fetch photos', 'details': str(error)}), 500

@app.route('/api/photos/picker/url', methods=['GET'])
def get_photo_picker_url():
    """Get Photo Picker URL for WebView"""
    try:
        access_token, user_id = get_access_token_from_request()
        if not access_token:
            return jsonify({'error': 'Missing authorization'}), 401
        
        # Create Photo Picker session
        response_data = make_google_api_request(
            'https://photospicker.googleapis.com/v1/sessions',
            access_token,
            method='POST'
        )
        
        return jsonify({
            'pickerUrl': response_data['pickerUri'],
            'sessionId': response_data['id'],
            'message': 'Use this URL in WebView for Photo Picker'
        })
        
    except requests.RequestException as error:
        logger.error(f"Photo Picker URL error: {error}")
        return jsonify({'error': 'Failed to get Photo Picker URL', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error getting Photo Picker URL: {error}")
        return jsonify({'error': 'Failed to get Photo Picker URL', 'details': str(error)}), 500

@app.route('/api/picker/selection', methods=['POST'])
def store_picker_selection():
    """Store picker selection"""
    data = request.get_json()
    state = data.get('state')
    selection = data.get('selection')
    
    if not state or not isinstance(selection, list):
        return jsonify({'error': 'Missing state or selection'}), 400
    
    logger.info(f"📸 Storing picker selection for state: {state}")
    
    # Store selection in session
    if state in active_sessions:
        active_sessions[state]['pickerSelection'] = selection
        active_sessions[state]['timestamp'] = datetime.now().timestamp()
    else:
        # Create new session if doesn't exist
        active_sessions[state] = {
            'pickerSelection': selection,
            'timestamp': datetime.now().timestamp()
        }
    
    return jsonify({'success': True, 'message': 'Selection stored successfully'})

@app.route('/api/picker/result', methods=['GET'])
def get_picker_result():
    """Get picker results"""
    session = request.args.get('session')
    
    if not session:
        return jsonify({'error': 'Missing session'}), 400
    
    logger.info(f"📸 Fetching picker result for session: {session}")
    
    result = active_sessions.get(session)
    if not result or 'pickerSelection' not in result:
        return jsonify({'error': 'Selection not found'}), 404
    
    return jsonify({
        'success': True,
        'selection': result['pickerSelection'],
        'timestamp': result['timestamp']
    })

@app.route('/api/oauth/refresh', methods=['POST'])
def refresh_token():
    """Refresh access token"""
    try:
        data = request.get_json()
        refresh_token = data.get('refresh_token')
        user_id = data.get('user_id')
        
        if not refresh_token:
            return jsonify({'error': 'Refresh token required'}), 400
        
        token_data = {
            'refresh_token': refresh_token,
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'grant_type': 'refresh_token'
        }
        
        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        response.raise_for_status()
        
        tokens = response.json()
        
        # Update stored tokens if user_id provided
        if user_id:
            user_tokens[user_id] = {
                'access_token': tokens['access_token'],
                'refresh_token': tokens.get('refresh_token', refresh_token),
                'expires_at': datetime.now().timestamp() + tokens['expires_in']
            }
        
        return jsonify(tokens)
        
    except requests.RequestException as error:
        logger.error(f"Token refresh error: {error}")
        return jsonify({'error': 'Token refresh failed', 'details': str(error)}), 500
    except Exception as error:
        logger.error(f"Unexpected error refreshing token: {error}")
        return jsonify({'error': 'Token refresh failed', 'details': str(error)}), 500

@app.route('/test', methods=['GET'])
def test_endpoint():
    """Test endpoint for debugging"""
    logger.info("🧪 TEST ENDPOINT HIT!")
    logger.info(f"🧪 Request from: {request.remote_addr}")
    logger.info(f"🧪 User-Agent: {request.headers.get('User-Agent')}")
    
    return jsonify({
        'message': 'Backend is accessible!',
        'timestamp': datetime.now().isoformat(),
        'ip': request.remote_addr
    })

@app.errorhandler(Exception)
def handle_error(error):
    """Global error handler"""
    logger.error(f"Unhandled error: {error}")
    return jsonify({
        'error': 'Internal server error',
        'message': str(error) if os.getenv('NODE_ENV') == 'development' else 'Something went wrong'
    }), 500

if __name__ == '__main__':
    logger.info(f"🚀 Consolidated Backend server running on port {PORT}")
    logger.info(f"📱 Ready for both web and mobile apps")
    logger.info(f"🔐 OAuth redirect URI: {REDIRECT_URI}")
    logger.info(f"🌐 Frontend URL: {FRONTEND_URL}")
    logger.info(f"🔒 Security: Rate limiting, CORS enabled")
    
    app.run(host='0.0.0.0', port=PORT, debug=os.getenv('NODE_ENV') == 'development')
