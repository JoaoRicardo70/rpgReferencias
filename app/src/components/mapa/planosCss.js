// ==========================================
// 🌌 MAPA DOS PLANOS: visual de cada plano, do reino central e do Plano do Caos que envolve tudo (components/mapa/MapaMundi.jsx).
// Desenhado só com CSS/SVG (sem imagens): o Caos é um mar de fogo e brasas que preenche o palco inteiro; as fronteiras
// douradas do Multiverso recortam um reino calmo no meio, onde ficam os demais planos. Mesmo esquema de astrosCss.js/globoCss.js.
// ==========================================
import { svgRuido } from './astrosCss';

const T = {
    ventoBandas: svgRuido({ fx: 0.004, fy: 0.09, oct: 4, seed: 41, rgb: [0.75, 1, 0.8], alfa: [3.4, -1.35] }),
    ventoTempestade: svgRuido({ fx: 0.006, fy: 0.05, oct: 4, seed: 43, rgb: [0, 0.22, 0.08], alfa: [3, -1.3] }),
    ventoFiapos: svgRuido({ fx: 0.012, fy: 0.07, oct: 5, seed: 44, rgb: [1, 1, 1], alfa: [3.4, -1.6] }),
    aguaOndas: svgRuido({ fx: 0.02, fy: 0.03, oct: 5, seed: 51, rgb: [0.7, 0.92, 1], alfa: [3, -1.45] }),
    aguaFundo: svgRuido({ fx: 0.01, fy: 0.02, oct: 4, seed: 53, rgb: [0, 0.04, 0.3], alfa: [2.6, -0.9] }),
    aguaEspuma: svgRuido({ fx: 0.05, fy: 0.07, oct: 4, seed: 54, rgb: [1, 1, 1], alfa: [7, -4] }),
    fogoCrosta: svgRuido({ fx: 0.03, oct: 5, seed: 61, rgb: [0.06, 0, 0], alfa: [3.4, -1.15] }),
    fogoVeias: svgRuido({ fx: 0.025, fy: 0.04, oct: 5, seed: 62, rgb: [1, 0.55, 0.05], alfa: [8, -4.2] }),
    fogoBrilho: svgRuido({ fx: 0.012, oct: 3, seed: 63, rgb: [1, 0.2, 0], alfa: [2, -0.55] }),
    terraRochas: svgRuido({ fx: 0.05, oct: 6, seed: 71, rgb: [0.1, 0.06, 0.02], alfa: [3, -1.1] }),
    terraAreia: svgRuido({ fx: 0.02, fy: 0.03, oct: 5, seed: 72, rgb: [0.9, 0.7, 0.45], alfa: [2.8, -1.15] }),
    terraAltas: svgRuido({ fx: 0.03, oct: 5, seed: 73, rgb: [0.95, 0.9, 0.85], alfa: [8, -4.6] }),
    fadasFloresta: svgRuido({ fx: 0.03, oct: 5, seed: 81, rgb: [0.04, 0.32, 0.08], alfa: [3.2, -1.15] }),
    fadasLuz: svgRuido({ fx: 0.07, oct: 3, seed: 82, rgb: [0.9, 1, 0.5], alfa: [8, -4.6] }),
    eterNebulosa: svgRuido({ fx: 0.01, fy: 0.02, oct: 5, seed: 91, rgb: [0.88, 0.4, 1], alfa: [3.4, -1.2] }),
    eterProfundo: svgRuido({ fx: 0.015, fy: 0.01, oct: 5, seed: 92, rgb: [0.2, 0.05, 0.5], alfa: [3, -0.95] }),
    estrelas: svgRuido({ fx: 0.2, oct: 1, seed: 93, rgb: [1, 1, 1], alfa: [14, -10.4] }),
    terra0Continentes: svgRuido({ fx: 0.012, fy: 0.02, oct: 5, seed: 11, rgb: [0.2, 0.5, 0.22], alfa: [11, -5.2] }),
    terra0Altas: svgRuido({ fx: 0.012, fy: 0.02, oct: 5, seed: 11, rgb: [0.55, 0.45, 0.28], alfa: [16, -8.8] }),
    terra0Nuvens: svgRuido({ fx: 0.008, fy: 0.03, oct: 5, seed: 23, rgb: [1, 1, 1], alfa: [3.4, -1.3] }),
    ordemBrilho: svgRuido({ fx: 0.02, oct: 3, seed: 101, rgb: [1, 0.95, 1], alfa: [2.4, -1.05] }),
    ceusNuvens: svgRuido({ fx: 0.01, fy: 0.035, oct: 5, seed: 111, rgb: [1, 1, 0.96], alfa: [3.4, -1.35] }),
    ceusOuro: svgRuido({ fx: 0.02, oct: 4, seed: 112, rgb: [1, 0.78, 0.2], alfa: [2.6, -0.9] }),
    infernoRocha: svgRuido({ fx: 0.04, oct: 6, seed: 121, rgb: [0.07, 0.02, 0.01], alfa: [3.4, -1.05] }),
    infernoLava: svgRuido({ fx: 0.03, fy: 0.05, oct: 5, seed: 122, rgb: [1, 0.45, 0], alfa: [8, -4.2] }),
    astralOuro: svgRuido({ fx: 0.008, fy: 0.015, oct: 5, seed: 131, rgb: [1, 0.75, 0.3], alfa: [3, -1.4] }),
    astralVioleta: svgRuido({ fx: 0.01, fy: 0.012, oct: 5, seed: 132, rgb: [0.5, 0.3, 1], alfa: [3.2, -1.15] }),
    astralAzul: svgRuido({ fx: 0.014, fy: 0.01, oct: 4, seed: 134, rgb: [0.2, 0.5, 1], alfa: [2.8, -1.1] }),
    fogo: svgRuido({ fx: 0.012, fy: 0.02, oct: 5, seed: 4, rgb: [1, 0.3, 0.04], alfa: [3.4, -1.2] }),
    brasa: svgRuido({ fx: 0.03, fy: 0.05, oct: 4, seed: 12, rgb: [1, 0.78, 0.2], alfa: [3.6, -1.7] }),
    sombra: svgRuido({ fx: 0.02, fy: 0.02, oct: 4, seed: 9, rgb: [0.1, 0, 0.12], alfa: [2.4, -0.8] }),
    rocha: svgRuido({ fx: 0.06, oct: 5, seed: 17, rgb: [0.12, 0.07, 0.03], alfa: [2.6, -1] }),
    nuvem: svgRuido({ fx: 0.01, fy: 0.04, oct: 5, seed: 31, rgb: [1, 1, 1], alfa: [3, -1.45] })
};

