// Native passthrough for the Google Sign-In surface googleDriveService.js uses.
//
// This file exists purely so that googleDriveService.js can import from a local
// path instead of directly from '@react-native-google-signin/google-signin'.
// Metro resolves `googleSignin.web.js` ahead of this file when bundling for web,
// which is what lets the browser get an entirely different implementation (Google
// Identity Services) without googleDriveService.js needing any platform branch.
//
// On iOS/Android nothing changes: this re-exports the real native module.
export { GoogleSignin } from '@react-native-google-signin/google-signin';
