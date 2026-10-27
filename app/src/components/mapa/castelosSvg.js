// ==========================================
// 🏰 CASTELOS DO MAPA DOS PLANOS — ilustrações em SVG com acabamento mais realista: pedra com relevo e iluminação (feTurbulence +
// feDiffuseLighting), blocos e telhas, torres cilíndricas com luz de um lado só, rocha irregular, névoa e brilho nas janelas.
// Céus: cidadela de pedra clara e telhados dourados numa ilha flutuante (luz vindo do alto, à esquerda).
// Inferno: fortaleza gótica de obsidiana numa montanha vulcânica (luz vermelha vinda da lava, embaixo).
// Cada desenho cabe na área livre do reino (ver as caixas em planosCss.js); o viewBox tem a mesma proporção da caixa.
// ==========================================

const n1 = (v) => Math.round(v * 10) / 10;
export function encaixarSvg(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Janela em arco (lanceta). `luz` é o preenchimento (gradiente de luz acesa).
function arco(cx, y, w, h) {
    return `M${n1(cx - w / 2)} ${n1(y + h)}V${n1(y + w / 2)}a${n1(w / 2)} ${n1(w / 2)} 0 0 1 ${n1(w)} 0V${n1(y + h)}z`;
}
function janelas(lista, luz, moldura) {
    const forma = lista.map(([cx, y, w, h]) => arco(cx, y, w, h)).join('');
    const travessas = lista.map(([cx, y, w, h]) => `M${n1(cx)} ${n1(y + w / 2)}V${n1(y + h)}M${n1(cx - w / 2)} ${n1(y + h * 0.62)}H${n1(cx + w / 2)}`).join('');
    return `<path d='${forma}' fill='#ffcf60' opacity='0.55' filter='url(#brilho)'/>`
        + `<path d='${forma}' fill='${luz}' stroke='${moldura}' stroke-width='0.5'/>`
        + `<path d='${travessas}' stroke='${moldura}' stroke-width='0.35' fill='none'/>`;
}
// Ameias (merlões) e mata-cães (cachorros sob o parapeito).
function ameias(x, y, w, fill, passo = 6, lado = 3.4, alto = 3.6) {
    const n = Math.max(1, Math.floor(w / passo));
    return Array.from({ length: n }, (_, i) => `<rect x='${n1(x + 0.8 + i * passo)}' y='${n1(y - alto)}' width='${lado}' height='${alto}' fill='${fill}'/>`).join('');
}
function cachorros(x, y, w, fill) {
    const n = Math.max(1, Math.floor(w / 4));
    return Array.from({ length: n }, (_, i) => `<path d='M${n1(x + 0.6 + i * 4)} ${y}h2.4v2.2l-1.2 1.4l-1.2-1.4z' fill='${fill}'/>`).join('');
}
// Bandeira ondulada presa a um mastro que sobe de (x, y).
function bandeira(x, y, cor, sombra) {
    return `<path d='M${x} ${y}v-10' stroke='#2a2018' stroke-width='0.5'/>`
        + `<path d='M${x} ${y - 10}q4 -1.8 8 0t8 0v5q-4 1.8 -8 0t-8 0z' fill='${cor}' stroke='${sombra}' stroke-width='0.3'/>`
        + `<path d='M${x} ${y - 7.5}q4 -1.8 8 0t8 0' stroke='${sombra}' stroke-width='0.25' fill='none' opacity='0.7'/>`;
}

// ------------------------------------------
// CÉUS
// ------------------------------------------
function torreCeus({ x, w, top, base = 100, apex }) {
    const cx = x + w / 2;
    const fustes = Math.max(1, Math.floor((base - top - 10) / 17));
    const wins = Array.from({ length: fustes }, (_, i) => [cx, top + 6 + i * 17, Math.min(3.6, w * 0.28), 8]);
    const corpo = `<rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='url(#cil)'/><rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='url(#blk)'/>`
        + `<rect x='${x}' y='${top}' width='${w}' height='5' fill='url(#sombraTopo)'/>`
        + `<rect x='${x - 1.2}' y='${top - 1.4}' width='${w + 2.4}' height='2.6' fill='url(#cil)' stroke='#8a7040' stroke-width='0.3'/>`;
    const telhado = `<path d='M${x - 2.4} ${top - 0.4}Q${n1(x + w * 0.3)} ${n1((top + apex) / 2 + 3)} ${n1(cx)} ${apex}Q${n1(x + w * 0.7)} ${n1((top + apex) / 2 + 3)} ${x + w + 2.4} ${top - 0.4}Z' fill='url(#tel)' stroke='#7a5210' stroke-width='0.35'/>`
        + `<path d='M${x - 2.4} ${top - 0.4}Q${n1(x + w * 0.3)} ${n1((top + apex) / 2 + 3)} ${n1(cx)} ${apex}Q${n1(x + w * 0.7)} ${n1((top + apex) / 2 + 3)} ${x + w + 2.4} ${top - 0.4}Z' fill='url(#tlh)'/>`
        + `<circle cx='${n1(cx)}' cy='${apex - 0.6}' r='1' fill='#ffe58a' stroke='#8a6a1a' stroke-width='0.25'/>`;
    return { corpo, telhado, wins };
}

export function svgCidadelaCeus() {
    const defs = `<defs>
<linearGradient id='cil' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fffdf5'/><stop offset='0.32' stop-color='#f4e9ca'/><stop offset='0.72' stop-color='#cdb98a'/><stop offset='1' stop-color='#86724c'/></linearGradient>
<linearGradient id='tel' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff2b8'/><stop offset='0.45' stop-color='#e3ad2e'/><stop offset='1' stop-color='#6e4a0e'/></linearGradient>
<linearGradient id='ros' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#d8c7a2'/><stop offset='0.45' stop-color='#9c845e'/><stop offset='1' stop-color='#43352a'/></linearGradient>
<linearGradient id='luz' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff6c0'/><stop offset='0.55' stop-color='#ffbf2a'/><stop offset='1' stop-color='#c97c04'/></linearGradient>
<linearGradient id='sombraTopo' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a2a10' stop-opacity='0.45'/><stop offset='1' stop-color='#3a2a10' stop-opacity='0'/></linearGradient>
<linearGradient id='agua' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff' stop-opacity='0.95'/><stop offset='1' stop-color='#bfe6ff' stop-opacity='0.15'/></linearGradient>
<linearGradient id='relva' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9ccf5a'/><stop offset='1' stop-color='#3f7a2a'/></linearGradient>
<radialGradient id='aura' cx='0.5' cy='0.5' r='0.5'><stop offset='0' stop-color='#fff3b8' stop-opacity='0.9'/><stop offset='1' stop-color='#fff3b8' stop-opacity='0'/></radialGradient>
<pattern id='blk' width='7' height='4.4' patternUnits='userSpaceOnUse'><path d='M0 0.2H7M0 2.4H7M3.5 0.2V2.4M0 2.4V4.4M7 2.4V4.4' stroke='#6a5632' stroke-opacity='0.32' stroke-width='0.25' fill='none'/></pattern>
<pattern id='tlh' width='3.2' height='2.6' patternUnits='userSpaceOnUse'><path d='M0 2.6A1.6 1.6 0 0 0 3.2 2.6M-1.6 1.3A1.6 1.6 0 0 0 1.6 1.3M1.6 1.3A1.6 1.6 0 0 0 4.8 1.3' stroke='#5a3a08' stroke-opacity='0.5' stroke-width='0.28' fill='none'/></pattern>
<filter id='brilho' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='1.1'/></filter>
<filter id='neblina' x='-30%' y='-60%' width='160%' height='220%'><feGaussianBlur stdDeviation='2.6'/></filter>
<filter id='pedra' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='7' result='n'/><feDiffuseLighting in='n' surfaceScale='1.3' diffuseConstant='1.15' lighting-color='#ffffff' result='l'><feDistantLight azimuth='235' elevation='60'/></feDiffuseLighting><feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.2' k2='0' k3='0' k4='0' result='t'/><feComposite in='t' in2='SourceAlpha' operator='in'/></filter>
<filter id='rocha' x='-6%' y='-4%' width='112%' height='112%'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='4' seed='11' result='d'/><feDisplacementMap in='SourceGraphic' in2='d' scale='9' xChannelSelector='R' yChannelSelector='G' result='r'/><feTurbulence type='fractalNoise' baseFrequency='0.3' numOctaves='3' seed='3' result='n'/><feDiffuseLighting in='n' surfaceScale='2.4' diffuseConstant='1.2' lighting-color='#ffffff' result='l'><feDistantLight azimuth='230' elevation='48'/></feDiffuseLighting><feComposite in='r' in2='l' operator='arithmetic' k1='1.25' k2='0' k3='0' k4='0' result='t'/><feComposite in='t' in2='r' operator='in'/></filter>
<filter id='nuvem' x='-20%' y='-60%' width='140%' height='220%'><feTurbulence type='fractalNoise' baseFrequency='0.06' numOctaves='3' seed='5' result='d'/><feDisplacementMap in='SourceGraphic' in2='d' scale='7' xChannelSelector='R' yChannelSelector='G'/><feGaussianBlur stdDeviation='0.9'/></filter>
</defs>`;

    // Torres ao fundo (névoa), depois as de trás, o portão, o torreão principal e as da frente.
    const nevoa = [[84, 10, 34, 18], [160, 10, 40, 24], [34, 9, 52, 38]]
        .map(([x, w, t, a]) => `<path d='M${x - 1.5} ${t}L${n1(x + w / 2)} ${a}L${x + w + 1.5} ${t}V100H${x - 1.5}z' fill='#eef2fb' opacity='0.5'/>`).join('');
    const traseiras = [{ x: 30, w: 14, top: 62, apex: 42 }, { x: 50, w: 16, top: 54, apex: 32 }, { x: 96, w: 14, top: 44, apex: 26 }, { x: 150, w: 14, top: 52, apex: 32 }].map(torreCeus);
    const frente = [{ x: 62, w: 10, top: 60, apex: 46 }, { x: 82, w: 10, top: 60, apex: 46 }, { x: 24, w: 12, top: 74, apex: 60 }, { x: 166, w: 12, top: 74, apex: 60 }, { x: 111, w: 7, top: 30, base: 58, apex: 20 }, { x: 138, w: 7, top: 30, base: 58, apex: 20 }].map(torreCeus);
    const topo = torreCeus({ x: 121, w: 14, top: 24, base: 40, apex: 10 });
    const muralha = `<rect x='24' y='84' width='154' height='16' fill='url(#cil)'/><rect x='24' y='84' width='154' height='16' fill='url(#blk)'/>${cachorros(24, 84, 154, '#a8946a')}`
        + ameias(24, 84, 154, 'url(#cil)', 6) + `<rect x='24' y='84' width='154' height='1.4' fill='#8a7040' opacity='0.6'/>`;
    const portao = `<rect x='64' y='66' width='26' height='34' fill='url(#cil)'/><rect x='64' y='66' width='26' height='34' fill='url(#blk)'/>${ameias(64, 66, 26, 'url(#cil)', 5.2)}`;
    const torreao = `<rect x='108' y='58' width='40' height='42' fill='url(#cil)'/><rect x='108' y='58' width='40' height='42' fill='url(#blk)'/>${ameias(108, 58, 40, 'url(#cil)', 5.6)}`
        + `<rect x='114' y='40' width='28' height='20' fill='url(#cil)'/><rect x='114' y='40' width='28' height='20' fill='url(#blk)'/>${ameias(114, 40, 28, 'url(#cil)', 5.6)}`
        + `<polygon points='106,100 108,76 108,100' fill='#a8946a'/><polygon points='150,100 148,76 148,100' fill='#86724c'/>`;
    const rosa = `<circle cx='128' cy='49' r='4.6' fill='url(#luz)' stroke='#7a5a1a' stroke-width='0.6'/><path d='M128 44.4V53.6M123.4 49H132.6M124.8 45.8L131.2 52.2M131.2 45.8L124.8 52.2' stroke='#7a5a1a' stroke-width='0.4'/>`;
    const todasJanelas = [...traseiras, ...frente, topo].flatMap(t => t.wins);
    const jan = janelas([...todasJanelas, [118, 64, 4, 10], [128, 64, 4, 10], [138, 64, 4, 10], [128, 26, 3, 7], [128, 86, 3.4, 8]], 'url(#luz)', '#7a5a1a')
        + janelas([[77, 76, 3.2, 7], [44, 90, 2.8, 6], [160, 90, 2.8, 6], [96, 90, 2.8, 6]], 'url(#luz)', '#7a5a1a');
    const arcoPortao = `<path d='M71 100V91a6 6 0 0 1 12 0V100z' fill='#2a1a06'/><path d='M71 100V91a6 6 0 0 1 12 0V100z' fill='url(#luz)' opacity='0.5'/><path d='M73 100V92M77 100V90M81 100V92M71 95H83' stroke='#6a4a10' stroke-width='0.4'/>`;
    const bandeiras = bandeira(128, 10, '#ffc83a', '#8a5a0a') + bandeira(114, 20, '#ffffff', '#b89a4a') + bandeira(141, 20, '#ffffff', '#b89a4a') + bandeira(58, 32, '#ffc83a', '#8a5a0a') + bandeira(103, 26, '#ffc83a', '#8a5a0a');

    // Ilha flutuante: rocha irregular com estratos, relva na borda, cachoeira e névoa.
    const ilha = `<g transform='translate(100 99) scale(0.76 0.92) translate(-100 -99)'><g filter='url(#rocha)'><path d='M8 99C12 110 24 121 38 130C52 139 66 147 82 151C90 153 98 152 104 147C118 140 134 131 148 120C162 111 178 106 192 99Z' fill='url(#ros)'/></g>`
        + `<path d='M16 108C40 114 70 112 100 118C130 114 160 112 186 106M28 120C56 124 84 122 112 130M54 136C76 140 96 138 112 142' stroke='#3a2c1c' stroke-opacity='0.45' stroke-width='0.8' fill='none'/>`
        + `<path d='M8 99C40 96 80 98 100 97C130 98 160 96 192 99L192 103C160 107 130 104 100 106C70 105 40 108 8 103Z' fill='url(#relva)'/>`
        + `<path d='M38 126C37 134 35 142 36 150' stroke='url(#agua)' stroke-width='3.2' fill='none' stroke-linecap='round'/><path d='M43 128C43 136 42 144 43 150' stroke='url(#agua)' stroke-width='1.6' fill='none' stroke-linecap='round'/>`
        + `<ellipse cx='39' cy='150' rx='10' ry='2.4' fill='#ffffff' opacity='0.55' filter='url(#neblina)'/>`
        + `<g fill='#9fe8ff' filter='url(#brilho)'><polygon points='96,147 100,151 104,147 100,155'/><polygon points='70,138 73,135 75,141'/><polygon points='128,133 131,130 133,136'/></g></g>`;
    const nuvens = `<g transform='translate(100 99) scale(0.76 1) translate(-100 -99)'><g fill='#ffffff' opacity='0.96' filter='url(#nuvem)'><ellipse cx='100' cy='103' rx='96' ry='5'/><ellipse cx='26' cy='107' rx='20' ry='6'/><ellipse cx='176' cy='107' rx='20' ry='6'/><ellipse cx='62' cy='112' rx='15' ry='4.4'/><ellipse cx='144' cy='113' rx='15' ry='4.4'/></g></g>`;

    return encaixarSvg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='20 0 160 150' preserveAspectRatio='xMidYMid meet'>${defs}`
        + `<ellipse cx='104' cy='60' rx='80' ry='58' fill='url(#aura)'/>`
        + nevoa + ilha
        + `<g filter='url(#pedra)'>${traseiras.map(t => t.corpo).join('')}${muralha}${portao}${torreao}${frente.map(t => t.corpo).join('')}${topo.corpo}</g>`
        + `${[...traseiras, ...frente, topo].map(t => t.telhado).join('')}`
        + arcoPortao + rosa + jan + bandeiras + nuvens + '</svg>');
}

// ------------------------------------------
// INFERNO
// ------------------------------------------
function agulhaInferno({ x, w, top, base, apex }) {
    const cx = x + w / 2;
    const wins = [];
    for (let y = top + 5; y < base - 12; y += 15) wins.push([cx, y, Math.min(3.4, w * 0.3), 8]);
    const corpo = `<rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='url(#cilI)'/><rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='url(#blkI)'/>`
        + `<rect x='${x}' y='${top}' width='${w}' height='${base - top}' fill='url(#brasaV)'/>`
        + `<rect x='${x - 1.2}' y='${top - 1.2}' width='${w + 2.4}' height='2.4' fill='url(#cilI)' stroke='#d0245a' stroke-width='0.3' stroke-opacity='0.7'/>`;
    const lado = `M${x - 1.8} ${top - 0.2}Q${n1(x + w * 0.38)} ${n1(top - (top - apex) * 0.35)} ${n1(cx)} ${apex}Q${n1(x + w * 0.62)} ${n1(top - (top - apex) * 0.35)} ${x + w + 1.8} ${top - 0.2}Z`;
    const telhado = `<path d='${lado}' fill='url(#telI)' stroke='#e0306a' stroke-width='0.45' stroke-opacity='0.85'/><path d='${lado}' fill='url(#tlhI)'/>`
        + `<path d='M${n1(cx)} ${apex}L${n1(cx)} ${apex - 3.4}' stroke='#d0245a' stroke-width='0.45'/>`;
    return { corpo, telhado, wins };
}

export function svgFortalezaInferno() {
    const defs = `<defs>
<linearGradient id='cilI' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#b2688e'/><stop offset='0.3' stop-color='#64294c'/><stop offset='0.7' stop-color='#1e0a1a'/><stop offset='1' stop-color='#0b0310'/></linearGradient>
<linearGradient id='telI' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#6a2a50'/><stop offset='0.5' stop-color='#240c20'/><stop offset='1' stop-color='#08020c'/></linearGradient>
<linearGradient id='rocI' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6a2848'/><stop offset='0.5' stop-color='#2a0e24'/><stop offset='1' stop-color='#0a0310'/></linearGradient>
<linearGradient id='luzI' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffd890'/><stop offset='0.45' stop-color='#ff4a2a'/><stop offset='1' stop-color='#a0102a'/></linearGradient>
<linearGradient id='brasaV' gradientUnits='userSpaceOnUse' x1='0' y1='118' x2='0' y2='70'><stop offset='0' stop-color='#ff6a2a' stop-opacity='0.75'/><stop offset='1' stop-color='#ff6a2a' stop-opacity='0'/></linearGradient>
<radialGradient id='auraI' cx='0.4' cy='0.5' r='0.55'><stop offset='0' stop-color='#ff2a55' stop-opacity='0.6'/><stop offset='1' stop-color='#ff2a55' stop-opacity='0'/></radialGradient>
<pattern id='blkI' width='7' height='4.4' patternUnits='userSpaceOnUse'><path d='M0 0.2H7M0 2.4H7M3.5 0.2V2.4M0 2.4V4.4M7 2.4V4.4' stroke='#e0306a' stroke-opacity='0.22' stroke-width='0.25' fill='none'/></pattern>
<pattern id='tlhI' width='3.2' height='2.6' patternUnits='userSpaceOnUse'><path d='M0 2.6A1.6 1.6 0 0 0 3.2 2.6M-1.6 1.3A1.6 1.6 0 0 0 1.6 1.3M1.6 1.3A1.6 1.6 0 0 0 4.8 1.3' stroke='#e0306a' stroke-opacity='0.3' stroke-width='0.28' fill='none'/></pattern>
<filter id='brilho' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='1.1'/></filter>
<filter id='brilhoLava' x='-30%' y='-60%' width='160%' height='220%'><feGaussianBlur stdDeviation='1.6'/></filter>
<filter id='fumaca' x='-40%' y='-40%' width='180%' height='180%'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='3' seed='9' result='d'/><feDisplacementMap in='SourceGraphic' in2='d' scale='9' xChannelSelector='R' yChannelSelector='G'/><feGaussianBlur stdDeviation='2.2'/></filter>
<filter id='pedra' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='13' result='n'/><feDiffuseLighting in='n' surfaceScale='1.4' diffuseConstant='1.25' lighting-color='#ffd8e8' result='l'><feDistantLight azimuth='225' elevation='52'/></feDiffuseLighting><feComposite in='SourceGraphic' in2='l' operator='arithmetic' k1='1.3' k2='0' k3='0' k4='0' result='t'/><feComposite in='t' in2='SourceAlpha' operator='in'/></filter>
<filter id='rocha' x='-6%' y='-6%' width='112%' height='112%'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='4' seed='21' result='d'/><feDisplacementMap in='SourceGraphic' in2='d' scale='4' xChannelSelector='R' yChannelSelector='G' result='r'/><feTurbulence type='fractalNoise' baseFrequency='0.28' numOctaves='3' seed='4' result='n'/><feDiffuseLighting in='n' surfaceScale='2.6' diffuseConstant='1.3' lighting-color='#ffc0d4' result='l'><feDistantLight azimuth='225' elevation='42'/></feDiffuseLighting><feComposite in='r' in2='l' operator='arithmetic' k1='1.4' k2='0' k3='0' k4='0' result='t'/><feComposite in='t' in2='r' operator='in'/></filter>
</defs>`;

    const montanha = `<g filter='url(#rocha)'><path d='M84 120L66 106L48 94L32 80L22 66L26 52L34 40L46 28L58 16L68 6L76 2L84 10L96 22L112 36L132 52L156 70L180 90L200 106V120Z' fill='url(#rocI)'/><path d='M76 112C96 105 130 106 200 102V120H70Z' fill='url(#rocI)'/></g>`;
    const veias = `<g fill='none' stroke-linecap='round'><path d='M30 78C40 84 46 90 58 92C70 96 78 104 90 108M112 40C120 50 130 58 140 66C152 76 164 86 176 96M70 20C74 34 70 46 76 58' stroke='#ff5a20' stroke-width='1.4' opacity='0.85' filter='url(#brilhoLava)'/><path d='M30 78C40 84 46 90 58 92C70 96 78 104 90 108M112 40C120 50 130 58 140 66C152 76 164 86 176 96' stroke='#ffd0a0' stroke-width='0.5' opacity='0.9'/></g>`;
    const muros = `<rect x='48' y='80' width='120' height='16' fill='url(#cilI)'/><rect x='48' y='80' width='120' height='16' fill='url(#blkI)'/><rect x='48' y='80' width='120' height='16' fill='url(#brasaV)'/>${cachorros(48, 80, 120, '#2a0e22')}${ameias(48, 80, 120, 'url(#cilI)', 6)}`
        + `<rect x='80' y='96' width='112' height='20' fill='url(#cilI)'/><rect x='80' y='96' width='112' height='20' fill='url(#blkI)'/><rect x='80' y='96' width='112' height='20' fill='url(#brasaV)'/>${cachorros(80, 96, 112, '#2a0e22')}${ameias(80, 96, 112, 'url(#cilI)', 6)}`;
    const naves = `<rect x='54' y='46' width='46' height='36' fill='url(#cilI)'/><rect x='54' y='46' width='46' height='36' fill='url(#blkI)'/><rect x='54' y='46' width='46' height='36' fill='url(#brasaV)'/>${ameias(54, 46, 46, 'url(#cilI)', 6)}`
        + `<rect x='100' y='56' width='24' height='26' fill='url(#cilI)'/><rect x='100' y='56' width='24' height='26' fill='url(#blkI)'/><rect x='100' y='56' width='24' height='26' fill='url(#brasaV)'/>${ameias(100, 56, 24, 'url(#cilI)', 6)}`;
    const torres = [
        { x: 66, w: 22, top: 20, base: 48, apex: 3 },
        { x: 54, w: 10, top: 34, base: 82, apex: 18 }, { x: 90, w: 10, top: 32, base: 82, apex: 12 },
        { x: 38, w: 13, top: 60, base: 96, apex: 42 }, { x: 108, w: 12, top: 62, base: 96, apex: 44 },
        { x: 126, w: 11, top: 74, base: 116, apex: 56 }, { x: 150, w: 13, top: 82, base: 116, apex: 62 },
        { x: 172, w: 11, top: 84, base: 116, apex: 66 }, { x: 186, w: 10, top: 92, base: 116, apex: 78 }, { x: 92, w: 12, top: 78, base: 116, apex: 62 }
    ].map(agulhaInferno);
    const arcobotantes = `<path d='M52 60Q60 50 66 56M100 54Q94 46 88 54M38 70Q46 62 54 66M120 66Q112 58 100 64' stroke='#2a0e22' stroke-width='3' fill='none'/><path d='M52 60Q60 50 66 56M100 54Q94 46 88 54' stroke='#d0245a' stroke-width='0.5' fill='none' opacity='0.7'/>`;
    const portal = `<path d='M136 116V104a8 8 0 0 1 16 0V116z' fill='#050108'/><path d='M138 116V105a6 6 0 0 1 12 0V116z' fill='url(#luzI)' opacity='0.8'/><path d='M139 116V108M144 116V104M149 116V108M138 109H150' stroke='#2a0a10' stroke-width='0.5'/>`;
    const rosa = `<circle cx='77' cy='34' r='4.2' fill='url(#luzI)' stroke='#d0245a' stroke-width='0.7'/><path d='M77 29.8V38.2M72.8 34H81.2M74 31L80 37M80 31L74 37' stroke='#4a0a1a' stroke-width='0.5'/>`;
    const lavaPe = `<ellipse cx='140' cy='117' rx='60' ry='3.4' fill='#ff3a1c' opacity='0.92'/><ellipse cx='140' cy='117' rx='40' ry='1.6' fill='#ffd0a0' opacity='0.85'/><path d='M144 116C143 120 146 122 144 124' stroke='#ff5a20' stroke-width='3' fill='none' filter='url(#brilhoLava)'/>`;
    const todasJanelas = torres.flatMap(t => t.wins);
    const jan = janelas([...todasJanelas, [66, 54, 4, 10], [78, 64, 4, 10], [90, 54, 4, 10], [106, 62, 3.4, 8], [118, 62, 3.4, 8], [60, 86, 3, 7], [78, 86, 3, 7], [110, 86, 3, 7], [128, 86, 3, 7], [158, 86, 3, 7], [100, 104, 3, 7], [122, 104, 3, 7], [166, 104, 3, 7], [184, 104, 3, 7]], 'url(#luzI)', '#2a0a10');
    const bandeiras = bandeira(59, 18, '#d0143a', '#6a0a22') + bandeira(95, 12, '#d0143a', '#6a0a22');
    const brasas = [[44, 70, 0.7], [60, 12, 0.6], [96, 8, 0.5], [120, 40, 0.7], [146, 62, 0.6], [30, 90, 0.5], [170, 78, 0.6]].map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#ffb070' filter='url(#brilho)'/>`).join('');
    const fumaca = `<g fill='#3a0e22' opacity='0.5' filter='url(#fumaca)'><ellipse cx='84' cy='6' rx='18' ry='5'/><ellipse cx='100' cy='14' rx='14' ry='4'/></g>`;

    return encaixarSvg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120' preserveAspectRatio='xMidYMax meet'>${defs}`
        + `<ellipse cx='84' cy='56' rx='88' ry='60' fill='url(#auraI)'/>`
        + montanha + veias
        + `<g filter='url(#pedra)'>${muros}${naves}${torres.map(t => t.corpo).join('')}</g>`
        + arcobotantes + torres.map(t => t.telhado).join('')
        + portal + rosa + jan + lavaPe + bandeiras + fumaca + brasas + '</svg>');
}
