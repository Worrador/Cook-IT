# Quick Start: Build for Google Play

## Prerequisites Check
```bash
# Install EAS CLI if not already installed
npm install -g eas-cli

# Login to Expo
eas login
```

## Step 1: Set Up Signing Credentials (One-time setup)
```bash
eas credentials
```
- Select: **Android** → **Production** → **Set up a new keystore**
- EAS will generate and store your keystore securely

## Step 2: Build Production AAB
```bash
npm run build:android
```
or
```bash
eas build --platform android --profile production
```

## Step 3: Submit to Google Play
```bash
npm run submit:android
```
or
```bash
eas submit --platform android
```

## Update Version for New Releases

Before building a new version:

1. Update `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. Update `android/app/build.gradle`:
   ```gradle
   versionCode 2  // Increment this number
   versionName "1.0.1"  // Match app.json version
   ```

## Testing Before Submission

Build a test APK:
```bash
npm run preview:android
```

Install on device:
```bash
adb install path/to/downloaded-apk.apk
```

## Need Help?

See `GOOGLE_PLAY_PACKAGING.md` for detailed instructions.


