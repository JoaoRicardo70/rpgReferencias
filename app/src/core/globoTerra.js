// ==========================================
// 🌍 GEOMETRIA DO GLOBO DA TERRA 0 (components/mapa/GloboTerra3D.jsx e globoCss.js)
// Silhuetas dos continentes de Runeterra (caixa 200x127) e as contas puras pra desenhá-los: ler o caminho,
// deixar a costa orgânica (deslocamento do ponto médio com sorteio fixo) e descobrir se o navegador tem WebGL.
// ==========================================

// Silhuetas traçadas sobre o mapa de Runeterra (imagem de 1208x768 px) e convertidas pra uma caixa de 200 x 127.
const PX = 200 / 1208;
const emCaixa = (pontos) => pontos.map(([x, y]) => [Number((x * PX).toFixed(1)), Number((y * PX).toFixed(1))]);
const paraCaminho = (pontos) => `M ${emCaixa(pontos).map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

export const LARGURA_MAPA = 200;
export const ALTURA_MAPA = 127;

export const CONTINENTES_RUNETERRA = [
    // Continente do norte (Freljord, Demacia, Noxus, Piltover e Zaun) com a península do leste
    paraCaminho([[10, 150], [45, 120], [85, 100], [135, 95], [175, 85], [215, 70], [255, 60], [295, 35], [325, 10], [385, 5], [445, 0], [468, 35], [502, 80], [542, 112], [556, 152], [592, 215], [627, 230], [662, 235], [702, 262], [747, 300], [777, 330], [783, 375], [771, 402], [745, 395], [716, 356], [682, 343], [642, 333], [602, 331], [566, 346], [541, 381], [516, 401], [496, 413], [479, 391], [466, 361], [431, 339], [396, 336], [361, 356], [331, 351], [291, 346], [241, 351], [191, 336], [156, 316], [141, 298], [147, 275], [125, 252], [80, 240], [35, 235], [8, 215], [0, 185], [0, 165]]),
    // Continente do sul (Shurima, Targon, Ixtal)
    paraCaminho([[342, 520], [350, 490], [372, 462], [410, 445], [440, 432], [465, 445], [490, 455], [520, 448], [545, 452], [575, 465], [615, 462], [650, 450], [675, 440], [700, 425], [730, 422], [765, 440], [790, 455], [812, 470], [800, 500], [790, 540], [805, 575], [800, 605], [765, 615], [730, 605], [712, 630], [735, 665], [750, 690], [725, 715], [700, 725], [690, 700], [668, 660], [640, 650], [600, 665], [560, 670], [520, 690], [490, 730], [465, 745], [445, 715], [440, 680], [410, 640], [380, 610], [355, 585], [332, 575], [340, 545]]),
    // Ionia (arquipélago do nordeste)
    paraCaminho([[735, 140], [750, 105], [790, 70], [830, 50], [870, 55], [895, 45], [925, 60], [950, 100], [930, 140], [960, 170], [975, 200], [945, 215], [940, 250], [915, 290], [905, 262], [915, 230], [895, 205], [865, 190], [835, 200], [805, 185], [770, 190], [740, 170]]),
    paraCaminho([[940, 292], [975, 282], [1000, 292], [995, 322], [960, 328], [945, 310]]),
    // Ilha das Sombras
    paraCaminho([[1005, 545], [1030, 535], [1060, 545], [1082, 570], [1075, 600], [1050, 612], [1020, 610], [1000, 585]])
];

// Ilhas soltas: [centroX, centroY, raioX, raioY] na mesma caixa (200 x 127).
export const ILHAS_RUNETERRA = [[800, 328, 12, 6], [823, 342, 8, 5], [65, 437, 32, 8], [28, 525, 10, 26], [355, 462, 10, 8], [660, 218, 6, 4], [75, 305, 6, 12], [355, 400, 14, 5]]
    .map(([cx, cy, rx, ry]) => [Number((cx * PX).toFixed(1)), Number((cy * PX).toFixed(1)), Number((rx * PX).toFixed(1)), Number((ry * PX).toFixed(1))]);

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
