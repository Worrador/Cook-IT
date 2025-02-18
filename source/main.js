
// mainWindow.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 384,
    frame: false,
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
  }

   mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  setTimeout(() => {
    createWindow();
  }, 2000);

  // Start Python process
  const backendPath = isDev
    ? path.join(__dirname, '..', 'resource', 'dist', 'Cook-IT.exe')
    : path.join(process.resourcesPath, 'Cook-IT.exe');

  // Add these logs right before spawning the process
  console.log('Starting backend process...');
  console.log('Backend path:', backendPath);

  pythonProcess = spawn(backendPath);
  console.log('Backend process started');
  pythonProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  let bufferedData = '';

  pythonProcess.stdout.on('data', (data) => {
    bufferedData += data.toString();
    let newlineIndex;
    while ((newlineIndex = bufferedData.indexOf('\n')) !== -1) {
      const line = bufferedData.slice(0, newlineIndex);
      bufferedData = bufferedData.slice(newlineIndex + 1);
      try {
        const response = JSON.parse(line);
        console.log('Frontend received:', response);
      } catch (error) {
        console.error('Error parsing Python stdout:', error);
      }
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.log(`Backend: ${data}`);
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
  return sendToPython({ action: 'initialize' });
});

ipcMain.handle('choose-recipe', async () => {
  return sendToPython({ action: 'choose-recipe' });
});

ipcMain.handle('add-recipe', async (event, recipe) => {
  return sendToPython({ action: 'add-recipe', recipe });
});

ipcMain.handle('open-url', async (event, url) => {
  return sendToPython({ action: 'open-url', url });
});

ipcMain.handle('update-comment', async (event, recipe, comment) => {
  return sendToPython({ action: 'update-comment', recipe, comment });
});

ipcMain.handle('quit', async (event) => {
  return sendToPython({ action: 'quit' });
});

ipcMain.handle('update-recency', async (event, cookedRecipes) => {
  return sendToPython({ action: 'update-recency', cookedRecipes });
});

ipcMain.handle('delete-recipe', async (event, recipe) => {
  return sendToPython({ action: 'delete-recipe', recipe });
});

function sendToPython(message) {
  return new Promise((resolve, reject) => {
    const responseHandler = (data) => {
      try {
        const response = JSON.parse(data);
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
        pythonProcess.stdout.removeListener('data', responseHandler);
      } catch (error) {
        // Ignore non-JSON data (partial responses)
      }
    };

    pythonProcess.stdout.on('data', responseHandler);
    pythonProcess.stdin.write(JSON.stringify(message) + '\n');
  });
}