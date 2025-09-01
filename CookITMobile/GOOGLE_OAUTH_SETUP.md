# Google OAuth Setup Guide

## Overview
This guide will help you set up Google OAuth for the CookIT Mobile app to enable Google Drive sync functionality.

## Prerequisites
1. A Google Cloud Console account
2. Access to create and manage OAuth 2.0 credentials

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"

## Step 2: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type (unless you have a Google Workspace account)
3. Fill in the required information:
   - App name: "CookIT Mobile"
   - User support email: Your email
   - Developer contact information: Your email
4. Add the following scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `openid`
   - `profile`
   - `email`
5. Add test users if needed (for external apps)
6. Save and continue

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Android" as the application type
4. Fill in the details:
   - Package name: `com.worrador.cookitmobile`
   - SHA-1 certificate fingerprint: (see step 4 for how to get this)
5. Click "Create"

## Step 4: Get SHA-1 Certificate Fingerprint

### For Development (Debug Certificate):
```bash
# Navigate to your project directory
cd CookITMobile

# For debug certificate (development)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

### For Production (Release Certificate):
```bash
# For release certificate (production)
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
```

## Step 5: Create Web Client ID

1. In the same credentials page, click "Create Credentials" > "OAuth 2.0 Client IDs"
2. Choose "Web application" as the application type
3. Add authorized JavaScript origins:
   - `https://auth.expo.io`
4. Add authorized redirect URIs:
   - `https://auth.expo.io/@your-expo-username/cookit-mobile`
   - `https://auth.expo.io/@your-expo-username/cookit-mobile/`
5. Click "Create"
6. Copy the Client ID (this is your web client ID)

**Note:** Since you only have `expo.io` in your authorized domains, we're only using Expo's authentication domain. This should work for both development and production.

## Step 6: Update App Configuration

**Note:** Your current `googleDriveService.js` uses a simpler configuration without `webClientId`. This should work with just the Android OAuth client setup.

Your current configuration is:
```javascript
GoogleSignin.configure({
  scopes: SCOPES,
});
```

If you continue to get DEVELOPER_ERROR, you may need to add the web client ID:
```javascript
GoogleSignin.configure({
  scopes: SCOPES,
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // Only if needed
});
```

## Step 7: Update app.json (if needed)

The app.json should already be configured, but verify it contains:

```json
{
  "expo": {
    "plugins": [
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "com.worrador.cookitmobile",
          "androidPackageName": "com.worrador.cookitmobile"
        }
      ]
    ]
  }
}
```

## Step 8: Rebuild the App

After making these changes, you need to rebuild the app:

```bash
# Clean and rebuild
expo prebuild --clean
expo run:android  # or expo run:ios
```

## Troubleshooting

### DEVELOPER_ERROR
- Ensure the package name matches exactly between your app and Google Cloud Console
- Verify the SHA-1 fingerprint is correct
- Make sure the web client ID is properly configured
- Check that the OAuth consent screen is configured correctly
- **If you only have `expo.io` in authorized domains**: Make sure you're only using `https://auth.expo.io` in your OAuth client configuration
- **For development testing**: You might need to add your email as a test user in the OAuth consent screen if your app is in "Testing" mode

### SIGN_IN_CANCELLED
- This is normal if the user cancels the sign-in process

### SIGN_IN_REQUIRED
- The user needs to sign in again, usually after token expiration

## Testing

1. Run the app
2. Try to connect to Google Drive
3. You should see the Google sign-in screen
4. After signing in, you should be prompted to grant Drive permissions
5. The app should successfully connect to Google Drive

## Security Notes

- Never commit your actual web client ID to version control
- Use environment variables or secure configuration management
- Regularly rotate your OAuth credentials
- Monitor your OAuth usage in Google Cloud Console

## Quick Verification Checklist

Before testing, verify these items:

### Google Cloud Console:
- [ ] Google Drive API is enabled
- [ ] OAuth consent screen is configured with required scopes
- [ ] Android OAuth client is created with correct package name and SHA-1
- [ ] Your email is added as a test user (if app is in testing mode)
- [ ] Web OAuth client is created with `https://auth.expo.io` origins (only if you get DEVELOPER_ERROR)

### App Configuration:
- [ ] `app.json` has the Google Sign-In plugin configured
- [ ] App has been rebuilt with `expo prebuild --clean`
- [ ] Web client ID is updated in `googleDriveService.js` (only if you get DEVELOPER_ERROR)

### Development Environment:
- [ ] SHA-1 fingerprint from debug keystore matches Google Cloud Console
- [ ] Package name `com.worrador.cookitmobile` matches exactly
- [ ] You're using the correct Google account for testing 