// Ajuste único das regiões do mapa realista (rodado uma vez; guarda uma marca para não repetir):
//  - Águas de Sentina vira um arquipélago (várias ilhas ao redor da ilha original);
//  - Piltover e Zaun ganha um pouco mais de costa ao norte, para caber a cidade;
//  - a ilha a noroeste de Shurima se afasta do continente.
// Atualiza os realces (src/assets/mapa-realista/hover-*.png), a máscara de terra e as fronteiras padrão
// (src/core/fronteirasPadraoDados.js). Uso (dentro de app/):  node tools/ajustar-regioes-mapa.cjs
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const RAIZ = path.resolve(__dirname, '..');
const DIR = path.join(RAIZ, 'src/assets/mapa-realista');
const ARQ_TERRA = path.join(RAIZ, 'src/assets/runeterra-terra-mascara.png');
const ARQ_GRADE = path.join(RAIZ, 'src/core/fronteirasPadraoDados.js');
const LW = 768, LH = 492, GL = 320, GA = 204;

let semente = 5150;
const rnd = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };

// Contorno irregular de uma ilha: elipse com ondulações.
function bolha(cx, cy, rx, ry, rot = 0) {
    const n = 48, fases = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const pts = [];
    for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = 1 + 0.16 * Math.sin(a * 2 + fases[0]) + 0.12 * Math.sin(a * 3 + fases[1]) + 0.07 * Math.sin(a * 5 + fases[2]);
        const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    return pts;
}
function dentro(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
}

// ilhas do arquipélago de Sentina (coordenadas no tamanho 768x492)
const ILHAS_SENTINA = [
    bolha(592, 258, 13, 8, 0.3), bolha(604, 266, 8, 6, 0.1), bolha(614, 292, 10, 7, -0.4), bolha(605, 299, 6, 5, 0),
    bolha(563, 322, 9, 6, 0.2), bolha(643, 268, 8, 6, 0.5), bolha(598, 331, 7, 5, 0),
    bolha(546, 241, 4, 3, 0), bolha(577, 242, 4, 3, 0.5), bolha(627, 247, 4, 3, 0), bolha(660, 302, 4, 3, 0.3),
    bolha(588, 306, 3, 2.5, 0), bolha(629, 318, 4, 3, 0), bolha(541, 338, 4, 3, 0), bolha(656, 331, 4, 3, 0.2)
];
// costa a mais ao norte de Piltover
const ENSEADA_PILTOVER = [bolha(372, 263, 30, 9, 0), bolha(352, 268, 14, 6, 0.1)];

async function carregar(arquivo) {
    const img = await loadImage(arquivo);
    const c = createCanvas(LW, LH); const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, LW, LH);
    return { c, ctx };
}
function corDe(ctx) {
    const d = ctx.getImageData(0, 0, LW, LH).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 240) return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
    return '#fff';
}
function preencher(ctx, formas) {
    ctx.fillStyle = corDe(ctx);
    formas.forEach((pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); });
}

// componente conectado (alfa > 128) a partir de uma semente, dentro de uma janela
function componente(dados, sx, sy, janela) {
    const [x0, y0, x1, y1] = janela;
    const vis = new Set(); const fila = [[sx, sy]]; const lista = [];
    const vivo = (x, y) => dados[(y * LW + x) * 4 + 3] > 128;
    while (fila.length) {
        const [x, y] = fila.pop(); const k = y * LW + x;
        if (x < x0 || x > x1 || y < y0 || y > y1 || vis.has(k) || !vivo(x, y)) continue;
        vis.add(k); lista.push([x, y]);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) fila.push([x + a, y + b]);
    }
    return lista;
}

