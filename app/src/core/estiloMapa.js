// ==========================================
// 🗺️ ESTILO DO MAPA DA TERRA 0 (components/mapa/MapaMundi.jsx)
// O mapa de Runeterra existe em dois estilos: o "clássico" (imagem original) e o "realista" (relevo, biomas e mar
// desenhados do zero, com as mesmas regiões nos mesmos lugares). A escolha fica guardada no navegador (e na conta).
// ==========================================

export const CHAVE_ESTILO_MAPA = 'rpg_mapa_terra0_estilo';
export const ESTILO_CLASSICO = 'classico';
export const ESTILO_REALISTA = 'realista';

export function estiloMapaValido(valor) {
    return valor === ESTILO_REALISTA ? ESTILO_REALISTA : ESTILO_CLASSICO;
}

export function lerEstiloMapa(storage) {
    try {
        return estiloMapaValido(storage?.getItem(CHAVE_ESTILO_MAPA));
    } catch (e) {
        return ESTILO_CLASSICO;
    }
}

export function gravarEstiloMapa(storage, estilo) {
    try { storage?.setItem(CHAVE_ESTILO_MAPA, estiloMapaValido(estilo)); } catch (e) { /* sem armazenamento: só vale nesta sessão */ }
}

export function alternarEstiloMapa(estilo) {
    return estilo === ESTILO_REALISTA ? ESTILO_CLASSICO : ESTILO_REALISTA;
}

// Nome da região no mapa -> arquivo do realce (assets/mapa-realista/hover-<slug>.png).
export const SLUG_REALCE_POR_REGIAO = {
    'Freljord': 'freljord',
    'Demacia': 'demacia',
    'Noxus': 'noxus',
    'Piltover e Zaun': 'piltover',
    'Shurima': 'shurima',
    'Targon': 'targon',
    'Ixtal': 'ixtal',
    'Águas de Sentina': 'aguas',
    'Ilha das Sombras': 'ilha',
    'Ionia': 'ionia'
};

// Escolhe o realce de hover de uma região conforme o estilo: o classico usa o gabarito original, o realista o novo.
export function realceDaRegiao(estilo, nomeRegiao, imgClassica, realcesRealistas) {
    if (estilo !== ESTILO_REALISTA) return imgClassica || null;
    const slug = SLUG_REALCE_POR_REGIAO[nomeRegiao];
    return (slug && realcesRealistas?.[slug]) || null;
}
