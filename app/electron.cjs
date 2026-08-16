const { app, BrowserWindow } = require('electron');
const path = require('path');

// 👇 FORÇA O WINDOWS A RECONHECER O SEU NOME, NÃO O DO ELECTRON 👇
app.setAppUserModelId("RPG Anime System");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "RPG Anime System - Forja Definitiva", // 👈 Força o título da janela
    icon: path.join(__dirname, 'logo.ico'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });

  win.webContents.session.clearCache();
  win.webContents.session.clearStorageData({ storages: ['serviceworkers'] });

  // 🔥 CORREÇÃO VITAL: Apontando para o seu domínio real 🔥
  win.loadURL('https://rpg-referencias.web.app');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});