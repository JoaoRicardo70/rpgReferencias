const { contextBridge, ipcRenderer, webFrame } = require('electron');

// 🔒 O renderer roda com contextIsolation e sandbox (ver electron.cjs): a página não enxerga Node nem o
// ipcRenderer. Aqui expomos SÓ duas funções (alert/confirm nativos do Electron) e, no mundo da página,
// substituímos window.alert/window.confirm por elas.
//
// Por que isto existe: alert()/confirm() do Chromium roubam o foco de teclado da janela no Windows e não o
// devolvem (nenhum campo aceita clique/digitação até um alt-tab). O diálogo nativo do Electron
// (dialog.showMessageBoxSync, no processo principal) devolve o foco corretamente. ipcRenderer.sendSync
// bloqueia até a resposta, preservando o comportamento síncrono: `if (!window.confirm(...)) return;` segue igual.
contextBridge.exposeInMainWorld('__rpgNativo', {
  alert: (mensagem) => {
    ipcRenderer.sendSync('electron-alert', mensagem === undefined ? '' : String(mensagem));
  },
  confirm: (mensagem) => ipcRenderer.sendSync('electron-confirm', mensagem === undefined ? '' : String(mensagem)),
});

// Com contextIsolation, atribuir window.alert aqui só mudaria o mundo isolado; então o override entra no
// mundo da página via webFrame (executa antes dos scripts do site).
webFrame.executeJavaScript(`
  (function () {
    var n = window.__rpgNativo;
    if (!n) return;
    window.alert = function (m) { n.alert(m === undefined ? '' : String(m)); };
    window.confirm = function (m) { return !!n.confirm(m === undefined ? '' : String(m)); };
  })();
`);
