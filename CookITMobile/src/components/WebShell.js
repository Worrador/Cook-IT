// Page-level chrome for the browser build: document title, global CSS, and the
// full-bleed page background. Renders children edge-to-edge - the desktop layout
// itself lives in src/screens/WebHome.js.
//
// On native this is a pass-through and does nothing.
import React, { useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { PAGE_BG, CREAM } from '../theme/webPalette';

const STYLE_TAG_ID = 'cookit-web-shell-styles';

// Things React Native's style system can't express: the html/body background
// behind the app, default margin removal, and a scrollbar that matches the
// palette instead of the browser default.
const GLOBAL_CSS = `
  html, body, #root { height: 100%; margin: 0; background-color: ${PAGE_BG}; }
  body {
    -webkit-font-smoothing: antialiased;
    font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
  }
  ::selection { background: #F2BC42; color: #3D2E1F; }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: ${PAGE_BG}; }
  ::-webkit-scrollbar-thumb { background: #5A4230; border-radius: 6px; border: 3px solid ${PAGE_BG}; }
  ::-webkit-scrollbar-thumb:hover { background: #6B4F37; }
  /* react-native-web renders pressables as divs; kill the focus ring only where
     we draw our own hover/active affordance. */
  [data-focusvisible-polyfill] { outline: 2px solid #F2BC42; outline-offset: 2px; }
`;

export default function WebShell({ children }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = 'Cook-IT — Your Recipe Manager';
    if (!document.getElementById(STYLE_TAG_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_TAG_ID;
      style.textContent = GLOBAL_CSS;
      document.head.appendChild(style);
    }
  }, []);

  if (Platform.OS !== 'web') return children;
  return <View style={styles.page}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: CREAM },
});
