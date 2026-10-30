// Gera src/assets/runeterra-realista.jpg (mapa realista da Terra 0): relevo, rios, lagos, florestas, desertos, neve e mar
// desenhados proceduralmente. As regiões e a costa vêm dos realces em src/assets/mapa-realista/hover-*.png, então o mapa
// continua casando com as fronteiras e os pontos. Uso (dentro de app/):  node tools/gerar-mapa-realista.cjs [saida.jpg]
// Precisa do pacote @napi-rs/canvas, que não está no package.json (só serve para esta ferramenta): rode antes
// `npm i --no-save @napi-rs/canvas`.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = process.argv[2] || path.join(RAIZ, 'src/assets/runeterra-realista.jpg');
const W = 2560, H = 1640;           // mesma proporção do original (1536x984)
const LW = 768, LH = 492;           // resolução dos realces
const ESC = W / LW;
const N = W * H;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ---------- utilidades ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function criarRuido(semente) {
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = semente >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    return (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const X = xi & 255, Y = yi & 255;
        const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
        const a = perm[perm[X] + Y], b = perm[perm[X + 1] + Y], c = perm[perm[X] + Y + 1], d = perm[perm[X + 1] + Y + 1];
        const n00 = gx[a] * xf + gy[a] * yf, n10 = gx[b] * (xf - 1) + gy[b] * yf;
        const n01 = gx[c] * xf + gy[c] * (yf - 1), n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
        return (lerp(lerp(n00, n10, u), lerp(n01, n11, u), v)) * 1.4; // ~[-1,1]
    };
}
const ruidoA = criarRuido(1337), ruidoB = criarRuido(4242), ruidoC = criarRuido(9001), ruidoD = criarRuido(777);

// fbm em [0,1]
function fbm(ruido, x, y, oit, gan = 0.5, lac = 2.03) {
    let soma = 0, amp = 1, f = 1, norma = 0;
    for (let i = 0; i < oit; i++) { soma += ruido(x * f + i * 13.7, y * f - i * 7.1) * amp; norma += amp; amp *= gan; f *= lac; }
    return soma / norma * 0.5 + 0.5;
}
// cordilheiras (picos agudos, vales entre eles)
function cordilheira(ruido, x, y, oit) {
    let soma = 0, amp = 1, f = 1, peso = 1, norma = 0;
    for (let i = 0; i < oit; i++) {
        let n = 1 - Math.abs(ruido(x * f + i * 31.1, y * f + i * 17.9));
        n *= n; n *= peso; peso = clamp(n * 2.2, 0, 1);
        soma += n * amp; norma += amp; amp *= 0.5; f *= 2.07;
    }
    return clamp(soma / norma * 1.5, 0, 1);
}

function borrar(arr, w, h, raio, passes = 2) {
    let src = arr;
    const tam = raio * 2 + 1;
    for (let p = 0; p < passes; p++) {
        const tmp = new Float32Array(arr.length);
        for (let y = 0; y < h; y++) {
            const base = y * w;
            let soma = 0;
            for (let x = -raio; x <= raio; x++) soma += src[base + clamp(x, 0, w - 1)];
            for (let x = 0; x < w; x++) {
                tmp[base + x] = soma / tam;
                soma += src[base + clamp(x + raio + 1, 0, w - 1)] - src[base + clamp(x - raio, 0, w - 1)];
            }
        }
        const saida = new Float32Array(arr.length);
        for (let x = 0; x < w; x++) {
            let soma = 0;
            for (let y = -raio; y <= raio; y++) soma += tmp[clamp(y, 0, h - 1) * w + x];
            for (let y = 0; y < h; y++) {
                saida[y * w + x] = soma / tam;
                soma += tmp[clamp(y + raio + 1, 0, h - 1) * w + x] - tmp[clamp(y - raio, 0, h - 1) * w + x];
            }
        }
        src = saida;
    }
    return src;
}

function amostra(arr, w, h, u, v) {
    const x = clamp(u * w - 0.5, 0, w - 1.001), y = clamp(v * h - 0.5, 0, h - 1.001);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const i = yi * w + xi;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + w] * (1 - fx) + arr[i + w + 1] * fx) * fy;
}

// distância (em pixels) até o pixel verdadeiro mais próximo (chanfro 3-4)
function distancia(fonte, w, h) {
    const d = new Float32Array(w * h);
    const INF = 1e9;
    for (let i = 0; i < d.length; i++) d[i] = fonte[i] ? 0 : INF;
    const D = 1.4142;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D); }
        d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D); if (x > 0) v = Math.min(v, d[i + w - 1] + D); }
        d[i] = v;
    }
    return d;
}

