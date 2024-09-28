const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  // Start Python process
  pythonProcess = spawn('python', ['cook_it_bridge.py']);

  let bufferedData = '';

  pythonProcess.stdout.on('data', (data) => {
    bufferedData += data.toString();
    let newlineIndex;
    while ((newlineIndex = bufferedData.indexOf('\n')) !== -1) {
      const line = bufferedData.slice(0, newlineIndex);
      bufferedData = bufferedData.slice(newlineIndex + 1);
      try {
        const response = JSON.parse(line);
        console.log('Received JSON response:', response);
        // Handle the response
        // You might need to implement a way to match responses to requests
      } catch (error) {
        console.error('Error parsing Python stdout:', error);
      }
    }
  });
  
  pythonProcess.stderr.on('data', (data) => {
    console.log(`Python debug output: ${data}`);
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
        // If it's not valid JSON, we ignore it (it might be partial data)
      }
    };

    pythonProcess.stdout.on('data', responseHandler);
    pythonProcess.stdin.write(JSON.stringify(message) + '\n');
  });
}