// Google OAuth Configuration
// You need to set up OAuth 2.0 credentials in the Google Cloud Console:
// 1. Go to https://console.cloud.google.com/
// 2. Create a new project or select an existing one
// 3. Enable the Google Drive API
// 4. Go to Credentials > Create Credentials > OAuth 2.0 Client IDs
// 5. Set application type to "Web application"
// 6. Add authorized redirect URIs:
//    - For development: http://localhost:19006/auth
//    - For your app: cook-it-mobile://auth
// 7. Copy the Client ID and Client Secret below

export const GOOGLE_OAUTH_CONFIG = {
  // Replace these with your actual credentials from Google Cloud Console
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',
  CLIENT_SECRET: 'YOUR_GOOGLE_CLIENT_SECRET_HERE',

  // Scopes for Google Drive access
  SCOPES: [
    'openid',
    'profile',
    'email',
    'https://www.googleapis.com/auth/drive.file'
  ],

  // Redirect URI scheme (must match your app.json scheme)
  REDIRECT_URI: 'cook-it-mobile://auth',

  // Google OAuth endpoints
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
};

// Instructions for setup:
// 1. Replace CLIENT_ID and CLIENT_SECRET with your actual values
// 2. Make sure the REDIRECT_URI matches your app.json scheme
// 3. Ensure the Google Drive API is enabled in your Google Cloud project
// 4. Test the authentication flow in Expo Go