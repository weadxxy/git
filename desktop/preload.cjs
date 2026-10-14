const { contextBridge } = require('electron');

// Expose display metadata only; the game receives no filesystem or Node access.
contextBridge.exposeInMainWorld('lumenfall', Object.freeze({ isDesktop: true }));