// ---------- regiões ----------
const REGIOES = ['freljord', 'demacia', 'noxus', 'piltover', 'shurima', 'targon', 'ixtal', 'aguas', 'ilha', 'ionia', 'neutro'];
const R = Object.fromEntries(REGIOES.map((n, i) => [n, i]));
// alt: soerguimento base; cord: peso das cordilheiras; amp: relevo suave; neve: altitude da linha de neve; umid; arid; arv: tendência a florestas
const PARAM = {
    freljord: { alt: 0.34, cord: 0.95, amp: 0.55, neve: 0.26, umid: 0.45, arid: 0.0, arv: -0.60, c1: [176, 180, 178], c2: [150, 156, 156], rocha: [122, 124, 132], arvore: [30, 66, 54] },
    demacia: { alt: 0.10, cord: 0.18, amp: 0.38, neve: 9, umid: 0.70, arid: 0.0, arv: 0.00, c1: [118, 168, 70], c2: [160, 180, 82], rocha: [130, 122, 108], arvore: [40, 100, 42] },
    noxus: { alt: 0.30, cord: 0.70, amp: 0.55, neve: 1.10, umid: 0.42, arid: 0.12, arv: 0.14, c1: [158, 124, 70], c2: [124, 106, 60], rocha: [118, 98, 88], arvore: [44, 76, 46] },
    piltover: { alt: 0.05, cord: 0.05, amp: 0.20, neve: 9, umid: 0.55, arid: 0.10, arv: -0.10, c1: [128, 156, 96], c2: [150, 156, 118], rocha: [132, 128, 122], arvore: [50, 96, 52] },
    shurima: { alt: 0.10, cord: 0.30, amp: 0.30, neve: 9, umid: 0.00, arid: 1.00, arv: -0.60, c1: [228, 190, 118], c2: [240, 208, 142], rocha: [176, 126, 88], arvore: [92, 124, 48] },
    targon: { alt: 0.52, cord: 1.00, amp: 0.45, neve: 0.78, umid: 0.20, arid: 0.15, arv: -0.20, c1: [128, 122, 132], c2: [152, 140, 136], rocha: [110, 98, 122], arvore: [56, 84, 60] },
    ixtal: { alt: 0.10, cord: 0.14, amp: 0.36, neve: 9, umid: 1.00, arid: 0.0, arv: 0.50, c1: [40, 116, 56], c2: [28, 98, 52], rocha: [84, 94, 72], arvore: [16, 76, 38] },
    aguas: { alt: 0.10, cord: 0.30, amp: 0.30, neve: 9, umid: 0.80, arid: 0.0, arv: 0.10, c1: [96, 130, 72], c2: [72, 108, 64], rocha: [108, 98, 86], arvore: [32, 92, 50] },
    ilha: { alt: 0.10, cord: 0.55, amp: 0.30, neve: 9, umid: 0.30, arid: 0.1, arv: -0.10, c1: [66, 84, 80], c2: [50, 66, 68], rocha: [66, 72, 80], arvore: [30, 50, 52] },
    ionia: { alt: 0.14, cord: 0.30, amp: 0.42, neve: 9, umid: 0.85, arid: 0.0, arv: 0.18, c1: [96, 174, 84], c2: [130, 188, 100], rocha: [132, 126, 118], arvore: [34, 112, 56] },
    neutro: { alt: 0.10, cord: 0.20, amp: 0.30, neve: 9, umid: 0.55, arid: 0.1, arv: 0.00, c1: [120, 158, 82], c2: [142, 162, 94], rocha: [126, 120, 110], arvore: [44, 98, 48] }
};
const P = REGIOES.map((n) => PARAM[n]);
const CONIFERAS = new Set([R.freljord, R.noxus, R.targon]);

async function lerAlfa(arquivo) {
    const img = await loadImage(arquivo);
    const c = createCanvas(LW, LH); const x = c.getContext('2d');
    x.drawImage(img, 0, 0, LW, LH);
    const d = x.getImageData(0, 0, LW, LH).data;
    const a = new Float32Array(LW * LH);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
    return a;
}

