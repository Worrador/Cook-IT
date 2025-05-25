const { contextBridge, ipcRenderer } = require('electron');

// Combine all API methods into a single object
contextBridge.exposeInMainWorld('electronAPI', {
  // Existing APIs
  initialize: () => ipcRenderer.invoke('initialize'),
  chooseRecipe: () => ipcRenderer.invoke('choose-recipe'),
  addRecipe: (recipe) => ipcRenderer.invoke('add-recipe', recipe),
  updateComment: (recipe, comment) => ipcRenderer.invoke('update-comment', recipe, comment),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  updateRecency: (cookedRecipes) => ipcRenderer.invoke('update-recency', cookedRecipes),
  deleteRecipe: (recipe) => ipcRenderer.invoke('delete-recipe', recipe),
  quit: () => ipcRenderer.invoke('quit'),
  openRecipeBook: () => ipcRenderer.invoke('open-recipe-book'),
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  onConnectionStatusUpdate: (callback) => {
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners('connection-status-update');
    // Set up new listener
    ipcRenderer.on('connection-status-update', (_, status) => callback(status));
    // Return a cleanup function
    return () => {
      ipcRenderer.removeAllListeners('connection-status-update');
    };
  },

  // Performance monitoring API
  getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics')
});