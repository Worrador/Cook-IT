# Cook-IT Mobile Development Guide

This project supports two development modes:
- **Development**: Using Expo Go for fast iteration
- **Production**: Native Android/iOS builds using EAS Build

## 🚀 Development Mode (Expo Go)

### Prerequisites
1. Install Expo Go app on your phone from Google Play Store or App Store
2. Make sure your phone and computer are on the same WiFi network

### Development Commands

```bash
# Start development server for Expo Go
npm run start

# Start and automatically open on connected Android device/emulator
npm run android:dev

# Start and automatically open on connected iOS device/simulator
npm run ios:dev

# Force Expo Go mode (if needed)
npm run start:expo
```

### Using Expo Go
1. Run `npm run start`
2. Scan the QR code with your phone's camera (iOS) or Expo Go app (Android)
3. The app will load in Expo Go
4. Any code changes will hot-reload automatically

## 📱 Production Mode (Native Builds)

### Prerequisites
1. Install EAS CLI: `npm install -g @expo/eas-cli`
2. Login to Expo: `eas login`

### Production Build Commands

```bash
# Build production APK for Android
npm run build:android

# Build for iOS (requires Apple Developer account)
npm run build:ios

# Build for both platforms
npm run build:all

# Build preview/testing versions
npm run preview:android
npm run preview:ios
```

### Getting Your APK
1. Run `npm run build:android`
2. Wait for the build to complete (usually 10-20 minutes)
3. Download the APK from the Expo dashboard or the provided link
4. Install the APK on your Android device

## 🔄 Workflow Recommendations

### During Development
- Use **Expo Go** for rapid development and testing
- Hot reload makes it perfect for UI development
- Great for testing on multiple devices quickly

### For Testing/Production
- Use **native builds** when you need to test:
  - Google Drive integration (requires native OAuth)
  - Push notifications
  - App store submission
  - Performance testing

## 📋 Build Profiles

### Development
- Uses Expo Go
- Fast iteration
- Limited native module support

### Preview
- Native build with debugging enabled
- Good for testing before production
- Can be shared with testers via Expo dashboard

### Production
- Optimized native build
- Ready for app store submission
- Full native module support

## 🛠 Troubleshooting

### Expo Go Issues
- Clear Expo Go cache: Shake device > "Reload"
- Restart Metro bundler: `npm run start -- --clear`
- Check WiFi connectivity

### Build Issues
- Check EAS CLI is latest: `npm install -g @expo/eas-cli@latest`
- Verify credentials: `eas credentials`
- Check build logs in Expo dashboard

## 📚 Useful Commands

```bash
# Clear all caches and restart
npm run start -- --clear

# Check project configuration
expo doctor

# Update Expo SDK
expo upgrade

# Check build status
eas build:list

# View build logs
eas build:view [BUILD_ID]
```

## 🔗 Helpful Links

- [Expo Go](https://expo.dev/client)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Expo Dashboard](https://expo.dev/accounts/[username]/projects/cookit-mobile)