async function principal() {
    const dirReal = path.join(RAIZ, 'src/assets/mapa-realista');
    const SLUGS = ['freljord', 'demacia', 'noxus', 'piltover', 'shurima', 'targon', 'ixtal', 'aguas', 'ilha', 'ionia'];
    const campos = [];
    for (const s of SLUGS) campos.push(await lerAlfa(path.join(dirReal, `hover-${s}.png`)));
    const terraMasc = await lerAlfa(path.join(RAIZ, 'src/assets/runeterra-terra-mascara.png'));
    const uniao = new Float32Array(LW * LH);
    for (let i = 0; i < uniao.length; i++) { let m = terraMasc[i]; for (const c of campos) if (c[i] > m) m = c[i]; uniao[i] = m; }
    log('máscaras lidas');

    const uniaoB = borrar(uniao, LW, LH, 1, 2);
    const camposB = campos.map((c) => borrar(c, LW, LH, 3, 2));
    const camposB2 = campos.map((c) => borrar(c, LW, LH, 9, 2));

    // ---- terra x mar (costa com detalhe fractal) ----
    const terra = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        let f = amostra(uniaoB, LW, LH, u, v);
        const rugosidade = (fbm(ruidoA, x * 0.012, y * 0.012, 5) - 0.5) * 0.55 + (ruidoB(x * 0.09, y * 0.09)) * 0.07;
        f += rugosidade * suave(0.05, 0.4, f) * suave(0.95, 0.6, f);
        terra[y * W + x] = f > 0.5 ? 1 : 0;
    }
    const mar = new Uint8Array(N); for (let i = 0; i < N; i++) mar[i] = terra[i] ? 0 : 1;
    const dMar = distancia(mar, W, H);      // nas terras: distância até a costa
    const dTerra = distancia(terra, W, H);  // no mar: distância até a terra
    log('costa pronta');

    // ---- regiões: pesos suaves e região dominante ----
    const peso = REGIOES.map(() => new Uint8Array(N));
    const regiao = new Uint8Array(N);
    const tmp = new Float32Array(REGIOES.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!terra[i]) continue;
        const wx = (fbm(ruidoC, x * 0.006, y * 0.006, 4) - 0.5) * 38 + (ruidoD(x * 0.05, y * 0.05)) * 3;
        const wy = (fbm(ruidoD, x * 0.006 + 40, y * 0.006, 4) - 0.5) * 38 + (ruidoC(x * 0.05, y * 0.05)) * 3;
        const u = (x + wx + 0.5) / W, v = (y + wy + 0.5) / H;
        let soma = 0, melhor = -1, mv = -1;
        for (let r = 0; r < 10; r++) {
            const f = amostra(camposB[r], LW, LH, u, v);
            const g = amostra(camposB2[r], LW, LH, u, v);
            const val = f * 0.7 + g * 0.3;
            tmp[r] = val * val; soma += tmp[r];
            if (val > mv) { mv = val; melhor = r; }
        }
        tmp[10] = 0.0004; soma += tmp[10];
        regiao[i] = mv < 0.02 ? 10 : melhor;
        for (let r = 0; r < 11; r++) peso[r][i] = Math.round(tmp[r] / soma * 255);
    }
    log('regiões prontas');

    // ---- altura ----
    const alt = new Float32Array(N);
    const duna = new Float32Array(N);
    const fatorArid = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!terra[i]) continue;
        let a = 0, c = 0, m = 0, ar = 0;
        for (let r = 0; r < 11; r++) { const w = peso[r][i] / 255; if (!w) continue; a += w * P[r].alt; c += w * P[r].cord; m += w * P[r].amp; ar += w * P[r].arid; }
        fatorArid[i] = ar;
        const dc = dMar[i];
        const interior = suave(0, 150, dc);
        const perfil = 0.10 + 0.90 * Math.pow(interior, 0.85);
        const wx = x + (fbm(ruidoB, x * 0.004, y * 0.004, 3) - 0.5) * 120;
        const wy = y + (fbm(ruidoC, x * 0.004 + 9, y * 0.004, 3) - 0.5) * 120;
        const grande = fbm(ruidoA, wx * 0.0042, wy * 0.0042, 6);
        const cord = cordilheira(ruidoD, wx * 0.0068 + (ruidoA(x * 0.004, y * 0.004) * 0.25), wy * 0.0068 + (ruidoB(x * 0.004, y * 0.004) * 0.25), 8);
        const detalhe = (fbm(ruidoB, x * 0.03, y * 0.03, 4) - 0.5);
        let h = perfil * (a + m * 0.5 * grande + c * 0.85 * cord * (0.35 + 0.65 * interior)) + detalhe * 0.035 * (0.4 + c);
        // dunas: cristas alongadas que giram devagar
        if (ar > 0.3) {
            const ang = 0.9 + (fbm(ruidoC, x * 0.002, y * 0.002, 2) - 0.5) * 1.6;
            const co = Math.cos(ang), si = Math.sin(ang);
            const s = (x * co + y * si) * 0.045 + (fbm(ruidoD, x * 0.01, y * 0.01, 3) - 0.5) * 7;
            const fase = s - Math.floor(s);
            const serra = fase < 0.7 ? fase / 0.7 : (1 - fase) / 0.3; // lado suave e lado íngreme
            const onda = suave(0.3, 0.6, fbm(ruidoA, x * 0.007, y * 0.007, 3));
            duna[i] = serra * onda * (ar - 0.3) / 0.7;
            h += duna[i] * 0.018;
        }
        alt[i] = h;
    }
    log('relevo pronto');

    // ---- sombreamento do relevo ----
    const ESC_Z = 95; // exagero vertical
    const sombra = new Float32Array(N);
    const inclin = new Float32Array(N);
    const lx = -0.62, ly = -0.62, lz = 0.48; // luz de noroeste
    const ln = Math.hypot(lx, ly, lz);
    const [Lx, Ly, Lz] = [lx / ln, ly / ln, lz / ln];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!terra[i]) continue;
        const dx = (alt[i + 1] - alt[i - 1]) * 0.5 * ESC_Z, dy = (alt[i + W] - alt[i - W]) * 0.5 * ESC_Z;
        const nl = Math.hypot(dx, dy, 1);
        sombra[i] = clamp(((-dx * Lx - dy * Ly + Lz) / nl), -1, 1);
        inclin[i] = clamp(Math.hypot(dx, dy) / 2.2, 0, 1);
    }
    // oclusão simples: o vale fica mais escuro que a crista (altura menos média local)
    const altB = borrar(alt, W, H, 14, 2);
    log('sombras prontas');

    // ---- rios e lagos (em baixa resolução) ----
    const RS = 2, rw = W / RS, rh = H / RS;
    const hb = new Float32Array(rw * rh), terraB = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        let s = 0, t = 0;
        for (let j = 0; j < RS; j++) for (let k = 0; k < RS; k++) { const i = (y * RS + j) * W + x * RS + k; s += alt[i]; t += terra[i]; }
        hb[y * rw + x] = s / (RS * RS); terraB[y * rw + x] = t > RS * RS / 2 ? 1 : 0;
    }
    const hs = borrar(hb, rw, rh, 3, 2);
    // inundação por prioridade a partir do mar
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const cheio = new Float32Array(rw * rh), pai = new Int32Array(rw * rh).fill(-1), visto = new Uint8Array(rw * rh);
    const heap = [];
    const push = (k) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cheio[heap[p]] <= cheio[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const topo = heap[0]; const ult = heap.pop(); if (heap.length) { heap[0] = ult; let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && cheio[heap[l]] < cheio[heap[m]]) m = l; if (r < heap.length && cheio[heap[r]] < cheio[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return topo; };
    for (let i = 0; i < rw * rh; i++) { if (!terraB[i]) { cheio[i] = -1; visto[i] = 1; } }
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const i = y * rw + x;
        if (terraB[i]) continue;
        for (const [dx, dy] of nb) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue; const j = yy * rw + xx; if (terraB[j] && !visto[j]) { visto[j] = 1; cheio[j] = Math.max(hs[j], -0.5); pai[j] = i; push(j); } }
    }
    const ordem = [];
    while (heap.length) {
        const c = pop(); ordem.push(c);
        const cx = c % rw, cy = (c / rw) | 0;
        for (const [dx, dy] of nb) {
            const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
            const j = yy * rw + xx; if (visto[j]) continue;
            visto[j] = 1; cheio[j] = Math.max(hs[j], cheio[c] + 1e-5); pai[j] = c; push(j);
        }
    }
    const acum = new Float32Array(rw * rh).fill(1);
    for (let k = ordem.length - 1; k >= 0; k--) { const c = ordem[k]; const p = pai[c]; if (p >= 0 && terraB[p]) acum[p] += acum[c]; }
    log('hidrografia pronta');

    // lagos: depressões que a inundação preencheu
    const lagoB = new Float32Array(rw * rh);
    for (let i = 0; i < rw * rh; i++) if (terraB[i] && cheio[i] - hs[i] > 0.13 && regiao[((((i / rw) | 0) * RS + 2) * W) + (i % rw) * RS + 2] !== R.shurima) lagoB[i] = 1;

    const cvRio = createCanvas(W, H); const rx = cvRio.getContext('2d');
    function tracarRios(ctx, cor, largMais, alfa) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const segs = [];
        for (let i = 0; i < rw * rh; i++) {
            if (!terraB[i] || lagoB[i]) continue;
            const p = pai[i]; if (p < 0) continue;
            const cx = i % rw, cy = (i / rw) | 0;
            const arid = fatorArid[(cy * RS + 2) * W + cx * RS + 2];
            const limiar = 650 * (1 + arid * 5);
            if (acum[i] < limiar) continue;
            segs.push([acum[i], i, p]);
        }
        segs.sort((a, b) => a[0] - b[0]);
        const jit = (c) => { const cx = c % rw, cy = (c / rw) | 0; return [(cx + 0.5) * RS + ruidoA(cx * 0.5 + 3.1, cy * 0.5) * RS * 1.4, (cy + 0.5) * RS + ruidoB(cx * 0.5, cy * 0.5 + 5.3) * RS * 1.4]; };
        const meio = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        ctx.strokeStyle = cor;
        for (const [a, i, p] of segs) {
            const pi = jit(i), pp = jit(p);
            const m0 = meio(pi, pp);
            const prox = pai[p] >= 0 && terraB[pai[p]] ? meio(pp, jit(pai[p])) : pp;
            ctx.globalAlpha = alfa;
            ctx.lineWidth = largMais + 0.5 + Math.sqrt(a / 650) * 0.45;
            ctx.beginPath(); ctx.moveTo(pi[0], pi[1]); ctx.lineTo(m0[0], m0[1]); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(pp[0], pp[1], prox[0], prox[1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    rx.fillStyle = '#000'; rx.fillRect(0, 0, W, H);
    tracarRios(rx, '#fff', 0, 1);
    const rioData = rx.getImageData(0, 0, W, H).data;
    const rio = new Float32Array(N); for (let i = 0; i < N; i++) rio[i] = rioData[i * 4] / 255;
    const ripario = borrar(rio, W, H, 9, 2);
    // lagos em alta resolução
    const lagoGrande = new Float32Array(N);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (lagoB[y * rw + x]) for (let j = -1; j <= RS + 1; j++) for (let k = -1; k <= RS + 1; k++) { const yy = y * RS + j, xx = x * RS + k; if (xx >= 0 && yy >= 0 && xx < W && yy < H) lagoGrande[yy * W + xx] = 1; }
    const lagoSuave = borrar(lagoGrande, W, H, 5, 2);
    log('rios e lagos rasterizados');

    // ---- cor do terreno ----
    const img = createCanvas(W, H); const ctx = img.getContext('2d');
    const dados = ctx.createImageData(W, H); const px = dados.data;
    const florestaMasc = new Uint8Array(N);
    const sombraTotal = new Float32Array(N);

    // cor do mar
    function corMar(i, x, y) {
        const d = dTerra[i];
        const prof = 1 - Math.exp(-d / 85);
        const raso = Math.exp(-d / 17);
        let r = lerp(14, 4, prof), g = lerp(86, 26, prof), b = lerp(128, 62, prof);
        const ruido = (fbm(ruidoC, x * 0.0035, y * 0.0035, 4) - 0.5);
        r += ruido * 14; g += ruido * 26; b += ruido * 30;
        const onda = ruidoA(x * 0.11, y * 0.11 + 4) * 0.5 + ruidoB(x * 0.05, y * 0.05) * 0.5;
        g += onda * 4; b += onda * 5;
        r = lerp(r, 70, raso * 0.55); g = lerp(g, 178, raso * 0.6); b = lerp(b, 182, raso * 0.5);
        // plataforma de areia sob a água rasa
        const areia = suave(10, 0, d) * 0.35;
        r = lerp(r, 150, areia); g = lerp(g, 190, areia); b = lerp(b, 170, areia);
        return [r, g, b];
    }

    const u3 = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        let r, g, b;
        if (!terra[i]) {
            [r, g, b] = corMar(i, x, y);
            // sombra projetada da terra no mar (para o lado sudeste)
            const j = clamp(y - 4, 0, H - 1) * W + clamp(x - 4, 0, W - 1);
            if (terra[j]) { const k = 1 - clamp(dTerra[i] / 12, 0, 1) * 0.5; r *= 0.62 * k + 0.2; g *= 0.66 * k + 0.2; b *= 0.72 * k + 0.2; }
            // espuma da arrebentação
            const espuma = suave(2.6, 0.2, dTerra[i]) * (0.45 + 0.4 * (ruidoA(x * 0.2, y * 0.2) * 0.5 + 0.5));
            r = lerp(r, 236, espuma); g = lerp(g, 246, espuma); b = lerp(b, 248, espuma);
        } else {
            const h = alt[i];
            const dc = dMar[i];
            // pesos e parâmetros
            let neve = 0, umid = 0, arid = 0, arv = 0;
            let c1r = 0, c1g = 0, c1b = 0, c2r = 0, c2g = 0, c2b = 0, rr = 0, rg = 0, rb = 0, ar_ = 0, ag = 0, ab = 0;
            let lim = 0;
            for (let k = 0; k < 11; k++) {
                const w = peso[k][i] / 255; if (!w) continue; const p = P[k];
                lim += w * Math.min(p.neve, 3); umid += w * p.umid; arid += w * p.arid; arv += w * p.arv;
                c1r += w * p.c1[0]; c1g += w * p.c1[1]; c1b += w * p.c1[2];
                c2r += w * p.c2[0]; c2g += w * p.c2[1]; c2b += w * p.c2[2];
                rr += w * p.rocha[0]; rg += w * p.rocha[1]; rb += w * p.rocha[2];
                ar_ += w * p.arvore[0]; ag += w * p.arvore[1]; ab += w * p.arvore[2];
            }
            const manchas = fbm(ruidoB, x * 0.012, y * 0.012, 4);
            const fino = ruidoA(x * 0.35, y * 0.35) * 0.5 + 0.5;
            let tm = suave(0.35, 0.65, manchas);
            r = lerp(c1r, c2r, tm); g = lerp(c1g, c2g, tm); b = lerp(c1b, c2b, tm);
            // grão fino do chão
            const hs1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const gr = (fino - 0.5) * 14 + ((hs1 - Math.floor(hs1)) - 0.5) * 10;
            r += gr; g += gr * 0.9; b += gr * 0.7;
            // cor mais seca/amarelada longe dos rios em regiões áridas
            const rip = ripario[i];
            // fazendas (campos em mosaico) nas planícies de Demacia/Piltover/Ionia
            const wFaz = (peso[R.demacia][i] * 1.0 + peso[R.piltover][i] * 0.7 + peso[R.ionia][i] * 0.5) / 255;
            const planicie = suave(0.5, 0.15, inclin[i]) * suave(0.28, 0.1, h) * suave(8, 40, dc);
            if (wFaz > 0.25 && planicie > 0.05) {
                const cs = 34;
                const gx = (x + ruidoC(y * 0.02, 5) * 10) / cs, gy = (y + ruidoD(x * 0.02, 9) * 10) / cs;
                const ci = Math.floor(gx), cj = Math.floor(gy);
                let best = 9, id2 = 0;
                for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
                    const hx = ci + a, hy = cj + c;
                    const hh = Math.sin(hx * 127.1 + hy * 311.7) * 43758.5453; const fr = hh - Math.floor(hh);
                    const hh2 = Math.sin(hx * 269.5 + hy * 183.3) * 43758.5453; const fr2 = hh2 - Math.floor(hh2);
                    const dx = hx + fr - gx, dy = hy + fr2 - gy; const dd = dx * dx + dy * dy;
                    if (dd < best) { best = dd; id2 = (fr * 7919) % 1; }
                }
                const paletaF = [[186, 190, 96], [112, 164, 66], [208, 186, 100], [150, 176, 80], [98, 140, 70]];
                const fc = paletaF[Math.floor(id2 * 5) % 5];
                const fmix = clamp((wFaz - 0.25) * 2, 0, 1) * planicie * 0.55;
                r = lerp(r, fc[0], fmix); g = lerp(g, fc[1], fmix); b = lerp(b, fc[2], fmix);
            }
            // bosques e florestas
            const baseF = fbm(ruidoA, x * 0.0075 + 20, y * 0.0075, 5);
            const bosque = suave(0.52 - arv * 0.30 - umid * 0.10 + arid * 0.15, 0.60 - arv * 0.30 - umid * 0.10 + arid * 0.15, baseF + (ruidoB(x * 0.06, y * 0.06)) * 0.04);
            const semNeve = suave(lim + 0.05, lim - 0.06, h);
            let limiteFrio = 1;
            if (regiao[i] === R.freljord) limiteFrio = suave(0.04, 0.34, Math.max(amostra(camposB2[R.demacia], LW, LH, x / W, y / H), amostra(camposB2[R.noxus], LW, LH, x / W, y / H)));
            let floresta = limiteFrio * bosque * suave(0.78, 0.46, h) * suave(0.7, 0.35, inclin[i]) * semNeve * suave(1, 5, dc) * (1 - suave(0.4, 0.8, lagoSuave[i]));
            floresta = Math.max(floresta, limiteFrio * clamp(rip * 1.4, 0, 1) * (0.55 + 0.4 * umid) * suave(0.7, 0.2, inclin[i]) * semNeve * (arid > 0.5 ? 0.9 : 0.55));
            florestaMasc[i] = Math.round(clamp(floresta, 0, 1) * 255);
            r = lerp(r, ar_ * 1.05, floresta * 0.82); g = lerp(g, ag * 1.05, floresta * 0.82); b = lerp(b, ab * 1.05, floresta * 0.82);
            // rochas nas encostas e nos altos
            const rocha = clamp(suave(0.30, 0.68, inclin[i] + (fino - 0.5) * 0.25) * 0.95 + suave(0.5, 0.9, h) * 0.45, 0, 1) * (1 - floresta * 0.55);
            const estrato = ruidoC(x * 0.03, y * 0.03) * 0.5 + ruidoD(x * 0.25, y * 0.25) * 0.2;
            r = lerp(r, rr * (1 + estrato * 0.18), rocha); g = lerp(g, rg * (1 + estrato * 0.18), rocha); b = lerp(b, rb * (1 + estrato * 0.18), rocha);
            // dunas: cristas claras e pé escuro
            if (duna[i] > 0.01) { const dn = duna[i]; r += dn * 14 - 5; g += dn * 11 - 5; b += dn * 6 - 4; }
            // neve
            let nv = suave(lim - 0.03, lim + 0.07, h + (fbm(ruidoD, x * 0.02, y * 0.02, 4) - 0.5) * 0.12);
            nv *= 1 - suave(0.42, 0.85, inclin[i]) * 0.62;
            if (lim > 2) nv = 0;
            r = lerp(r, 242, nv); g = lerp(g, 246, nv); b = lerp(b, 252, nv);
            // praias e margens
            const praia = suave(7, 0.5, dc) * suave(0.16, 0.06, h) * (1 - nv) * (1 - rocha * 0.8);
            const fria = suave(0.6, 1, lim < 1 ? 1 - lim : 0);
            const pr = lerp(220, 150, fria), pg = lerp(204, 152, fria), pb = lerp(150, 140, fria);
            r = lerp(r, pr, praia * 0.85); g = lerp(g, pg, praia * 0.85); b = lerp(b, pb, praia * 0.85);
            // lagos
            const lg = suave(0.35, 0.65, lagoSuave[i]);
            if (lg > 0) { r = lerp(r, 44, lg); g = lerp(g, 120, lg); b = lerp(b, 160, lg); }
            // sombreamento do relevo
            const vale = clamp((altB[i] - h) * 9, -0.6, 0.9);
            let s = 0.64 + 0.70 * sombra[i] * (1 - lg) - vale * 0.06 + 0.06;
            s = clamp(s, 0.30, 1.45);
            sombraTotal[i] = s;
            r *= s; g *= s; b *= s;
            if (s < 0.95) { b += (0.95 - s) * 26; r -= (0.95 - s) * 6; }
            if (s > 1.1) { r += (s - 1.1) * 14; g += (s - 1.1) * 10; }
            // borda da terra escurece um pouco (contorno)
            const contorno = suave(2.2, 0, dc) * 0.30;
            r *= 1 - contorno; g *= 1 - contorno; b *= 1 - contorno;
        }
        px[o] = clamp(r, 0, 255); px[o + 1] = clamp(g, 0, 255); px[o + 2] = clamp(b, 0, 255); px[o + 3] = 255;
    }
    ctx.putImageData(dados, 0, 0);
    log('terreno colorido');

    // ---- árvores (desenhadas uma a uma) ----
    let semente = 20260;
    const rnd = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
    const arvores = [];
    const passo = 3.6;
    for (let gy = 0; gy < H; gy += passo) for (let gx = 0; gx < W; gx += passo) {
        const x = gx + rnd() * passo, y = gy + rnd() * passo;
        const xi = x | 0, yi = y | 0; if (xi < 2 || yi < 2 || xi >= W - 2 || yi >= H - 2) continue;
        const i = yi * W + xi;
        if (!terra[i] || dMar[i] < 3) continue;
        const f = florestaMasc[i] / 255;
        if (f < 0.33 || rnd() > Math.min(1, f * 1.15)) continue;
        if (rio[i] > 0.3 || lagoSuave[i] > 0.4) continue;
        arvores.push([x, y, i]);
    }
    arvores.sort((a, b) => a[1] - b[1]);
    for (const [x, y, i] of arvores) {
        const reg = regiao[i];
        const f = florestaMasc[i] / 255;
        const pa = P[reg].arvore;
        const tam = (reg === R.ixtal ? 3.7 : reg === R.ionia ? 3.2 : 2.7) * (0.8 + rnd() * 0.5) * (0.7 + f * 0.4);
        const luz = clamp(sombraTotal[i] * (0.82 + rnd() * 0.3), 0.3, 1.5);
        let tr = pa[0] * luz, tg = pa[1] * luz, tb = pa[2] * luz;
        if (reg === R.ionia && rnd() < 0.045) { tr = 230 * luz; tg = 150 * luz; tb = 170 * luz; }
        ctx.fillStyle = `rgba(8,20,14,0.38)`;
        ctx.beginPath(); ctx.ellipse(x + tam * 0.45, y + tam * 0.55, tam * 0.9, tam * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        if (CONIFERAS.has(reg)) {
            ctx.fillStyle = `rgb(${tr | 0},${tg | 0},${tb | 0})`;
            ctx.beginPath(); ctx.moveTo(x, y - tam * 1.9); ctx.lineTo(x + tam * 0.85, y + tam * 0.5); ctx.lineTo(x - tam * 0.85, y + tam * 0.5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.18 * (luz - 0.6)})`;
            ctx.beginPath(); ctx.moveTo(x, y - tam * 1.9); ctx.lineTo(x - tam * 0.85, y + tam * 0.5); ctx.lineTo(x - tam * 0.2, y + tam * 0.3); ctx.closePath(); ctx.fill();
        } else {
            ctx.fillStyle = `rgb(${(tr * 0.82) | 0},${(tg * 0.82) | 0},${(tb * 0.82) | 0})`;
            ctx.beginPath(); ctx.arc(x, y, tam, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgb(${clamp(tr * 1.15 + 6, 0, 255) | 0},${clamp(tg * 1.15 + 6, 0, 255) | 0},${clamp(tb * 1.15 + 4, 0, 255) | 0})`;
            ctx.beginPath(); ctx.arc(x - tam * 0.28, y - tam * 0.3, tam * 0.62, 0, Math.PI * 2); ctx.fill();
        }
    }
    log(`${arvores.length} árvores`);

    // ---- rios por cima ----
    tracarRios(ctx, 'rgba(18,50,66,1)', 0.9, 0.28);
    tracarRios(ctx, '#5b97ad', 0, 0.72);

    // ---- Piltover (cidade steampunk), Zaun (bairro largado) e o arquipélago pirata de Sentina ----
    const sorteio = (a, b) => a + rnd() * (b - a);
    const naRegiao = (x, y, reg, folga) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 2 || yi < 2 || xi >= W - 2 || yi >= H - 2) return false; const i = yi * W + xi; return terra[i] === 1 && regiao[i] === reg && dMar[i] > folga; };
    const ehZaun = (x, y) => x < 1345 && y > 926 + ruidoC(x * 0.02, y * 0.02) * 14;
    const cor3 = (c, f) => `rgb(${clamp(c[0] * f, 0, 255) | 0},${clamp(c[1] * f, 0, 255) | 0},${clamp(c[2] * f, 0, 255) | 0})`;
    function bloco(x, y, w, d, ang, sx, sy, cor, f) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.setTransform(ca, sa, -sa, ca, x + sx, y + sy); ctx.fillStyle = 'rgba(14,12,10,0.38)'; ctx.fillRect(-w / 2, -d / 2, w, d);
        ctx.setTransform(ca, sa, -sa, ca, x, y); ctx.fillStyle = cor3(cor, f); ctx.fillRect(-w / 2, -d / 2, w, d);
        ctx.fillStyle = 'rgba(255,248,224,0.22)'; ctx.fillRect(-w / 2, -d / 2, w, 0.9); ctx.fillRect(-w / 2, -d / 2, 0.9, d);
        ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(-w / 2, d / 2 - 0.9, w, 0.9); ctx.fillRect(w / 2 - 0.9, -d / 2, 0.9, d);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function docas(reg, quantidade, comp, folgaMin, cor) {
        const cand = [];
        for (let y = 4; y < H - 4; y += 2) for (let x = 4; x < W - 4; x += 2) { const i = y * W + x; if (terra[i] && regiao[i] === reg && dMar[i] > 0.8 && dMar[i] < 1.9) cand.push([x, y]); }
        const esc = [];
        for (let t = 0; t < 4000 && esc.length < quantidade && cand.length; t++) {
            const [x, y] = cand[(rnd() * cand.length) | 0];
            if (esc.some(([a, b]) => Math.hypot(a - x, b - y) < folgaMin)) continue;
            const gx = dMar[y * W + x + 3] - dMar[y * W + x - 3], gy = dMar[(y + 3) * W + x] - dMar[(y - 3) * W + x];
            const n = Math.hypot(gx, gy); if (n < 0.5) continue;
            esc.push([x, y, -gx / n, -gy / n]);
        }
        for (const [x, y, dx, dy] of esc) {
            const L = comp * sorteio(0.7, 1.3);
            ctx.lineCap = 'butt';
            ctx.strokeStyle = 'rgba(10,20,30,0.35)'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(x + 1.5, y + 1.8); ctx.lineTo(x + dx * L + 1.5, y + dy * L + 1.8); ctx.stroke();
            ctx.strokeStyle = cor; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * L, y + dy * L); ctx.stroke();
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(40,24,12,0.7)';
            for (let k = 2; k < L; k += 3) { ctx.beginPath(); ctx.moveTo(x + dx * k - dy * 1.6, y + dy * k + dx * 1.6); ctx.lineTo(x + dx * k + dy * 1.6, y + dy * k - dx * 1.6); ctx.stroke(); }
            ctx.strokeStyle = cor; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + dx * L - dy * 3, y + dy * L + dx * 3); ctx.lineTo(x + dx * L + dy * 3, y + dy * L - dx * 3); ctx.stroke();
        }
        return esc;
    }

    // chão da cidade (calçamento claro em Piltover; terra escura e suja em Zaun)
    {
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terra[y * W + x] && regiao[y * W + x] === R.piltover) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        if (bx1 > bx0) {
            const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
            const reg = ctx.getImageData(bx0, by0, bw, bh); const q = reg.data;
            for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
                const i = y * W + x; if (!(terra[i] && regiao[i] === R.piltover) || dMar[i] < 1.2) continue;
                const zn = ehZaun(x, y); const s = clamp(sombraTotal[i], 0.55, 1.2); const n = ruidoA(x * 0.15, y * 0.15) * 0.5 + 0.5;
                const base = zn ? [82 + n * 16, 84 + n * 10, 64 + n * 6] : [188 + n * 16, 174 + n * 14, 148 + n * 10];
                const k = clamp((dMar[i] - 1.2) / 3, 0, 1) * 0.88; const o = ((y - by0) * bw + (x - bx0)) * 4;
                q[o] = lerp(q[o], base[0] * s, k); q[o + 1] = lerp(q[o + 1], base[1] * s, k); q[o + 2] = lerp(q[o + 2], base[2] * s, k);
            }
            ctx.putImageData(reg, bx0, by0);
            // Piltover: quarteirões alinhados, torres altas e jardins
            const ang = -0.22, ca = Math.cos(ang), sa = Math.sin(ang);
            const telhados = [[168, 146, 108], [150, 152, 144], [190, 178, 150], [112, 134, 124], [146, 116, 96], [200, 190, 166]];
            for (let v = -400; v < 400; v += 11) for (let u = -900; u < 900; u += 11) {
                const x = (bx0 + bx1) / 2 + u * ca - v * sa, y = (by0 + by1) / 2 + u * sa + v * ca;
                if (!naRegiao(x, y, R.piltover, 3.2) || ehZaun(x, y)) continue;
                const r = rnd();
                if (r < 0.1) { ctx.fillStyle = cor3([70, 132, 62], 0.9 + rnd() * 0.2); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); continue; }
                const alto = rnd() < 0.12 ? 1.5 : 1;
                bloco(x + sorteio(-1, 1), y + sorteio(-1, 1), sorteio(6.5, 9) * alto, sorteio(5.5, 8) * alto, ang, 2 * alto, 2.2 * alto, telhados[(rnd() * telhados.length) | 0], sorteio(0.8, 1.0));
                if (rnd() < 0.3) { ctx.fillStyle = 'rgba(40,52,60,0.55)'; ctx.fillRect(x - 1, y - 1, 2, 2); }
            }
            // torres e cúpulas
            const torres = [];
            for (let t = 0; t < 5000 && torres.length < 7; t++) {
                const x = sorteio(bx0, bx1), y = sorteio(by0, by1);
                if (naRegiao(x, y, R.piltover, 6) && !ehZaun(x, y) && torres.every(([a, b]) => Math.hypot(a - x, b - y) > 26)) torres.push([x, y]);
            }
            for (const [x, y] of torres) {
                bloco(x, y, 11, 11, ang, 4.5, 5, [196, 170, 112], 1.05);
                ctx.fillStyle = 'rgb(224,188,96)'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 3.4, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgba(255,244,200,0.7)'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.2, 0, 7); ctx.fill();
            }
            // brilho hextech em dois pontos
            for (const [x, y] of torres.slice(0, 2)) { const g = ctx.createRadialGradient(x, y, 0, x, y, 12); g.addColorStop(0, 'rgba(120,230,255,0.55)'); g.addColorStop(1, 'rgba(120,230,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); }
            docas(R.piltover, 8, 14, 22, 'rgb(150,116,80)');

            // Zaun: casebres amontoados, chaminés, canos, poças tóxicas e fumaça
            const ferrugem = [[110, 76, 54], [84, 78, 68], [124, 96, 62], [66, 82, 62], [98, 62, 48]];
            const zb = [];
            for (let y = by0; y < by1; y += 6.2) for (let x = bx0; x < bx1; x += 6.2) {
                const px = x + sorteio(-2, 2), py = y + sorteio(-2, 2);
                if (!naRegiao(px, py, R.piltover, 2.5) || !ehZaun(px, py) || rnd() < 0.12) continue;
                bloco(px, py, sorteio(4, 8), sorteio(3.5, 7), sorteio(-0.8, 0.8), 1.7, 1.9, ferrugem[(rnd() * ferrugem.length) | 0], sorteio(0.78, 1.05));
                zb.push([px, py]);
            }
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (let t = 0; t < 26 && zb.length > 4; t++) {
                const a = zb[(rnd() * zb.length) | 0]; const b = zb.find((p) => p !== a && Math.hypot(p[0] - a[0], p[1] - a[1]) > 10 && Math.hypot(p[0] - a[0], p[1] - a[1]) < 26);
                if (!b) continue;
                ctx.strokeStyle = 'rgba(40,44,42,0.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
                ctx.strokeStyle = 'rgba(150,158,150,0.45)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 0.5); ctx.lineTo(b[0], a[1] - 0.5); ctx.lineTo(b[0] - 0.5, b[1]); ctx.stroke();
            }
            for (let t = 0; t < 16 && zb.length; t++) {
                const [x, y] = zb[(rnd() * zb.length) | 0];
                ctx.fillStyle = 'rgb(46,44,42)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
                for (let k = 1; k <= 4; k++) { ctx.fillStyle = `rgba(150,170,140,${0.2 - k * 0.035})`; ctx.beginPath(); ctx.arc(x + k * 2.6, y - k * 3, 2.5 + k * 1.7, 0, 7); ctx.fill(); }
            }
            for (let t = 0; t < 9; t++) {
                const x = sorteio(bx0, bx1), y = sorteio(by0, by1);
                if (!naRegiao(x, y, R.piltover, 4) || !ehZaun(x, y)) continue;
                const rr = sorteio(3, 6.5);
                const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.4); g.addColorStop(0, 'rgba(130,255,100,0.55)'); g.addColorStop(1, 'rgba(130,255,100,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2.4, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgb(40,70,34)'; ctx.beginPath(); ctx.ellipse(x, y, rr + 1, rr * 0.7 + 1, 0.4, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgb(138,236,98)'; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.7, 0.4, 0, 7); ctx.fill();
            }
            for (let t = 0; t < 46; t++) {
                const x = sorteio(bx0 - 10, bx1 + 10), y = sorteio(by0 - 10, by1 + 10);
                if (!ehZaun(x, y) || !naRegiao(x, y, R.piltover, 0)) continue;
                const rr = sorteio(14, 30); const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
                g.addColorStop(0, 'rgba(112,170,86,0.16)'); g.addColorStop(1, 'rgba(112,170,86,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
            }
        }
    }

    // Águas de Sentina: portos de piratas, cabanas, fogueiras e navios
    {
        const docasS = docas(R.aguas, 30, 12, 24, 'rgb(112,80,52)');
        for (const [x, y, dx, dy] of docasS) {
            const hx = x - dx * 6 + sorteio(-1.5, 1.5), hy = y - dy * 6 + sorteio(-1.5, 1.5);
            if (!naRegiao(hx, hy, R.aguas, 3)) continue;
            bloco(hx, hy, sorteio(4.5, 6.5), sorteio(3.5, 5), sorteio(-0.6, 0.6), 1.4, 1.6, [132, 96, 62], 1);
            ctx.fillStyle = 'rgba(255,170,60,0.9)'; ctx.beginPath(); ctx.arc(hx + 4, hy + 3, 1.1, 0, 7); ctx.fill();
            const g = ctx.createRadialGradient(hx + 4, hy + 3, 0, hx + 4, hy + 3, 6); g.addColorStop(0, 'rgba(255,170,60,0.35)'); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx + 4, hy + 3, 6, 0, 7); ctx.fill();
        }
        const navios = [];
        for (let t = 0; t < 8000 && navios.length < 11; t++) {
            const x = sorteio(1750, 2200), y = sorteio(600, 1130); const i = (y | 0) * W + (x | 0);
            if (terra[i] || dTerra[i] < 13 || dTerra[i] > 44 || navios.some(([a, b]) => Math.hypot(a - x, b - y) < 64)) continue;
            if (amostra(camposB2[R.aguas], LW, LH, x / W, y / H) < 0.1) continue;
            navios.push([x, y, sorteio(0, 6.28)]);
        }
        for (const [x, y, a] of navios) {
            const ca = Math.cos(a), sa = Math.sin(a);
            ctx.setTransform(ca, sa, -sa, ca, x, y);
            ctx.fillStyle = 'rgba(235,248,250,0.30)'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-30, -4); ctx.lineTo(-30, 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(6,16,26,0.35)'; ctx.beginPath(); ctx.ellipse(3, 3, 11, 4.2, 0, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgb(72,46,28)'; ctx.beginPath(); ctx.moveTo(-9, -3.4); ctx.quadraticCurveTo(0, -5.6, 11, 0); ctx.quadraticCurveTo(0, 5.6, -9, 3.4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgb(138,102,66)'; ctx.fillRect(-7, -1.6, 13, 3.2);
            ctx.fillStyle = rnd() < 0.7 ? 'rgb(34,30,36)' : 'rgb(226,216,190)';
            for (const mx of [-3, 3]) { ctx.beginPath(); ctx.moveTo(mx, -1.2); ctx.lineTo(mx + 5, -6.5); ctx.lineTo(mx + 5, 6.5); ctx.lineTo(mx, 1.2); ctx.closePath(); ctx.fill(); }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    // ---- fronteiras entre regiões ----
    const borda = new Float32Array(N);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (!terra[i]) continue;
        const a = regiao[i];
        if (regiao[i + 2] !== a && terra[i + 2] && regiao[i + 2] !== 10 && a !== 10) borda[i] = 1;
        else if (regiao[i + 2 * W] !== a && terra[i + 2 * W] && regiao[i + 2 * W] !== 10 && a !== 10) borda[i] = 1;
    }
    const bordaS = borrar(borda, W, H, 1, 1);
    const cvB = ctx.getImageData(0, 0, W, H); const pb = cvB.data;
    for (let i = 0; i < N; i++) {
        const b = clamp(bordaS[i] * 2.2, 0, 1); if (b < 0.02) continue;
        const y = (i / W) | 0, x = i % W;
        const tracejado = ((x + y) % 26) < 19 ? 1 : 0.35;
        const k = b * 0.75 * tracejado, o = i * 4;
        pb[o] = lerp(pb[o], 46, k); pb[o + 1] = lerp(pb[o + 1], 32, k); pb[o + 2] = lerp(pb[o + 2], 24, k);
    }
    ctx.putImageData(cvB, 0, 0);

    // ---- nuvens, grade e vinheta ----
    const nuv = ctx.getImageData(0, 0, W, H); const pn = nuv.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        if (terra[i]) continue;
        // grade sutil de latitude/longitude só no mar
        const gx = x % 160, gy = y % 160;
        const grade = (gx < 1.2 || gy < 1.2) ? 0.07 : 0;
        // brumas
        const nv = fbm(ruidoA, x * 0.0025 + 70, y * 0.0025 + 30, 5);
        const nuvem = suave(0.64, 0.8, nv) * 0.34;
        // a Ilha das Sombras tem uma névoa verde
        const ilhaK = amostra(camposB2[R.ilha], LW, LH, x / W, y / H);
        const nebl = ilhaK * (0.35 + 0.65 * suave(0.35, 0.6, fbm(ruidoC, x * 0.006, y * 0.006, 4)));
        const aguas = amostra(camposB2[R.aguas], LW, LH, x / W, y / H) * 0.5;
        const k = nuvem + grade;
        pn[o] = lerp(pn[o], 232, k); pn[o + 1] = lerp(pn[o + 1], 240, k); pn[o + 2] = lerp(pn[o + 2], 246, k);
        pn[o] = lerp(pn[o], 18, nebl * 0.55 + aguas * 0.25); pn[o + 1] = lerp(pn[o + 1], 70, nebl * 0.55 + aguas * 0.25); pn[o + 2] = lerp(pn[o + 2], 66, nebl * 0.55 + aguas * 0.25);
    }
    // vinheta
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
        const v = 1 - Math.pow(Math.max(0, Math.hypot(dx * 0.85, dy) - 0.7), 2) * 0.9;
        pn[o] *= v; pn[o + 1] *= v; pn[o + 2] *= v;
    }
    ctx.putImageData(nuv, 0, 0);

    // ---- rosa dos ventos ----
    const cx = W * 0.146, cy = H * 0.895, rr = H * 0.06;
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(214,200,160,0.85)'; ctx.fillStyle = 'rgba(214,200,160,0.85)';
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, rr * 0.96, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, rr * 0.74, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4 - Math.PI / 2; const comp = k % 2 === 0 ? rr * 1.0 : rr * 0.62;
        const lado = k % 2 === 0 ? 0.16 : 0.1;
        ctx.fillStyle = k % 2 === 0 ? 'rgba(226,212,170,0.95)' : 'rgba(170,158,124,0.9)';
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * comp, Math.sin(ang) * comp);
        ctx.lineTo(Math.cos(ang + Math.PI / 2) * rr * lado, Math.sin(ang + Math.PI / 2) * rr * lado);
        ctx.lineTo(0, 0); ctx.lineTo(Math.cos(ang - Math.PI / 2) * rr * lado, Math.sin(ang - Math.PI / 2) * rr * lado); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,218,180,0.95)'; ctx.font = `bold ${rr * 0.34}px serif`; ctx.textAlign = 'center';
    ctx.fillText('N', 0, -rr * 1.14);
    ctx.restore();

    fs.writeFileSync(SAIDA, img.toBuffer('image/jpeg', 86));
    log(`salvo em ${SAIDA} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)`);
}

principal().catch((e) => { console.error(e); process.exit(1); });
