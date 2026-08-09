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

// Single, persistent stdout reader state.
// Python answers requests strictly in order, so a FIFO queue of pending
// {resolve, reject, timer} entries lets us route each response line to the
// correct request. Partial lines are kept in stdoutBuffer between chunks.
const pendingRequests = [];
let stdoutBuffer = '';
const REQUEST_TIMEOUT_MS = 30000;

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
    width: 445,
    height: 385,
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

  // Install the single persistent stdout reader exactly once, right after spawn.
  setupPythonReader();

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

  try {
    const result = await sendToPython({ action: 'initialize' });

    // The single persistent stdout reader always handles STATUS_UPDATE lines,
    // so there is no per-initialize listener to set up or tear down. When
    // result.statusPending is true, an asynchronous connection_status update
    // will arrive later and be broadcast automatically by the reader.

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

// Single, persistent stdout reader installed once per python process.
// Accumulates stdout into a buffer, splits on newlines, and processes only
// COMPLETE lines (any trailing partial line is kept for the next chunk).
function setupPythonReader() {
  pythonProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();

    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const rawLine = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      // Trim to drop any trailing \r (Windows text-mode) and stray whitespace.
      const line = rawLine.trim();
      if (!line) continue;

      // Asynchronous connection-status push, independent of request/response.
      if (line.startsWith('STATUS_UPDATE:')) {
        try {
          const status = JSON.parse(line.substring('STATUS_UPDATE:'.length));

          logger.log('Received status update:', status);

          // Broadcast to all windows
          BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('connection-status-update', status);
          });
        } catch (error) {
          logger.error('Error parsing status update:', error);
        }
        continue;
      }

      // Otherwise this is a response line. Parse it and resolve the OLDEST
      // pending request (Python answers requests in FIFO order).
      let response;
      try {
        response = JSON.parse(line);
      } catch (error) {
        // Not JSON and not a status update: stray output, don't consume a request.
        logger.log('Non-JSON output:', line);
        continue;
      }

      const pending = pendingRequests.shift();
      if (!pending) {
        logger.error('Received response with no pending request:', line);
        continue;
      }

      clearTimeout(pending.timer);
      if (response.error) {
        pending.reject(new Error(response.error));
      } else {
        pending.resolve(response);
      }
    }
  });
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

ipcMain.handle('open-recipe-book', async () => {
  return sendToPython({ action: 'open-recipe-book' });
});

ipcMain.handle('add-sample-recipes', async () => {
  return sendToPython({ action: 'add-sample-recipes' });
});

function sendToPython(message) {
  return new Promise((resolve, reject) => {
    const pending = { resolve, reject, timer: null };

    // Reject (and drop from the queue) if no response arrives in time, so a
    // dropped/missing response can't hang the promise forever.
    pending.timer = setTimeout(() => {
      const index = pendingRequests.indexOf(pending);
      if (index !== -1) {
        pendingRequests.splice(index, 1);
      }
      reject(new Error('Timed out waiting for Python response'));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.push(pending);

    try {
      pythonProcess.stdin.write(JSON.stringify(message) + '\n');
    } catch (error) {
      // Write failed synchronously: clean up this pending entry.
      clearTimeout(pending.timer);
      const index = pendingRequests.indexOf(pending);
      if (index !== -1) {
        pendingRequests.splice(index, 1);
      }
      reject(error);
    }
  });
}