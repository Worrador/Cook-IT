// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html'); // This will load your React app
}

app.whenReady().then(() => {
  createWindow();

  // Start Python process
  pythonProcess = spawn('python', ['cook_it_bridge.py']);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Terminate the Python process
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

// IPC handlers
ipcMain.handle('initialize', async () => {
  return new Promise((resolve, reject) => {
    pythonProcess.stdin.write(JSON.stringify({ action: 'initialize' }) + '\n');
    pythonProcess.stdout.once('data', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
});

ipcMain.handle('choose-recipe', async () => {
  return new Promise((resolve, reject) => {
    pythonProcess.stdin.write(JSON.stringify({ action: 'choose-recipe' }) + '\n');
    pythonProcess.stdout.once('data', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
});

ipcMain.handle('add-recipe', async (event, recipe) => {
  return new Promise((resolve, reject) => {
    pythonProcess.stdin.write(JSON.stringify({ action: 'add-recipe', recipe }) + '\n');
    pythonProcess.stdout.once('data', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
});