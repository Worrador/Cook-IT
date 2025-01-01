const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  initialize: () => ipcRenderer.invoke('initialize'),
  chooseRecipe: () => ipcRenderer.invoke('choose-recipe'),
  addRecipe: (recipe) => ipcRenderer.invoke('add-recipe', recipe),
  updateComment: (recipe, comment) => ipcRenderer.invoke('update-comment', recipe, comment),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  quit: () => ipcRenderer.invoke('quit')
});