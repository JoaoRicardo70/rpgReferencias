// ==========================================
// 🖼️ MOLDURA DO MAPA (coluna à direita da tela do Mapa, components/mapa/MapaPanel.jsx)
// Cada pessoa pode esconder a moldura para ver o mapa com mais clareza; a escolha fica neste navegador.
// ==========================================

export const CHAVE_MOLDURA_OCULTA = 'rpgMolduraOculta';

export function lerMolduraOculta(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(CHAVE_MOLDURA_OCULTA) === '1';
    } catch (e) {
        return false;
    }
}

export function gravarMolduraOculta(oculta, storage = globalThis.localStorage) {
    try {
        if (oculta) storage?.setItem(CHAVE_MOLDURA_OCULTA, '1');
        else storage?.removeItem(CHAVE_MOLDURA_OCULTA);
    } catch (e) { /* sem armazenamento: só vale nesta sessão */ }
}
