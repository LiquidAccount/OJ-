const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ojDesktop", {
  initialize: () => ipcRenderer.invoke("oj:initialize"),
  getToolchainStatus: () => ipcRenderer.invoke("oj:toolchain-status"),
  checkForUpdates: () => ipcRenderer.invoke("oj:check-for-updates"),
  getUpdateState: () => ipcRenderer.invoke("oj:update-state"),
  downloadUpdate: () => ipcRenderer.invoke("oj:download-update"),
  installUpdate: () => ipcRenderer.invoke("oj:install-update"),
  openDownloadPage: () => ipcRenderer.invoke("oj:open-download-page"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("oj:update-status", listener);
    return () => ipcRenderer.removeListener("oj:update-status", listener);
  }
});
