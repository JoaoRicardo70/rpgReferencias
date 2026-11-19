import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Teste estatico: electron.cjs/preload.cjs nao rodam sem Electron, entao lemos o fonte.
const raiz = path.resolve(__dirname, '../..');
const electron = fs.readFileSync(path.join(raiz, 'electron.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(raiz, 'preload.cjs'), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codigo = semComentarios(electron);

describe('electron.cjs: webPreferences', () => {
    it('isolamento ligado e Node desligado', () => {
        expect(codigo).toMatch(/nodeIntegration:\s*false/);
        expect(codigo).toMatch(/contextIsolation:\s*true/);
        expect(codigo).toMatch(/sandbox:\s*true/);
        expect(codigo).toMatch(/webSecurity:\s*true/);
        expect(codigo).toMatch(/webviewTag:\s*false/);
        expect(codigo).toMatch(/allowRunningInsecureContent:\s*false/);
    });
    it('nada de nodeIntegration: true, contextIsolation: false, enableRemoteModule ou webSecurity: false', () => {
        expect(codigo).not.toMatch(/nodeIntegration:\s*true/);
        expect(codigo).not.toMatch(/contextIsolation:\s*false/);
        expect(codigo).not.toMatch(/enableRemoteModule/);
        expect(codigo).not.toMatch(/sandbox:\s*false/);
        expect(codigo).not.toMatch(/webSecurity:\s*false/);
    });
    it('bloqueia janelas novas, navegacao externa e webview', () => {
        expect(codigo).toMatch(/setWindowOpenHandler/);
        expect(codigo).toMatch(/action:\s*'deny'/);
        expect(codigo).toMatch(/will-navigate/);
        expect(codigo).toMatch(/will-attach-webview/);
    });
    it('IPC de alert/confirm valida a origem do remetente', () => {
        expect(codigo).toMatch(/electron-alert[\s\S]{0,200}origemDoApp/);
        expect(codigo).toMatch(/electron-confirm[\s\S]{0,200}origemDoApp/);
    });
});

describe('electron.cjs: decisao de permissoes e URLs (funcoes extraidas do fonte)', () => {
    function carregar({ empacotado = true } = {}) {
        const pega = (nome) => {
            const i = codigo.indexOf(`function ${nome}(`);
            let d = 0, j = codigo.indexOf('{', i);
            const ini = j;
            for (; j < codigo.length; j++) { if (codigo[j] === '{') d++; if (codigo[j] === '}' && --d === 0) break; }
            return codigo.slice(i, j + 1);
        };
        const ini = codigo.indexOf("const URL_DO_APP");
        const fim = codigo.indexOf('function endurecerSessao');
        const trecho = codigo.slice(ini, fim);
        const abertos = [];
        const ctx = { URL, app: { isPackaged: empacotado }, shell: { openExternal: (u) => abertos.push(u) }, abertos };
        vm.createContext(ctx);
        vm.runInContext(`${trecho}\nthis.origemDoApp = origemDoApp; this.abrirExternoSeguro = abrirExternoSeguro; this.permissaoPermitida = permissaoPermitida;`, ctx);
        void pega;
        return ctx;
    }
    const APP = 'https://rpg-referencias.web.app/x';

    it('origemDoApp: so a origem oficial (empacotado); localhost so em dev', () => {
        const e = carregar();
        expect(e.origemDoApp(APP)).toBe(true);
        expect(e.origemDoApp('https://rpg-referencias.web.app.evil.com/')).toBe(false);
        expect(e.origemDoApp('http://rpg-referencias.web.app/')).toBe(false);
        expect(e.origemDoApp('http://localhost:5173/')).toBe(false);
        expect(e.origemDoApp('lixo')).toBe(false);
        expect(e.origemDoApp(undefined)).toBe(false);
        expect(carregar({ empacotado: false }).origemDoApp('http://localhost:5173/')).toBe(true);
    });
    it('abrirExternoSeguro: so https sem credenciais', () => {
        const e = carregar();
        ['file:///c:/x', 'javascript:alert(1)', 'data:text/html,x', 'smb://h/s', 'http://x.com', 'https://u:p@x.com', 'nao e url', ''].forEach((u) => e.abrirExternoSeguro(u));
        expect(e.abertos).toEqual([]);
        e.abrirExternoSeguro('https://exemplo.com/a?b=1');
        expect(e.abertos).toEqual(['https://exemplo.com/a?b=1']);
    });
    it('permissaoPermitida: microfone sim; camera/geolocalizacao/notificacoes nao; origem estranha nao', () => {
        const e = carregar();
        expect(e.permissaoPermitida('media', APP, { mediaTypes: ['audio'] })).toBe(true);
        expect(e.permissaoPermitida('media', APP, undefined)).toBe(true);
        expect(e.permissaoPermitida('media', APP, { mediaTypes: ['audio', 'video'] })).toBe(false);
        expect(e.permissaoPermitida('media', APP, { mediaType: 'video' })).toBe(false);
        ['geolocation', 'notifications', 'midi', 'openExternal', 'clipboard-read'].forEach((p) => expect(e.permissaoPermitida(p, APP, {})).toBe(false));
        expect(e.permissaoPermitida('media', 'https://evil.com/', { mediaTypes: ['audio'] })).toBe(false);
        expect(e.permissaoPermitida('display-capture', APP, {})).toBe(true);
        expect(e.permissaoPermitida('clipboard-sanitized-write', APP, {})).toBe(true);
    });
    it('fullscreen: app e YouTube sim; outros nao', () => {
        const e = carregar();
        expect(e.permissaoPermitida('fullscreen', 'https://www.youtube.com/embed/x', {})).toBe(true);
        expect(e.permissaoPermitida('fullscreen', 'https://www.youtube-nocookie.com/embed/x', {})).toBe(true);
        expect(e.permissaoPermitida('fullscreen', APP, {})).toBe(true);
        expect(e.permissaoPermitida('fullscreen', 'https://evil.com/', {})).toBe(false);
        expect(e.permissaoPermitida('display-capture', 'https://www.youtube.com/', {})).toBe(false);
    });
});

describe('preload.cjs', () => {
    it('usa contextBridge e nao expoe ipcRenderer cru', () => {
        const c = semComentarios(preload);
        expect(c).toMatch(/contextBridge\.exposeInMainWorld/);
        expect(c).not.toMatch(/exposeInMainWorld\([^,]+,\s*ipcRenderer\b/);
        expect(c).not.toMatch(/window\.ipcRenderer|require\('fs'\)|child_process/);
    });
});
