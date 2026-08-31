// Google Drive file picker for the web build.
//
// WHY THIS EXISTS, beyond convenience:
// The app authenticates with the `drive.file` scope, which grants access only to
// files the app itself created. That means a spreadsheet made by a different
// client - for example the old desktop Cook-IT app, which writes `Recipes.xlsx`
// with its own OAuth client - is completely invisible to this app. It will not
// appear in files.list results at any name, so no amount of renaming helps.
//
// The Google Picker is Google's designated mechanism for widening `drive.file`:
// when the user selects a file in the Picker, the app is granted access to that
// specific file. So this is not a workaround for the naming rule in
// googleDriveService.getDriveFileId() - it is the supported way to attach an
// existing file, and it removes the hardcoded-filename constraint entirely,
// because once a file ID is stored the name is never consulted again.
//
// This module is web-only. It is imported lazily from the web screen; native
// keeps its existing flow.
import { GOOGLE_PICKER_API_KEY, GOOGLE_APP_ID } from '../config/webConfig';

const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';

// The mime type the rest of the app can actually parse. excelService reads the
// file with SheetJS, so a native Google Sheet (application/vnd.google-apps.
// spreadsheet) is NOT interchangeable - it would need an export conversion
// first. Restricting the picker to real .xlsx keeps that mismatch from becoming
// a confusing parse failure later.
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let gapiPromise = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('The Drive picker requires a browser environment'));
      return;
    }
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load the Google API script')));
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Failed to load the Google API script'));
    document.head.appendChild(script);
  });
}

// Loaded once and cached. Called on mount by the web screen so that the click
// handler doesn't have to await a network fetch - the Picker opens a window, and
// awaiting inside the click would risk losing user activation.
export function preloadPicker() {
  if (gapiPromise) return gapiPromise;
  gapiPromise = loadScript(GAPI_SCRIPT_URL).then(
    () => new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load the Google Picker module')),
      });
    })
  );
  return gapiPromise;
}

/**
 * Open the Drive picker and resolve with the chosen file.
 *
 * @param {string} accessToken A live OAuth access token for the signed-in user.
 * @returns {Promise<{id: string, name: string, mimeType: string} | null>}
 *          The chosen file, or null if the user cancelled.
 */
export async function pickDriveFile(accessToken) {
  if (!GOOGLE_PICKER_API_KEY) {
    throw new Error(
      'The Drive picker is not configured yet: no API key. Enable the Google Picker API and add a key in src/config/webConfig.js.'
    );
  }
  if (!accessToken) {
    throw new Error('Connect to Google Drive before choosing a file.');
  }

  await preloadPicker();

  return new Promise((resolve, reject) => {
    try {
      const { google } = window;
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes(XLSX_MIME)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(GOOGLE_PICKER_API_KEY)
        // appId ties the grant to this Cloud project, which is what makes the
        // picked file reachable under drive.file afterwards.
        .setAppId(GOOGLE_APP_ID)
        .addView(view)
        .setTitle('Choose your Cook-IT recipe workbook')
        .setCallback((data) => {
          const action = data[google.picker.Response.ACTION];
          if (action === google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS]?.[0];
            if (!doc) { resolve(null); return; }
            resolve({
              id: doc[google.picker.Document.ID],
              name: doc[google.picker.Document.NAME],
              mimeType: doc[google.picker.Document.MIME_TYPE],
            });
          } else if (action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}
