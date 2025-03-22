// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const fs = require('fs');

// Add performance markers
let startupMetrics = {
  appStart: 0,
  windowCreated: 0,
  pythonProcessStarted: 0,
  pythonInitialized: 0,
  totalStartupTime: 0
};

// Start measuring as early as possible
startupMetrics.appStart = performance.now();

let mainWindow;
let pythonProcess = null;

// Custom logger that only logs in development
const logger = {
  log: (...args) => {
    if (isDev) console.log(...args);
  },
  error: (...args) => {
    if (isDev) console.error(...args);
  }
};

function getPythonPath() {
  if (isDev) {
    // For development environment
    const pythonScript = path.join(__dirname, 'cook_it_bridge.py');
    // Check if python script exists
    if (!fs.existsSync(pythonScript)) {
      throw new Error(`Python script not found at: ${pythonScript}`);
    }

    // On Windows, try to use python from PATH
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    return {
      command: pythonCommand,
      args: [pythonScript]
    };
  } else {
    // For production environment
    const exePath = path.join(process.resourcesPath, 'Cook-IT.exe');
    if (!fs.existsSync(exePath)) {
      throw new Error(`Executable not found at: ${exePath}`);
    }
    return {
      command: exePath,
      args: []
    };
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 384,
    frame: false,
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    icon: path.join(__dirname, 'assets', 'chef-hat.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  startupMetrics.windowCreated = performance.now();

  const { command, args } = getPythonPath();
  logger.log(`Launching process with command: ${command} and args:`, args);

  pythonProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1'
    }
  });

  pythonProcess.on('error', (err) => {
    logger.error('Backend error:', err);
  });

  pythonProcess.stdout.on('data', (data) => {
    logger.log('Backend response:', data.toString());
  });

  pythonProcess.stderr.on('data', (data) => {
    logger.error('Backend debug:', data.toString());
  });

  startupMetrics.pythonProcessStarted = performance.now();

  // Load the app
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
  } else {
    await mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
  }

  // Add startup time logging
  ipcMain.handle('get-startup-metrics', () => {
    return startupMetrics;
  });
}

ipcMain.handle('initialize', async () => {

  setupStatusUpdateListener();

  try {
    const result = await sendToPython({ action: 'initialize' });

    // Remove listener if status is not pending, we do not need it
    if (!result.statusPending) {
      removeStatusUpdateListener();
    }

    startupMetrics.pythonInitialized = performance.now();
    startupMetrics.totalStartupTime = startupMetrics.pythonInitialized - startupMetrics.appStart;

    if (isDev) {
      logger.log('Startup Metrics:', {
        'Total Startup Time': `${startupMetrics.totalStartupTime.toFixed(2)}ms`,
        'Window Creation Time': `${(startupMetrics.windowCreated - startupMetrics.appStart).toFixed(2)}ms`,
        'Python Process Start Time': `${(startupMetrics.pythonProcessStarted - startupMetrics.windowCreated).toFixed(2)}ms`,
        'Python Initialization Time': `${(startupMetrics.pythonInitialized - startupMetrics.pythonProcessStarted).toFixed(2)}ms`
      });
    }

    return result;
  } catch (error) {
    logger.error('Initialization error:', error);
    throw error;
  }
});

function setupStatusUpdateListener() {
  // Remove any existing listener first
  removeStatusUpdateListener();

  pythonProcess._statusUpdateHandler = (data) => {
    const text = data.toString().trim();

    if (text.startsWith('STATUS_UPDATE:')) {
      try {
        const jsonPart = text.substring('STATUS_UPDATE:'.length);
        const status = JSON.parse(jsonPart);

        logger.log('Received status update:', status);

        // Broadcast to all windows
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send('connection-status-update', status);
        });

        // Any status update means we're done with the listener
        removeStatusUpdateListener();
      } catch (error) {
        logger.error('Error parsing status update:', error);
      }
    }
  };

  pythonProcess.stdout.on('data', pythonProcess._statusUpdateHandler);
}

function removeStatusUpdateListener() {
  if (pythonProcess && pythonProcess._statusUpdateHandler) {
    pythonProcess.stdout.removeListener('data', pythonProcess._statusUpdateHandler);
    pythonProcess._statusUpdateHandler = null;
  }
}

// Add new handler to register for status updates
ipcMain.handle('register-for-status-updates', async () => {
  return sendToPython({ action: 'register-for-status-updates' });
});

// Add new handler to check current status
ipcMain.handle('get-connection-status', async () => {
  return sendToPython({ action: 'get-connection-status' });
});

app.whenReady().then(createWindow);

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
    let buffer = '';

    const responseHandler = (data) => {
      const text = data.toString();

      // Skip status update messages
      if (text.includes('STATUS_UPDATE:')) {
        return;
      }

      // Handle case where the OAuth URL and JSON are in the same message
      const jsonMatches = text.match(/(\{.*\})/g);

      if (jsonMatches && jsonMatches.length > 0) {
        try {
          const response = JSON.parse(jsonMatches[jsonMatches.length - 1]);

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }

        } catch (error) {
          logger.error('JSON parse error:', error);
          buffer += text;
          logger.error('Buffering partial response:', buffer);
        }
      } else {
        logger.log('Non-JSON output:', text);
      }
    };

    pythonProcess.stdout.on('data', responseHandler);
    pythonProcess.stdin.write(JSON.stringify(message) + '\n');
  });
}