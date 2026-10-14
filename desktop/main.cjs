const { app, BrowserWindow, Menu, dialog, net, protocol, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'lumenfall';
const ORIGIN = `${SCHEME}://game`;
const root = path.resolve(__dirname, '..');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
let mainWindow;

app.setName('Lumenfall');
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.weadxxy.lumenfall');
    Menu.setApplicationMenu(null);
    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url);
      const asset = url.host === 'game' && assets.get(url.pathname);
      if (request.method !== 'GET' || !asset) return new Response('Not found', { status: 404 });
      try {
        const file = await net.fetch(pathToFileURL(path.join(root, asset[0])).href);
        return new Response(file.body, { headers: {
          'Content-Type': asset[1],
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'",
          'X-Content-Type-Options': 'nosniff',
        } });
      } catch (error) {
        console.error('Unable to load a bundled game asset:', asset[0], error.message);
        return new Response('Asset unavailable', { status: 500 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(contents === mainWindow?.webContents && permission === 'fullscreen');
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) => {
      return contents === mainWindow?.webContents && permission === 'fullscreen';
    });
    // All game assets and sounds are local. The renderer never needs the Internet.
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_details, callback) => callback({ cancel: true }),
    );
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox('微光之境无法启动', '游戏文件无法加载，请重新安装。\n' + error.message);
    app.quit();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: '微光之境 · Lumenfall',
    width: 1280, height: 920, minWidth: 960, minHeight: 680,
    backgroundColor: '#0a110f', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `${ORIGIN}/` && url !== `${ORIGIN}/index.html`) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault(); mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'q' && (input.control || input.meta)) {
      event.preventDefault(); app.quit();
    }
  });
  const query = process.argv.includes('--smoke-test') ? '?test=1' : '';
  await mainWindow.loadURL(`${ORIGIN}/${query}`);
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