// Cidadelas do Mapa dos Planos (desenhadas em SVG, em primeiro plano e sem cobrir nada: cada uma cabe na área livre do reino).
// Céus: cidadela branca e dourada sobre uma ilha flutuante (larga em cima, estreita embaixo, como o espaço livre à esquerda do aro).
// Inferno: fortaleza de obsidiana em degraus descendo uma montanha vulcânica (base larga embaixo, como o espaço livre embaixo à esquerda).
function ameiasEm(x, y, w, passo = 4.4, lado = 2.4) {
    return Array.from({ length: Math.max(1, Math.floor(w / passo)) }, (_, i) => `<rect x='${(x + 0.8 + i * passo).toFixed(1)}' y='${y - 2.4}' width='${lado}' height='2.4'/>`).join('');
}
function arcoJanela(cx, y, w, h) {
    return `<path d='M${cx - w / 2} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}z'/>`;
}
function torreComTelhado(x, w, yTopo, yBase, apice) {
    return `<rect x='${x}' y='${yTopo}' width='${w}' height='${yBase - yTopo}'/><polygon points='${x - 1.6},${yTopo} ${x + w / 2},${apice} ${x + w + 1.6},${yTopo}'/><rect x='${x - 1}' y='${yTopo - 0.4}' width='${w + 2}' height='1.6'/>`;
}
function bandeiraEm(x, y, cor, estroke) {
    return `<path d='M${x} ${y}v-6' stroke='${estroke}' stroke-width='0.5'/><polygon points='${x},${y - 6} ${x + 5.5},${y - 4.4} ${x},${y - 2.8}' fill='${cor}'/>`;
}
function encaixar(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function svgCidadelaCeus() {
    const corpo = 'url(#h)', borda = '#c99a2a', janela = '#ffb81c';
    const torres = [
        [30, 10, 26, 40, 10], [18, 9, 34, 40, 22], [8, 8, 40, 48, 31], [62, 7, 30, 48, 17], [41, 4, 30, 48, 22], [59, 4, 32, 48, 24]
    ].map(([x, w, t, b, a]) => torreComTelhado(x, w, t, b, a)).join('');
    const janelas = [arcoJanela(52, 26, 4, 10), arcoJanela(48, 38, 3, 7), arcoJanela(56, 38, 3, 7), arcoJanela(35, 32, 3, 7), arcoJanela(22, 38, 2.8, 6), arcoJanela(12, 43, 2.4, 5), arcoJanela(65, 36, 2.4, 6), arcoJanela(30, 43, 2.6, 5), arcoJanela(44, 43, 2.6, 5), arcoJanela(60, 43, 2.6, 5), arcoJanela(52, 14, 3, 5)].join('');
    const rocha = "<polygon points='8,48 12,56 20,66 28,76 36,84 40,85 46,84 52,76 56,66 62,58 70,50 70,48' fill='url(#r)' stroke='#8a6a3a' stroke-width='0.6' stroke-linejoin='round'/><path d='M14 54L24 72M26 56L34 80M40 50L40 82M52 52L46 78M64 52L56 70' stroke='#6a4e2a' stroke-width='0.5' fill='none' opacity='0.7'/><g fill='#9fe8ff' filter='url(#b)'><polygon points='38,84 40,85 42,84 40,89'/><polygon points='30,74 32,72 33,76'/><polygon points='50,74 52,72 53,76'/></g>";
    const nuvens = "<g fill='white' opacity='0.97'><ellipse cx='39' cy='49' rx='36' ry='3.6'/><ellipse cx='12' cy='52' rx='9' ry='4'/><ellipse cx='67' cy='52' rx='8' ry='4'/><ellipse cx='26' cy='56' rx='7' ry='3'/><ellipse cx='55' cy='58' rx='7' ry='3'/></g>";
    return encaixar(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 85' preserveAspectRatio='xMidYMid meet'><defs><linearGradient id='h' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ffffff'/><stop offset='0.6' stop-color='#f6ebc8'/><stop offset='1' stop-color='#cdb98a'/></linearGradient><linearGradient id='r' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#cdb98a'/><stop offset='1' stop-color='#5a4630'/></linearGradient><radialGradient id='a' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#fff6c0' stop-opacity='0.85'/><stop offset='1' stop-color='#fff6c0' stop-opacity='0'/></radialGradient><filter id='b'><feGaussianBlur stdDeviation='1.1'/></filter></defs>`
        + `<ellipse cx='42' cy='30' rx='46' ry='32' fill='url(#a)'/>${rocha}`
        + `<g fill='${corpo}' stroke='${borda}' stroke-width='0.5' stroke-linejoin='round'><rect x='8' y='40' width='61' height='8'/>${ameiasEm(8, 40, 61)}${torres}<rect x='44' y='18' width='16' height='30'/><rect x='46' y='10' width='12' height='9'/><polygon points='45,10 52,0.5 59,10'/><rect x='43' y='17' width='18' height='2'/><polygon points='41,36 44,28 44,40'/><polygon points='63,36 60,28 60,40'/></g>`
        + bandeiraEm(52, 0.5, '#ffc83a', borda) + bandeiraEm(35, 10, '#ffc83a', borda) + bandeiraEm(65.5, 17, '#ffc83a', borda)
        + `<g fill='${janela}' filter='url(#b)'>${janelas}</g><g fill='${janela}'>${janelas}<path d='M49.5 48V43a2.5 2.5 0 0 1 5 0V48z' fill='#3a2a00'/></g>`
        + `<circle cx='52' cy='33' r='2.6' fill='none' stroke='${janela}' stroke-width='0.6'/><path d='M49.4 33h5.2M52 30.4v5.2' stroke='${janela}' stroke-width='0.4'/>`
        + nuvens + '</svg>');
}

function svgFortalezaInferno() {
    const borda = '#8a1236', janela = '#ff2244', lava = '#ff3a1c';
    const montanha = "<polygon points='0,73 0,40 4,30 10,18 16,9 22,3 28,9 31,20 37,31 47,42 62,53 86,64 98,70 100,73' fill='url(#m)' stroke='#4a0a1c' stroke-width='0.6' stroke-linejoin='round'/>";
    const degraus = [[8, 26, 28, 12], [2, 40, 54, 12], [0, 54, 80, 10], [0, 64, 94, 9]];
    const muros = degraus.map(([x, y, w, h]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}'/>${ameiasEm(x, y, w)}`).join('');
    const torres = [
        [14, 16, 12, 26, 3], [17, 10, 6, 13, 0.5], [4, 7, 30, 40, 16], [29, 6, 28, 40, 14],
        [0, 8, 36, 52, 26], [22, 8, 34, 52, 22], [38, 7, 42, 54, 33], [12, 9, 48, 64, 38], [46, 8, 56, 64, 48], [2, 9, 58, 73, 50], [66, 8, 58, 70, 52]
    ].map(([x, w, t, b, a]) => torreComTelhado(x, w, t, b, a)).join('');
    const janelas = [arcoJanela(22, 14, 3, 7), arcoJanela(20, 28, 2.6, 6), arcoJanela(10, 32, 2.4, 5), arcoJanela(32, 32, 2.4, 5), arcoJanela(12, 44, 2.6, 5), arcoJanela(30, 44, 2.6, 5), arcoJanela(46, 44, 2.6, 5), arcoJanela(8, 56, 2.6, 5), arcoJanela(26, 56, 2.6, 5), arcoJanela(44, 56, 2.6, 5), arcoJanela(62, 56, 2.6, 5), arcoJanela(14, 66, 2.6, 5), arcoJanela(70, 66, 2.6, 5), arcoJanela(30, 40, 2.4, 4), arcoJanela(8, 45, 2.4, 4)].join('');
    const rio = `<path d='M22 26V33H14V44H34V54H20V64H46V70' stroke='${lava}' stroke-width='2' fill='none' stroke-linejoin='round' opacity='0.95'/><path d='M22 26V33H14V44H34V54H20V64H46V70' stroke='#ffd0a0' stroke-width='0.7' fill='none' stroke-linejoin='round' opacity='0.9'/>`;
    const lago = `<ellipse cx='50' cy='72' rx='50' ry='3' fill='${lava}' opacity='0.9'/><ellipse cx='50' cy='72' rx='34' ry='1.4' fill='#ffd0a0' opacity='0.8'/>`;
    return encaixar(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 73' preserveAspectRatio='xMidYMax meet'><defs><linearGradient id='m' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#3a1226'/><stop offset='1' stop-color='#0a0206'/></linearGradient><linearGradient id='h' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#4a1a34'/><stop offset='0.5' stop-color='#1a0614'/><stop offset='1' stop-color='#07010a'/></linearGradient><radialGradient id='a' cx='0.3' cy='0.4' r='0.7'><stop offset='0' stop-color='#ff2a55' stop-opacity='0.55'/><stop offset='1' stop-color='#ff2a55' stop-opacity='0'/></radialGradient><filter id='b'><feGaussianBlur stdDeviation='1.1'/></filter></defs>`
        + `<ellipse cx='28' cy='30' rx='42' ry='32' fill='url(#a)'/>${montanha}`
        + `<g fill='url(#h)' stroke='${borda}' stroke-width='0.5' stroke-linejoin='round'>${muros}${torres}<rect x='14' y='12' width='16' height='14'/><rect x='17' y='6' width='10' height='7'/><polygon points='15,6 22,0 29,6'/></g>`
        + rio + lago + bandeiraEm(22, 0.4, '#d4143a', borda)
        + `<g fill='${janela}' filter='url(#b)'>${janelas}</g><g fill='${janela}'>${janelas}<path d='M42 73V67a4 4 0 0 1 8 0V73z' fill='#000' opacity='0.9'/></g>`
        + '</svg>');
}
T.casteloLuz = svgCidadelaCeus();
T.casteloTrevas = svgFortalezaInferno();
T.infernoVeias = svgRuido({ fx: 0.03, fy: 0.05, oct: 5, seed: 122, rgb: [1, 0.08, 0.22], alfa: [8, -4.4] });

export const CSS_PLANOS = `
@property --planoAng { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.planos-palco { position: relative; width: min(1000px, 96%, calc(78vh * 5 / 3)); aspect-ratio: 5 / 3; margin-top: 50px; border-radius: 15px; overflow: hidden; container-type: inline-size; box-shadow: 0 0 40px rgba(255, 80, 20, 0.25); }

/* PLANO DO CAOS: tudo que está fora das fronteiras */
.planos-caos { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, #0b0316 0%, #26060f 52%, #4a0d06 100%); }
.planos-caos-camada { position: absolute; inset: 0; mix-blend-mode: screen; pointer-events: none; -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, #000 78%); mask-image: radial-gradient(ellipse at 50% 50%, transparent 30%, #000 78%); }
.planos-caos-fogo { --tile: 420px; background-image: ${T.fogo}; background-size: 420px 420px; opacity: 0.6; animation: planoDeriva 80s linear infinite; }
.planos-caos-brasa { --tile: 260px; background-image: ${T.brasa}; background-size: 260px 260px; opacity: 0.45; animation: planoDeriva 55s linear infinite reverse; }
.planos-caos-sombra { --tile: 480px; background-image: ${T.sombra}; background-size: 480px 480px; mix-blend-mode: multiply; opacity: 0.8; animation: planoDeriva 140s linear infinite; }
.planos-caos-raios { position: absolute; inset: -30%; background: conic-gradient(from var(--planoAng), transparent 0%, rgba(255, 110, 0, 0.35) 8%, transparent 18%, rgba(190, 0, 50, 0.3) 38%, transparent 52%, rgba(255, 150, 20, 0.35) 72%, transparent 86%); mix-blend-mode: screen; pointer-events: none; animation: planoAng 100s linear infinite; -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 38%, #000 80%); mask-image: radial-gradient(ellipse at 50% 50%, transparent 38%, #000 80%); }
.planos-brasa-ponto { position: absolute; bottom: -4%; width: 0.5%; aspect-ratio: 1; border-radius: 50%; background: #ffb347; box-shadow: 0 0 8px 2px rgba(255, 120, 20, 0.9); opacity: 0; pointer-events: none; animation: planoBrasa 9s ease-in infinite; }
@keyframes planoDeriva { to { background-position: var(--tile) var(--tile); } }
@keyframes planoTexDeriva { to { background-position-x: var(--tile, 800px); } }
/* Planos Externos (Astral, Céus, Inferno): camadas do tamanho do palco. Em vez de mover uma camada gigante com transform + blend (que o Chrome acaba rasterizando errado depois de muito tempo), a textura anda por background-position em passos. */
.pz-plano-astral .pl-tex, .pz-ceus .pl-tex, .pz-inferno .pl-tex { --tile: 800px; width: 100%; background-size: 800px 100%; background-repeat: repeat; animation: planoTexDeriva var(--giro, 120s) linear infinite; }
@keyframes planoAng { to { --planoAng: 360deg; } }
@keyframes planoBrasa { 0% { transform: translateY(0) scale(1); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(-520%) translateX(40%) scale(0.3); opacity: 0; } }
.planos-legenda { position: absolute; right: 2.5%; bottom: 2%; max-width: 30%; text-align: right; font-size: clamp(8px, 1.15cqw, 12px); font-style: italic; letter-spacing: 1px; color: rgba(255, 190, 150, 0.8); text-shadow: 0 0 6px #000; pointer-events: none; }
.planos-titulo-canto { position: absolute; left: 2.5%; top: 2.5%; font-size: clamp(9px, 1.5cqw, 15px); letter-spacing: 3px; font-weight: bold; text-transform: uppercase; color: rgba(255, 210, 180, 0.8); text-shadow: 0 0 8px #000; pointer-events: none; }

/* PLANO ASTRAL: a faixa que separa o Caos dos demais planos (zona 'Plano Astral' em zonasCosmologia, por baixo do reino) */
.pz-plano-astral { box-shadow: 0 0 26px 6px rgba(255, 130, 40, 0.5); }
.pz-plano-astral .plano-orbe { background: radial-gradient(ellipse at 50% 50%, #0a0630 0%, #170f52 55%, #2b1a78 100%); box-shadow: inset 0 0 50px 10px rgba(150, 110, 255, 0.55), inset 0 0 8px 2px rgba(255, 210, 120, 0.8); }
.pz-plano-astral .pl-a { --giro: 90s; background-image: ${T.astralVioleta}; mix-blend-mode: screen; opacity: 0.9; }
.pz-plano-astral .pl-b { --giro: 140s; background-image: ${T.astralOuro}; mix-blend-mode: screen; opacity: 0.75; }
.pz-plano-astral .pl-c { --giro: 200s; background-image: ${T.estrelas}, ${T.astralAzul}; background-size: 400px 100%, 800px 100%; mix-blend-mode: screen; }
.pz-plano-astral .pl-borda, .pz-plano-astral .plano-rotulo { display: none; }
.pz-plano-astral::before, .pz-plano-astral::after { position: absolute; top: 50%; writing-mode: vertical-rl; font-size: clamp(8px, 1.3cqw, 14px); font-weight: bold; letter-spacing: 6px; color: rgba(255, 230, 170, 0.95); text-shadow: 0 0 8px #6a3cff, 0 0 4px #000; pointer-events: none; z-index: 2; }
.pz-plano-astral::before { content: "PLANO ASTRAL"; left: 1.4%; transform: translateY(-50%) rotate(180deg); }
.pz-plano-astral::after { content: "PLANO ASTRAL"; right: 1.4%; transform: translateY(-50%); }
.pz-plano-astral.plano-ajuste { background: transparent; }
.planos-palco:has(.plano-ajuste) .planos-reino, .planos-palco:has(.plano-ajuste) .planos-aro-fundo { pointer-events: none; }

/* REINO DENTRO DO ASTRAL: Céus, Inferno, Ordem e o aro dos Planos Internos */
.planos-reino { position: absolute; left: 6%; top: 3.5%; width: 88%; height: 93%; border-radius: 50%; z-index: 2; background: radial-gradient(circle at 54% 52%, rgba(125, 75, 210, 0.34) 0%, transparent 46%), radial-gradient(1.5px 1.5px at 12% 28%, #fff, transparent), radial-gradient(1px 1px at 22% 66%, #fff, transparent), radial-gradient(1.5px 1.5px at 38% 14%, #fff, transparent), radial-gradient(1px 1px at 47% 88%, #fff, transparent), radial-gradient(1.5px 1.5px at 68% 18%, #fff, transparent), radial-gradient(1px 1px at 80% 72%, #fff, transparent), radial-gradient(1.5px 1.5px at 90% 40%, #fff, transparent), radial-gradient(1px 1px at 60% 94%, #fff, transparent), radial-gradient(ellipse at 50% 50%, #1b1240 0%, #0e0a2a 62%, #060418 100%); box-shadow: 0 0 22px 4px rgba(255, 215, 130, 0.5), inset 0 0 40px rgba(255, 200, 90, 0.2); border: 1.5px solid rgba(255, 224, 150, 0.85); }
.planos-aro-fundo { position: absolute; left: 26%; top: 17%; width: 56%; height: 66%; border-radius: 50%; z-index: 3; background: radial-gradient(ellipse at 50% 50%, rgba(95, 60, 175, 0.55) 0%, rgba(22, 14, 58, 0.97) 62%, #0b0728 100%); box-shadow: 0 0 22px 4px rgba(150, 110, 255, 0.35); }
.planos-divisa { position: absolute; left: 6%; width: 88%; top: 50%; height: 2px; z-index: 3; pointer-events: none; background: linear-gradient(90deg, rgba(255, 245, 200, 0.95), rgba(255, 245, 200, 0.55) 40%, rgba(255, 120, 60, 0.55) 60%, rgba(255, 150, 80, 0.95)); box-shadow: 0 0 10px 2px rgba(255, 220, 160, 0.5); }
.planos-anel { position: absolute; left: 26%; top: 17%; width: 56%; height: 66%; pointer-events: none; overflow: visible; z-index: 4; }
.planos-anel ellipse { fill: none; stroke: rgba(255, 215, 130, 0.9); vector-effect: non-scaling-stroke; }
.planos-anel .planos-anel-area { fill: none; stroke: none; }
.planos-anel .planos-anel-runas { stroke-width: 6; stroke: rgba(255, 215, 130, 0.35); stroke-dasharray: 2 5; animation: planoFluxo 30s linear infinite; }
@keyframes planoFluxo { to { stroke-dashoffset: -350; } }
.planos-faixa-rotulo { position: absolute; z-index: 4; transform: translateX(-50%); font-size: clamp(7px, 1.05cqw, 11px); font-weight: bold; letter-spacing: 3px; text-transform: uppercase; white-space: nowrap; pointer-events: none; text-shadow: 0 0 6px #000; }
.planos-faixa-internos { left: 54%; top: 83.6%; color: rgba(255, 224, 150, 0.95); }
.planos-faixa-externos { left: 88%; top: 42%; width: 8%; white-space: normal; text-align: center; line-height: 1.5; letter-spacing: 2px; color: rgba(190, 170, 255, 0.95); }

/* ZONAS CLICÁVEIS (posições vêm de zonasCosmologia em MapaMundi.jsx). Cada plano tem 3 camadas de textura que giram, mais a sombra/atmosfera da esfera. */
.plano-zona { box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.plano-zona > * { pointer-events: none; }
.plano-orbe { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; isolation: isolate; contain: paint; clip-path: ellipse(50% 50% at 50% 50%); }
.plano-zona { filter: drop-shadow(0 0 7px var(--cor, #fff)); transition: filter 0.25s; }
.pz-ceus, .pz-inferno, .pz-plano-astral, .pz-plano-do-caos, .pz-plano-do-caos-inferior { filter: none; }
.pz-terra-0-runeterra { filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 14px rgba(255, 255, 255, 0.75)) drop-shadow(0 0 32px rgba(170, 220, 255, 0.55)); }
.plano-zona.plano-ativo { filter: drop-shadow(0 0 14px var(--cor, #fff)) brightness(1.25) saturate(1.2); }
.plano-zona.plano-ativo.pz-ceus, .plano-zona.plano-ativo.pz-inferno, .plano-zona.plano-ativo.pz-plano-astral { filter: brightness(1.12); }
/* As texturas andam por background-position em passos (nada de camadas compostas gigantes com transform + blend, que o Chrome rasteriza errado depois de muito tempo). --tile = largura do ladrilho em px. */
.pl-tex { --tile: 120px; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-repeat: repeat; background-size: 120px 100%; mix-blend-mode: soft-light; animation: planoTexDeriva var(--giro, 60s) linear infinite; }
.pl-borda { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 30% 26%, rgba(255, 255, 255, 0.34) 0%, transparent 34%), radial-gradient(circle at 50% 50%, transparent 50%, rgba(0, 0, 12, 0.55) 100%), linear-gradient(120deg, transparent 40%, rgba(0, 0, 16, 0.5) 86%); box-shadow: inset 0 0 14px 2px var(--atm, rgba(160, 200, 255, 0.4)); }
.plano-rotulo { position: relative; z-index: 3; text-align: center; white-space: pre-line; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; font-size: clamp(7px, 1.25cqw, 13px); line-height: 1.15; color: #fff; text-shadow: 0 0 5px #000, 0 0 10px #000, 0 1px 2px #000; }
.plano-ajuste { background: rgba(255, 255, 255, 0.2); border: 2px dashed var(--cor, #fff); }

/* Vento: gigante gasoso verde com faixas, tempestade e fiapos de nuvem */
.pz-plano-do-vento .plano-orbe { --atm: rgba(120, 255, 170, 0.5); background: radial-gradient(circle at 40% 36%, #6fe0a0 0%, #1f8a55 50%, #0a3a24 100%); }
.pz-plano-do-vento .pl-a { --giro: 40s; mix-blend-mode: overlay; background-image: radial-gradient(ellipse at 62% 62%, rgba(255, 255, 255, 0.7) 0 5%, rgba(0, 60, 30, 0.7) 7% 12%, transparent 14%), ${T.ventoTempestade}, ${T.ventoBandas}; }
.pz-plano-do-vento .pl-b { --giro: 24s; mix-blend-mode: screen; opacity: 0.6; background-image: ${T.ventoFiapos}; }
.pz-plano-do-vento .pl-c { --giro: 55s; mix-blend-mode: multiply; opacity: 0.6; background-image: ${T.ventoTempestade}; }
/* Água: oceano profundo com ondas, espuma e um redemoinho */
.pz-plano-da-agua .plano-orbe { --atm: rgba(130, 200, 255, 0.55); background: radial-gradient(circle at 40% 36%, #5aa8ff 0%, #1f55c8 52%, #08226a 100%); }
.pz-plano-da-agua .pl-a { --giro: 50s; mix-blend-mode: multiply; background-image: ${T.aguaFundo}; }
.pz-plano-da-agua .pl-b { --giro: 34s; mix-blend-mode: overlay; background-image: radial-gradient(ellipse at 30% 58%, rgba(255, 255, 255, 0.6) 0 4%, rgba(0, 30, 120, 0.6) 6% 12%, transparent 14%), ${T.aguaOndas}; }
.pz-plano-da-agua .pl-c { --giro: 28s; mix-blend-mode: screen; opacity: 0.55; background-image: ${T.aguaEspuma}; }
/* Fogo: crosta escura rachada com veias de lava e brilho interno */
.pz-plano-do-fogo .plano-orbe { --atm: rgba(255, 130, 40, 0.6); background: radial-gradient(circle at 40% 36%, #ff9a40 0%, #d22a0a 48%, #4a0604 100%); }
.pz-plano-do-fogo .pl-a { --giro: 70s; mix-blend-mode: multiply; background-image: ${T.fogoCrosta}; }
.pz-plano-do-fogo .pl-b { mix-blend-mode: screen; background-image: ${T.fogoVeias}; animation: planoTexDeriva 70s linear infinite, planoBrilha 2.8s ease-in-out infinite alternate; }
.pz-plano-do-fogo .pl-c { --giro: 45s; mix-blend-mode: screen; opacity: 0.6; background-image: ${T.fogoBrilho}; }
@keyframes planoBrilha { from { opacity: 0.7; } to { opacity: 1; } }
/* Terra: rocha com crateras, areia e picos claros */
.pz-plano-da-terra .plano-orbe { --atm: rgba(210, 160, 110, 0.4); background: radial-gradient(circle at 36% 32%, #c49a68 0%, #7e5634 48%, #2e1a0c 100%); }
.pz-plano-da-terra .pl-a { --giro: 120s; mix-blend-mode: multiply; background-image: radial-gradient(circle at 24% 34%, rgba(20, 8, 0, 0.7) 0 6%, rgba(255, 220, 170, 0.35) 7% 8%, transparent 9%), radial-gradient(circle at 70% 60%, rgba(20, 8, 0, 0.7) 0 8%, rgba(255, 220, 170, 0.35) 9% 10%, transparent 11%), radial-gradient(circle at 46% 80%, rgba(20, 8, 0, 0.65) 0 5%, transparent 6%), ${T.terraRochas}; }
.pz-plano-da-terra .pl-b { --giro: 120s; mix-blend-mode: soft-light; background-image: ${T.terraAreia}; }
.pz-plano-da-terra .pl-c { --giro: 120s; mix-blend-mode: screen; opacity: 0.55; background-image: ${T.terraAltas}; }
/* Fadas: mundo de floresta com luzes que piscam */
.pz-plano-das-fadas .plano-orbe { --atm: rgba(190, 255, 120, 0.7); background: radial-gradient(circle at 40% 36%, #d8ff9a 0%, #5cc83a 48%, #0f4a14 100%); }
.pz-plano-das-fadas .pl-a { --giro: 70s; mix-blend-mode: multiply; background-image: ${T.fadasFloresta}; }
.pz-plano-das-fadas .pl-b { mix-blend-mode: screen; background-image: ${T.fadasLuz}; animation: planoTexDeriva 70s linear infinite, planoBrilha 1.6s ease-in-out infinite alternate; }
.pz-plano-das-fadas .pl-c { --giro: 36s; mix-blend-mode: screen; opacity: 0.7; background-image: ${T.estrelas}; background-size: 60px 100%; }
/* Éter: nebulosa violeta com estrelas */
.pz-plano-do-eter .plano-orbe { --atm: rgba(210, 130, 255, 0.7); background: radial-gradient(circle at 40% 36%, #e4b8ff 0%, #8a2be2 46%, #1c0646 100%); }
.pz-plano-do-eter .pl-a { --giro: 60s; mix-blend-mode: multiply; background-image: ${T.eterProfundo}; }
.pz-plano-do-eter .pl-b { --giro: 44s; mix-blend-mode: screen; background-image: ${T.eterNebulosa}; }
.pz-plano-do-eter .pl-c { --giro: 80s; mix-blend-mode: screen; background-image: ${T.estrelas}; background-size: 60px 100%; }
/* Terra 0: planeta azul com continentes, nuvens e a coroa branca de eclipse */
.pz-terra-0-runeterra .plano-orbe { --atm: rgba(110, 190, 255, 0.8); background: radial-gradient(circle at 34% 30%, #d4f0ff 0%, #5fb4f4 32%, #1f6fc8 64%, #082a62 100%); }
.pz-terra-0-runeterra .pl-a { --giro: 80s; mix-blend-mode: normal; background-image: ${T.terra0Altas}, ${T.terra0Continentes}; }
.pz-terra-0-runeterra .pl-b { --giro: 50s; mix-blend-mode: normal; opacity: 0.8; background-image: ${T.terra0Nuvens}; }
/* Ordem: cristal facetado com núcleo geométrico */
.pz-plano-da-ordem .plano-orbe { --atm: rgba(200, 180, 255, 0.7); background: conic-gradient(from 20deg, #d9ccff, #7a62c8, #f4eeff, #5a46a6, #c4b4ff, #6a54b8, #e6dcff, #4a3892, #d9ccff); }
.pz-plano-da-ordem .pl-a { --giro: 200s; mix-blend-mode: overlay; background-image: ${T.ordemBrilho}; }
.pz-plano-da-ordem .pl-b { --giro: 90s; mix-blend-mode: soft-light; background-image: repeating-linear-gradient(60deg, rgba(255, 255, 255, 0.5) 0 2px, transparent 2px 22px), repeating-linear-gradient(-60deg, rgba(255, 255, 255, 0.35) 0 2px, transparent 2px 22px); }
.pz-plano-da-ordem .pl-c { animation: planoPulsa 5s ease-in-out infinite; left: 24%; top: 24%; width: 52%; height: 52%; mix-blend-mode: screen; background: linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(170, 140, 255, 0.1)); border: 2px solid rgba(255, 255, 255, 0.85); rotate: 45deg; }
/* Cidadelas em primeiro plano: elementos próprios por cima do aro (z 5), sem receber o mouse, cada uma dentro da área livre do reino */
.planos-castelo { position: absolute; z-index: 5; pointer-events: none; background-repeat: no-repeat; background-position: center bottom; background-size: 100% 100%; }
.planos-castelo-ceus { left: 12%; top: 11%; width: 26%; height: 38%; background-image: ${T.casteloLuz}; filter: drop-shadow(0 0 12px rgba(255, 226, 140, 0.9)); }
.planos-castelo-inferno { left: 17.5%; top: 51.5%; width: 26%; height: 32%; background-image: ${T.casteloTrevas}; filter: drop-shadow(0 0 12px rgba(255, 40, 80, 0.9)); }
/* Céus: toda a metade de cima do reino (fora do aro). Céu dourado com nuvens, raios e o sol no alto */
.pz-ceus { clip-path: inset(0 0 50% 0); }
.pz-ceus .plano-orbe { box-shadow: none; background: linear-gradient(180deg, #fff6c8 0%, #ffd96a 14%, #a9c8ff 32%, #5a7fd8 44%, #2c3a90 50%); }
.pz-ceus .plano-orbe::before { content: ""; position: absolute; top: 1.5%; left: 50%; width: 15%; aspect-ratio: 1; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle, #ffffff 0%, #fff0a0 38%, rgba(255, 220, 110, 0.55) 62%, transparent 72%); box-shadow: 0 0 40px 14px rgba(255, 230, 140, 0.55); }
.pz-ceus .pl-a { --giro: 140s; mix-blend-mode: soft-light; background-image: ${T.ceusOuro}; }
.pz-ceus .pl-b { --giro: 90s; mix-blend-mode: screen; opacity: 0.75; background-image: ${T.ceusNuvens}; }
.pz-ceus .pl-c { left: 0; width: 100%; background: repeating-conic-gradient(from 160deg at 50% -4%, rgba(255, 255, 255, 0.3) 0deg 3deg, transparent 3deg 10deg); mix-blend-mode: overlay; animation: none; }
.pz-ceus .pl-borda, .pz-inferno .pl-borda { display: none; }
.pz-ceus .plano-rotulo, .pz-inferno .plano-rotulo { position: absolute; left: 50%; transform: translateX(-50%); font-size: clamp(10px, 2cqw, 20px); letter-spacing: 6px; }
.pz-ceus .plano-rotulo { top: 9%; color: #3a2a00; text-shadow: 0 0 8px rgba(255, 255, 255, 0.9); }
/* Inferno: toda a metade de baixo do reino. Rocha negra, rios de lava e cordilheira vulcânica */
.pz-inferno { clip-path: inset(50% 0 0 0); }
.pz-inferno .plano-orbe { box-shadow: none; background: radial-gradient(ellipse at 50% 100%, #5a0a22 0%, #2a0616 32%, #10030c 60%, #05010a 100%); }
.pz-inferno .plano-orbe::before { content: ""; position: absolute; left: 0; bottom: 0; width: 100%; height: 26%; clip-path: polygon(0 100%, 0 64%, 7% 50%, 13% 60%, 21% 32%, 29% 54%, 37% 42%, 45% 18%, 51% 38%, 59% 30%, 67% 54%, 75% 38%, 83% 58%, 91% 46%, 100% 62%, 100% 100%); background: linear-gradient(180deg, #ff2a55 0%, #5a0a24 4%, #1a0410 16%, #07010a 60%); }
.pz-inferno .pl-a { --giro: 200s; mix-blend-mode: normal; opacity: 0.9; background-image: ${T.infernoRocha}; }
.pz-inferno .pl-b { mix-blend-mode: screen; opacity: 0.5; background-image: linear-gradient(0deg, rgba(255, 30, 70, 0.5), transparent 45%), ${T.infernoVeias}; animation: planoTexDeriva 200s linear infinite; }
.pz-inferno .pl-c { --giro: 120s; mix-blend-mode: multiply; opacity: 0.7; background-image: ${T.sombra}; }
.pz-inferno .plano-rotulo { bottom: 5%; color: #ffc9d4; text-shadow: 0 0 10px #ff2244, 0 0 4px #000; }
.pz-plano-do-caos .plano-orbe, .pz-plano-do-caos-inferior .plano-orbe { border-radius: 14px; clip-path: none; background: none; box-shadow: none; }
.pz-plano-do-caos .pl-tex, .pz-plano-do-caos .pl-borda, .pz-plano-do-caos-inferior .pl-tex, .pz-plano-do-caos-inferior .pl-borda { display: none; }
.pz-plano-do-caos .plano-rotulo, .pz-plano-do-caos-inferior .plano-rotulo { font-size: clamp(9px, 1.9cqw, 19px); letter-spacing: 3px; background: linear-gradient(180deg, #ffe08a, #ff5a1a); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 0 6px rgba(255, 70, 0, 0.85)) drop-shadow(0 2px 3px #000); }
@keyframes planoFlutua { from { transform: translateY(0); } to { transform: translateY(-6px); } }
@keyframes planoGira { to { transform: rotate(360deg); } }
@keyframes planoPulsa { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
body.reduzir-animacoes .pz-ceus .plano-orbe::after { animation: none; }
@media (prefers-reduced-motion: reduce) { .pz-ceus .plano-orbe::after { animation: none; } }
@media (prefers-reduced-motion: reduce) { .planos-caos-camada, .planos-caos-raios, .planos-brasa-ponto, .planos-anel-runas, .plano-orbe, .pl-tex, .plano-zona .pl-tex, .plano-zona .pl-c, .plano-zona .plano-orbe { animation: none !important; } }
body.reduzir-animacoes .planos-caos-camada, body.reduzir-animacoes .planos-caos-raios, body.reduzir-animacoes .planos-brasa-ponto, body.reduzir-animacoes .planos-anel-runas, body.reduzir-animacoes .plano-orbe, body.reduzir-animacoes .pl-tex, body.reduzir-animacoes .plano-zona .pl-c { animation: none !important; }
`;
