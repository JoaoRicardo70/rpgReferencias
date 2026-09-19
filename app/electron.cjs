const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');

// 👇 FORÇA O WINDOWS A RECONHECER O SEU NOME, NÃO O DO ELECTRON 👇
app.setAppUserModelId("RPG Anime System");

const URL_DO_APP = 'https://rpg-referencias.web.app';

// 🎬 O gravador de sessão precisa que a janela continue "viva" com o app minimizado ou coberto por
// outra janela: sem estes ajustes o Chromium pausa a renderização e os timers, e a gravação da tela
// (e o filtro de ruído da Sala da Party) congelam assim que você minimiza.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    }
  });

  // 🎬 getDisplayMedia() no Electron não abre nenhum seletor por conta própria: sem este handler o
  // pedido de captura de tela é recusado e o gravador cai para "somente áudio". Entrega o próprio
  // conteúdo do app (o frame que pediu, só se for o site do app) — captura só o app, não a tela toda,
  // e continua entregando quadros com a janela minimizada.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    let origemDoApp = false;
    try { origemDoApp = new URL(request.securityOrigin).origin === URL_DO_APP; } catch (e) { /* origem inválida */ }
    // Só o quadro principal do app pode pedir a captura (não subquadros/iframes).
    if (!origemDoApp || !request.frame || request.frame.parent) return callback({});
    callback({ video: request.frame });
  }, { useSystemPicker: false });

  win.webContents.session.clearCache();
  win.webContents.session.clearStorageData({ storages: ['serviceworkers'] });

  // 🔥 CORREÇÃO VITAL: Apontando para o seu domínio real 🔥
  win.loadURL(URL_DO_APP);

  // 🔥 CORREÇÃO DEFINITIVA: alert()/confirm() nativos do Chromium (window.alert/window.confirm)
  // roubam o foco de teclado da janela e, ao fechar, o Electron/Chromium no Windows não devolve
  // esse foco de forma confiável — o usuário via a janela normal, mas nenhum campo aceitava
  // clique/digitação até um alt-tab manual. A primeira tentativa (só reagir ao evento 'focus' da
  // BrowserWindow) NÃO resolveu na prática: esse diálogo nativo trava a Thread da renderer sem
  // necessariamente tirar o foco em nível de SO da janela principal, então o evento 'focus'
  // simplesmente nunca disparava de volta.
  //
  // A correção de verdade: preload.cjs substitui window.alert/window.confirm ANTES da página
  // carregar, redirecionando cada chamada via IPC síncrono pros handlers abaixo, que usam
  // dialog.showMessageBoxSync (o diálogo NATIVO do próprio Electron, devidamente integrado ao
  // gerenciamento de foco de janelas do Electron — não o do Chromium). Como
  // showMessageBoxSync BLOQUEIA o processo principal até o usuário fechar o diálogo, o
  // win.focus()/win.webContents.focus() abaixo roda no EXATO instante em que o diálogo fecha,
  // sem depender de nenhum evento que talvez nunca dispare. win.blur() antes do win.focus() força
  // o Windows a redespachar o foco de teclado, em vez de assumir que a janela "já estava" em foco.
  const refocarJanela = () => {
    if (win.isDestroyed()) return;
    win.blur();
    win.focus();
    win.webContents.focus();
  };

  // 🔥 event.returnValue precisa ser atribuído SEMPRE, mesmo se showMessageBoxSync lançar (ex.:
  // janela destruída no meio da chamada, numa corrida com o fechamento do app) — sem o
  // try/finally, uma exceção aqui deixaria o ipcRenderer.sendSync() da preload.cjs esperando pra
  // sempre uma resposta que nunca chega, reproduzindo o EXATO mesmo travamento de input que esta
  // correção existe pra resolver, só que por um caminho diferente.
  ipcMain.on('electron-alert', (event, mensagem) => {
    try {
      dialog.showMessageBoxSync(win, {
        type: 'info',
        title: 'RPG Anime System',
        message: String(mensagem ?? ''),
        buttons: ['OK'],
      });
    } finally {
      event.returnValue = undefined;
      refocarJanela();
    }
  });

  ipcMain.on('electron-confirm', (event, mensagem) => {
    let resultado;
    try {
      resultado = dialog.showMessageBoxSync(win, {
        type: 'question',
        title: 'RPG Anime System',
        message: String(mensagem ?? ''),
        buttons: ['OK', 'Cancelar'],
        defaultId: 0,
        cancelId: 1,
      });
    } finally {
      event.returnValue = resultado === 0;
      refocarJanela();
    }
  });

  // 🔥 Mantido como rede de segurança pra qualquer OUTRO diálogo nativo que não passe pelos
  // handlers acima (ex.: seletor de arquivo do sistema) — não atrapalha, e nesses casos o Windows
  // costuma disparar 'focus' corretamente ao fechar.
  win.on('focus', () => {
    setTimeout(() => win.webContents.focus(), 0);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
