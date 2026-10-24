// ==========================================
// 🌍 GEOMETRIA DO GLOBO DA TERRA 0 (components/mapa/GloboTerra3D.jsx e globoCss.js)
// Silhuetas dos continentes de Runeterra (caixa 200x200) e as contas puras pra desenhá-los: ler o caminho,
// deixar a costa orgânica (deslocamento do ponto médio com sorteio fixo) e descobrir se o navegador tem WebGL.
// ==========================================

export const CONTINENTES_RUNETERRA = [
    'M 12 55 L 18 45 L 30 38 L 42 35 L 55 30 L 70 28 L 85 25 L 100 28 L 115 32 L 125 30 L 135 38 L 142 42 L 140 52 L 132 58 L 122 56 L 115 65 L 105 72 L 95 68 L 82 72 L 68 80 L 52 75 L 40 82 L 25 72 L 15 75 Z',
    'M 45 92 L 58 85 L 75 82 L 95 84 L 110 88 L 118 82 L 128 92 L 138 105 L 132 120 L 142 135 L 135 148 L 125 152 L 115 168 L 105 160 L 92 168 L 75 162 L 62 152 L 48 142 L 38 125 L 42 108 L 40 98 Z',
    'M 152 28 L 162 20 L 175 18 L 182 25 L 185 38 L 178 50 L 182 62 L 172 72 L 160 75 L 150 65 L 148 50 L 145 38 Z'
];

// Ilhas soltas: [centroX, centroY, raioX, raioY] na mesma caixa 200x200.
export const ILHAS_RUNETERRA = [[8, 110, 5, 3], [172, 96, 6, 4], [20, 150, 4, 2.5], [160, 140, 7, 3], [88, 42, 3, 2]];

// "M x y L x y ... Z" -> [[x, y], ...]
export function pontosDoCaminho(caminho) {
    const numeros = String(caminho || '').match(/-?\d+(\.\d+)?/g) || [];
    const pontos = [];
    for (let i = 0; i + 1 < numeros.length; i += 2) pontos.push([Number(numeros[i]), Number(numeros[i + 1])]);
    return pontos;
}

// Sorteador com semente (mesmo resultado a cada abertura, pra o globo ser sempre igual).
export function sorteadorComSemente(semente) {
    let a = semente >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Deixa a costa recortada: cada aresta ganha pontos novos no meio, deslocados de lado ao acaso (cada nível divide
// a aresta de novo com metade da amplitude). O polígono continua fechado e com os vértices originais.
export function costaOrganica(pontos, sorteio, { niveis = 3, amplitude = 0.18 } = {}) {
    let atual = pontos;
    let amp = amplitude;
    for (let n = 0; n < niveis; n++) {
        const proximo = [];
        for (let i = 0; i < atual.length; i++) {
            const [x1, y1] = atual[i];
            const [x2, y2] = atual[(i + 1) % atual.length];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const desvio = (sorteio() - 0.5) * 2 * amp;
            proximo.push([x1, y1], [(x1 + x2) / 2 - dy * desvio, (y1 + y2) / 2 + dx * desvio]);
        }
        atual = proximo;
        amp *= 0.6;
    }
    return atual;
}

let webglCache = null;
// O navegador (ou o app desktop) consegue criar um contexto WebGL? Em teste (jsdom) devolve false.
export function webglDisponivel() {
    if (webglCache !== null) return webglCache;
    try {
        const tela = document.createElement('canvas');
        const gl = tela.getContext('webgl2') || tela.getContext('webgl');
        webglCache = !!gl && typeof gl.getParameter === 'function';
    } catch (e) {
        webglCache = false;
    }
    return webglCache;
}
