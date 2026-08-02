# Google Play Store Packaging Guide

This guide will help you package your Cook-IT mobile app for Google Play Store submission.

## Prerequisites

1. **Expo Account**: Make sure you have an Expo account and are logged in
2. **EAS CLI**: Install EAS CLI globally if you haven't already:
   ```bash
   npm install -g eas-cli
   ```
3. **Google Play Console Account**: You need a Google Play Developer account ($25 one-time fee)

## Step 1: Login to EAS

```bash
eas login
```

## Step 2: Configure EAS Credentials

EAS will handle signing your app automatically. Run this command to set up Android credentials:

```bash
eas credentials
```

Select:
- **Platform**: Android
- **Project**: Your Cook-IT project
- **Workflow**: Production (or Build credentials)
- **Action**: Set up a new keystore (EAS will generate one for you)

EAS will store your keystore securely. **Important**: Download and backup your credentials if you want to build locally in the future.

## Step 3: Update App Version (Optional)

Before building, you may want to update your app version in `app.json`:

```json
{
  "expo": {
    "version": "1.0.0",  // Update this for new releases
    ...
  }
}
```

Also update `android/app/build.gradle`:
- `versionCode`: Increment this integer for each release (1, 2, 3, ...)
- `versionName`: Match your app.json version

## Step 4: Build for Production

Build your Android App Bundle (AAB) for Google Play:

```bash
npm run build:android
```

Or directly with EAS:

```bash
eas build --platform android --profile production
```

This will:
- Build your app in the cloud
- Generate a signed Android App Bundle (AAB)
- Take approximately 10-20 minutes

## Step 5: Download Your Build

Once the build completes:
1. Visit https://expo.dev/accounts/[your-account]/projects/cookit-mobile/builds
2. Download the `.aab` file
3. Or use the EAS CLI to download:
   ```bash
   eas build:list
   eas build:download [build-id]
   ```

## Step 6: Submit to Google Play Store

### Option A: Using EAS Submit (Recommended)

```bash
npm run submit:android
```

Or:

```bash
eas submit --platform android
```

This will guide you through:
- Uploading your AAB to Google Play Console
- Creating a new release (if needed)
- Submitting for review

### Option B: Manual Submission

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app (or create a new app)
3. Go to **Production** (or **Testing** → **Internal testing**)
4. Click **Create new release**
5. Upload your `.aab` file
6. Fill in release notes
7. Review and publish

## Important Notes

### Android App Bundle (AAB)
- Google Play **requires** AAB format for new apps (as of August 2021)
- The `eas.json` has been configured to build AAB for production
- APK format is only available in preview builds for testing

### Signing
- EAS handles signing automatically when using EAS Build
- Your keystore is stored securely by Expo
- **Keep your credentials safe** - you'll need them for app updates
- You can download credentials from EAS dashboard for backup

### Version Management
- `versionCode` (in build.gradle): Must increment for each release (1, 2, 3, ...)
- `versionName` (in app.json): User-facing version (1.0.0, 1.0.1, ...)
- Google Play requires versionCode to increase with each upload

### Testing Before Submission

Test your production build before submitting:

1. Build a preview APK:
   ```bash
   npm run preview:android
   ```

2. Install on a device:
   ```bash
   adb install path/to/app.apk
   ```

3. Test all functionality, especially:
   - Google Sign-In
   - File operations
   - Database operations
   - Offline functionality

## Troubleshooting

### Build Fails
- Check EAS build logs: https://expo.dev/accounts/[your-account]/projects/cookit-mobile/builds
- Ensure all dependencies are properly installed
- Check for any native module compatibility issues

### Signing Issues
- Run `eas credentials` to verify your keystore is set up
- Ensure you're using the production profile for Google Play builds

### Upload Issues
- Verify your AAB file is not corrupted
- Check Google Play Console for specific error messages
- Ensure your app meets Google Play policies

## Next Steps After Submission

1. **App Store Listing**: Create your app listing in Google Play Console
   - App name, description, screenshots
   - Feature graphic
   - Privacy policy URL (required)

2. **Content Rating**: Complete the content rating questionnaire

3. **Pricing & Distribution**: Set your app as free or paid

4. **Review**: Google typically reviews apps within 1-3 days

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Google Play Console](https://play.google.com/console)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Expo Submission Guide](https://docs.expo.dev/submit/introduction/)


