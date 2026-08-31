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

  // 🔥 CORREÇÃO: alert()/confirm() nativos do Windows roubam o foco da janela e,
  // ao fechar o diálogo, o Electron/Chromium às vezes não devolve o foco de
  // teclado pro conteúdo (webContents) — o usuário via a janela normal, mas
  // nenhum campo aceitava clique/digitação até alt-tab manual. Forçando o foco
  // de volta pro webContents sempre que a JANELA reganha foco do SO (o que
  // acontece automaticamente assim que o diálogo nativo fecha) resolve isso
  // sem precisar tocar em nenhum dos alert()/confirm() espalhados pelo app.
  // O setTimeout(0) adia a chamada em um tick: em algumas combinações de
  // Electron/Windows, a própria restauração de foco (quebrada) do Chromium
  // ainda está em andamento nesse exato instante e sobrescreveria uma
  // chamada síncrona feita direto no handler.
  win.on('focus', () => {
    setTimeout(() => win.webContents.focus(), 0);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});