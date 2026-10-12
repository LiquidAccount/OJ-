const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ojDesktop", {
  initialize: () => ipcRenderer.invoke("oj:initialize"),
  getToolchainStatus: () => ipcRenderer.invoke("oj:toolchain-status"),
  checkForUpdates: () => ipcRenderer.invoke("oj:check-for-updates"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("oj:update-status", listener);
    return () => ipcRenderer.removeListener("oj:update-status", listener);
  }
});