async function principal() {
    const arqShurima = path.join(DIR, 'hover-shurima.png');
    const marca = await carregar(path.join(DIR, 'hover-aguas.png'));
    const dm = marca.ctx.getImageData(0, 0, LW, LH).data;
    for (let y = 240; y < 345; y++) for (let x = 580; x < 670; x++) if (dm[(y * LW + x) * 4 + 3] > 128) { console.log('As regiões já foram ajustadas; nada a fazer.'); return; }

    const aguas = marca;
    const pilt = await carregar(path.join(DIR, 'hover-piltover.png'));
    const shur = await carregar(arqShurima);
    const terra = await carregar(ARQ_TERRA);

    // 1) ilha de Shurima se afasta para noroeste
    const DX = -5, DY = -4;
    const dS = shur.ctx.getImageData(0, 0, LW, LH).data;
    const JAN = [198, 280, 240, 312];
    const ilha = componente(dS, 220, 297, JAN);
    if (ilha.length < 50) throw new Error('ilha de Shurima não encontrada');
    const principalSh = componente(dS, 300, 330, [200, 290, 330, 360]);
    const noPrincipal = new Set(principalSh.map(([x, y]) => y * LW + x));
    const noIlha = new Set(ilha.map(([x, y]) => y * LW + x));
    // pixels (inclusive a borda suave) mais perto da ilha do que do continente
    const sel = [];
    for (let y = JAN[1] - 3; y <= JAN[3] + 3; y++) for (let x = JAN[0] - 3; x <= JAN[2] + 3; x++) {
        let dI = 99, dP = 99;
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
            const k = (y + b) * LW + x + a, d = Math.hypot(a, b);
            if (noIlha.has(k) && d < dI) dI = d;
            if (noPrincipal.has(k) && d < dP) dP = d;
        }
        if (dI <= 3 && dI < dP) sel.push([x, y]);
    }
    for (const alvo of [shur, terra]) {
        const img = alvo.ctx.getImageData(0, 0, LW, LH); const d = img.data;
        const copia = sel.map(([x, y]) => [x, y, d.slice((y * LW + x) * 4, (y * LW + x) * 4 + 4)]);
        copia.forEach(([x, y]) => { d[(y * LW + x) * 4 + 3] = 0; });
        copia.forEach(([x, y, px]) => { const k = ((y + DY) * LW + (x + DX)) * 4; if (px[3] > d[k + 3]) { d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = px[3]; } });
        alvo.ctx.putImageData(img, 0, 0);
    }

    // 2) arquipélago de Sentina e enseada de Piltover
    preencher(aguas.ctx, ILHAS_SENTINA); preencher(terra.ctx, ILHAS_SENTINA);
    preencher(pilt.ctx, ENSEADA_PILTOVER); preencher(terra.ctx, ENSEADA_PILTOVER);
    fs.writeFileSync(path.join(DIR, 'hover-aguas.png'), aguas.c.toBuffer('image/png'));
    fs.writeFileSync(path.join(DIR, 'hover-piltover.png'), pilt.c.toBuffer('image/png'));
    fs.writeFileSync(arqShurima, shur.c.toBuffer('image/png'));
    fs.writeFileSync(ARQ_TERRA, terra.c.toBuffer('image/png'));

    // 3) fronteiras padrão (grade 320x204)
    const fonte = fs.readFileSync(ARQ_GRADE, 'utf8');
    const linhas = [...fonte.matchAll(/'([0-9a-c,]+)'/g)].map((m) => m[1]);
    const grade = linhas.map((c) => { let l = ''; c.split(',').forEach((p) => { l += p[0].repeat(Number(p.slice(1))); }); return l.split(''); });
    const ex = LW / GL, ey = LH / GA;
    // ilha de Shurima: componente de '5' na janela, movida 2 células para noroeste
    const gj = [Math.floor(JAN[0] / ex) - 1, Math.floor(JAN[1] / ey) - 1, Math.ceil(JAN[2] / ex), Math.ceil(JAN[3] / ey)];
    const vis = new Set(); const fila = [[Math.round(220 / ex), Math.round(297 / ey)]]; const celulas = [];
    while (fila.length) {
        const [x, y] = fila.pop(); const k = y * GL + x;
        if (x < gj[0] || x > gj[2] || y < gj[1] || y > gj[3] || vis.has(k) || grade[y][x] !== '5') continue;
        vis.add(k); celulas.push([x, y]);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => fila.push([x + a, y + b]));
    }
    if (celulas.length < 8 || celulas.length > 200) throw new Error('ilha da grade: ' + celulas.length + ' células');
    celulas.forEach(([x, y]) => { grade[y][x] = '0'; });
    celulas.forEach(([x, y]) => { grade[y - 2][x - 2] = '5'; });
    const marcar = (formas, id) => {
        for (let y = 0; y < GA; y++) for (let x = 0; x < GL; x++) {
            let dentroN = 0;
            for (const [a, b] of [[0, 0], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
                const px = (x + 0.5 + a) * ex, py = (y + 0.5 + b) * ey;
                if (formas.some((f) => dentro(f, px, py))) dentroN++;
            }
            if (dentroN >= 2 && grade[y][x] === '0') grade[y][x] = id;
        }
    };
    marcar(ILHAS_SENTINA, '8'); marcar(ENSEADA_PILTOVER, '4');
    const codificar = (l) => { const partes = []; let i = 0; while (i < l.length) { let j = i; while (j < l.length && l[j] === l[i]) j++; partes.push(l[i] + (j - i)); i = j; } return partes.join(','); };
    const cab = fonte.slice(0, fonte.indexOf('export const LINHAS_PADRAO'));
    const saida = cab + 'export const LINHAS_PADRAO = [\n' + grade.map((l) => `    '${codificar(l)}'`).join(',\n') + '\n];\n';
    fs.writeFileSync(ARQ_GRADE, saida);
    console.log('Regiões ajustadas.');
}

principal().catch((e) => { console.error(e); process.exit(1); });
