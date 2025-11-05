const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronInfo', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
