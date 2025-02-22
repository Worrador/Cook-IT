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
  
  // Performance monitoring API
  getStartupMetrics: () => ipcRenderer.invoke('get-startup-metrics')
});