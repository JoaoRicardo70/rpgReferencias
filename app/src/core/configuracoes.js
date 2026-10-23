// ==========================================
// ⚙️ CONFIGURAÇÕES DO APARELHO — lógica pura. Volumes, tamanho da interface e animações. Tudo fica só neste navegador
// (cada jogador ajusta o seu, sem mudar a tela dos outros). Estilo visual, navegação, cores do dado e teclas de atalho
// têm os próprios módulos (temasApp, modoNavegacao, coresDado, atalhos).
// ==========================================

export const CHAVE_CONFIG = 'rpg_config';
export const CHAVE_VOLUME_MUSICA = 'rpg_volume_musica';

export const PADROES_CONFIG = {
    volumeVozes: 100,     // % aplicado por cima do volume individual de cada jogador (0-100)
    volumeSexta: 100,     // % da voz da Sexta-Feira (0-100)
    tamanhoInterface: 100, // % de zoom do app (80-130)
    reduzirAnimacoes: false
};

export const LIMITES_CONFIG = {
    volumeVozes: [0, 100],
    volumeSexta: [0, 100],
    tamanhoInterface: [80, 130]
};

const ouvintes = new Set();

const limitar = (n, [min, max]) => Math.min(max, Math.max(min, n));

function normalizar(bruto, base = PADROES_CONFIG) {
    const saida = { ...base };
    if (!bruto || typeof bruto !== 'object') return saida;
    Object.keys(LIMITES_CONFIG).forEach(k => {
        const n = Number(bruto[k]);
        if (bruto[k] !== undefined && bruto[k] !== null && bruto[k] !== '' && Number.isFinite(n)) saida[k] = limitar(Math.round(n), LIMITES_CONFIG[k]);
    });
    if (typeof bruto.reduzirAnimacoes === 'boolean') saida.reduzirAnimacoes = bruto.reduzirAnimacoes;
    return saida;
}

export function lerConfig(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        return normalizar(s ? JSON.parse(s.getItem(CHAVE_CONFIG) || '{}') : {});
    } catch (e) { return { ...PADROES_CONFIG }; }
}

// Muda um ou mais campos, grava e avisa quem escuta. Devolve a configuração nova.
export function salvarConfig(parcial, storage) {
    // Valor ruim em `parcial` não apaga o que já estava salvo: cai no valor atual (não no padrão).
    const nova = normalizar(parcial, lerConfig(storage));
    try { (storage || localStorage).setItem(CHAVE_CONFIG, JSON.stringify(nova)); } catch (e) { /* sem storage: vale só nesta sessão */ }
    ouvintes.forEach(fn => fn(nova));
    return nova;
}

export function restaurarConfig(storage) {
    try { (storage || localStorage).removeItem(CHAVE_CONFIG); } catch (e) { /* sem storage */ }
    const padrao = { ...PADROES_CONFIG };
    ouvintes.forEach(fn => fn(padrao));
    return padrao;
}

export function assinarConfig(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

// Fração 0-1 pra multiplicar volumes.
export const fracaoVolumeVozes = (config) => (config || lerConfig()).volumeVozes / 100;
export const fracaoVolumeSexta = (config) => (config || lerConfig()).volumeSexta / 100;

// ----- Volume da música (Jukebox): mesma chave de sempre, agora com aviso pra tela de Configurações e o player ficarem juntos -----
const ouvintesMusica = new Set();

export function lerVolumeMusica(storage) {
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const salvo = parseInt(s ? s.getItem(CHAVE_VOLUME_MUSICA) : null, 10);
        if (Number.isFinite(salvo)) return Math.min(100, Math.max(0, salvo));
    } catch (e) { /* sem localStorage */ }
    return 60;
}

export function salvarVolumeMusica(valor, storage) {
    const v = Math.min(100, Math.max(0, Math.round(Number(valor)) || 0));
    try { (storage || localStorage).setItem(CHAVE_VOLUME_MUSICA, String(v)); } catch (e) { /* sem localStorage */ }
    ouvintesMusica.forEach(fn => fn(v));
    return v;
}

export function assinarVolumeMusica(fn) {
    ouvintesMusica.add(fn);
    return () => ouvintesMusica.delete(fn);
}

// ----- Efeitos visuais: zoom da interface e animações reduzidas -----
export function aplicarConfigVisual(config, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.documentElement) return;
    const c = config || lerConfig();
    // `zoom` escala a página inteira (fontes, caixas, imagens) sem refazer o layout.
    d.documentElement.style.zoom = c.tamanhoInterface === 100 ? '' : String(c.tamanhoInterface / 100);
    if (d.body) d.body.classList.toggle('reduzir-animacoes', !!c.reduzirAnimacoes);
}
