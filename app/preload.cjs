const { ipcRenderer } = require('electron');

// 🔥 Substitui window.alert/window.confirm ANTES da página carregar (preload roda primeiro, e
// como contextIsolation está desativado em electron.cjs, esta atribuição em `window` fica visível
// pro código da própria página depois). Cada chamada vira uma mensagem IPC SÍNCRONA pro processo
// principal, que mostra um diálogo nativo do Electron (dialog.showMessageBoxSync) em vez do
// diálogo nativo do Chromium — o do Electron devolve o foco de teclado corretamente ao fechar, o
// do Chromium não (ver o comentário grande em electron.cjs). ipcRenderer.sendSync já bloqueia a
// execução até o processo principal responder, preservando o mesmo comportamento síncrono que
// window.alert()/window.confirm() sempre tiveram — nenhum código que já chama
// `if (!window.confirm(...)) return;` precisa mudar.
window.alert = function (mensagem) {
  ipcRenderer.sendSync('electron-alert', mensagem === undefined ? '' : String(mensagem));
};

window.confirm = function (mensagem) {
  return ipcRenderer.sendSync('electron-confirm', mensagem === undefined ? '' : String(mensagem));
};
