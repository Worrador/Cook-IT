// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  initialize: () => ipcRenderer.invoke('initialize'),
  chooseRecipe: () => ipcRenderer.invoke('choose-recipe'),
  addRecipe: (recipe) => ipcRenderer.invoke('add-recipe', recipe),
});