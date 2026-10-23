// ==========================================
// 🎲 FÍSICA DO DADO — lógica pura (sem THREE/React). Simula o arremesso de um dado: queda com gravidade, quiques no chão
// (cada vez mais fracos), atrito, paredes laterais e um giro que vai morrendo. O resultado da rolagem JÁ É CONHECIDO: o giro
// livre é corrigido suavemente durante a volta toda, de modo que o dado termine com a face certa virada pra câmera.
// Quaternions são [x, y, z, w]; posições, [x, y, z] em unidades da cena 3D.
// ==========================================

export const DT = 1 / 60;
const GRAVIDADE = 30;
const RESTITUICAO = 0.5;      // fração da velocidade vertical que sobra a cada quique
const ATRITO_QUIQUE = 0.78;   // fração da velocidade horizontal que sobra a cada quique
const ATRITO_ROLAGEM = 3.2;   // decaimento exponencial (1/s) do deslize no chão
const VEL_MIN_QUIQUE = 2.4;   // abaixo disto o dado para de quicar e só rola
const TEMPO_ASSENTAR = 0.4;   // s de rolagem final depois do último quique
const TEMPO_MAXIMO = 6;       // s: trava de segurança
const TEMPO_DESLIZE_CENTRO = 0.35;

// ---------- quaternions ----------
export const QID = [0, 0, 0, 1];

export function qMul(a, b) {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
}

export function qNorm(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qSlerp(a, b, t) {
    let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (cos < 0) { cos = -cos; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    if (cos > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
    const ang = Math.acos(cos);
    const s = Math.sin(ang);
    const wa = Math.sin((1 - t) * ang) / s;
    const wb = Math.sin(t * ang) / s;
    return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

// Gira q pela velocidade angular w (rad/s, referencial do mundo) durante dt.
export function qIntegrar(q, w, dt) {
    const ang = Math.hypot(w[0], w[1], w[2]) * dt;
    if (ang < 1e-9) return q;
    const k = Math.sin(ang / 2) / (Math.hypot(w[0], w[1], w[2]));
    const dq = [w[0] * k, w[1] * k, w[2] * k, Math.cos(ang / 2)];
    return qNorm(qMul(dq, q));
}

const suave = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// Simulação do movimento (sem rotação de correção). `vx` entra por parâmetro para poder ser calibrado.
function simularMovimento({ x0, y0, vx, vy, piso, apoio, meiaLargura, giroInicial }) {
    const yChao = piso + apoio;
    let x = x0, y = Math.max(y0, yChao), vX = vx, vY = vy;
    let w = [...giroInicial];
    let t = 0;
    let quicando = true;
    let tFimQuiques = null;
    const quadros = [];
    const impactos = [];

    while (t < TEMPO_MAXIMO) {
        quadros.push({ p: [x, y, 0], w: [...w] });
        // física
        if (quicando) vY -= GRAVIDADE * DT;
        x += vX * DT;
        y += vY * DT;
        if (x > meiaLargura) { x = meiaLargura; vX = -Math.abs(vX) * 0.6; }
        if (x < -meiaLargura) { x = -meiaLargura; vX = Math.abs(vX) * 0.6; }

        if (quicando && y <= yChao && vY < 0) {
            y = yChao;
            const forca = Math.abs(vY);
            impactos.push({ t, forca });
            if (forca < VEL_MIN_QUIQUE) {
                quicando = false;
                vY = 0;
                tFimQuiques = t;
            } else {
                vY = forca * RESTITUICAO;
                vX *= ATRITO_QUIQUE;
                // o impacto rola o dado para o lado em que ele anda e amortece o resto do giro
                w = [w[0] * 0.65, w[1] * 0.65, -vX / Math.max(apoio, 0.5) + w[2] * 0.3];
            }
        }
        if (!quicando) {
            y = yChao;
            vX *= Math.exp(-ATRITO_ROLAGEM * DT);
            w = [w[0] * Math.exp(-3 * DT), w[1] * Math.exp(-3 * DT), -vX / Math.max(apoio, 0.5)];
            if (t >= tFimQuiques + TEMPO_ASSENTAR) { quadros.push({ p: [x, y, 0], w: [...w] }); break; }
        }
        t += DT;
    }
    return { quadros, impactos };
}

// Lançamento completo: devolve { dt, duracao, quadros: [{ p, q }], impactos, pouso }.
//   inicio: [x, y]   velocidade: [vx, vy]   arena: { meiaLargura, piso, apoio }   alvo: quaternion final (face do resultado)
//   centrar: se verdadeiro, ajusta vx para terminar em `xFinal` (padrão 0); se falso, deixa onde parar e depois desliza ao centro.
export function simularLancamento({ inicio = [-4, 1], velocidade = [8, 4], arena, alvo, giroInicial = [14, 17, 9], qInicial = [0.2, 0.3, 0.1, 0.92], centrar = true, xFinal = 0 }) {
    const { meiaLargura, piso, apoio } = arena;
    const comum = { x0: inicio[0], y0: inicio[1], vy: velocidade[1], piso, apoio, meiaLargura, giroInicial };

    let vx = velocidade[0];
    if (centrar) {
        // O deslocamento horizontal é linear em vx (sem paredes no teste): calibra para terminar em xFinal.
        const teste = simularMovimento({ ...comum, vx: 1, meiaLargura: 1e9 });
        const ultimo = teste.quadros[teste.quadros.length - 1].p[0];
        const alcance = ultimo - inicio[0];
        if (Math.abs(alcance) > 1e-6) vx = (xFinal - inicio[0]) / alcance;
    }
    const mov = simularMovimento({ ...comum, vx });

    // rotação livre integrada + correção suave até a face certa
    let qSpin = qNorm(qInicial);
    const livres = mov.quadros.map(f => { const atual = qSpin; qSpin = qIntegrar(qSpin, f.w, DT); return atual; });
    const fim = qIntegrar(livres[livres.length - 1], mov.quadros[mov.quadros.length - 1].w, DT);
    const alvoN = qNorm(alvo || QID);
    const erro = qNorm(qMul(alvoN, qInv(fim)));
    const n = mov.quadros.length;
    const quadros = mov.quadros.map((f, i) => {
        const corr = qSlerp(QID, erro, suave(i / (n - 1)));
        return { p: f.p, q: qNorm(qMul(corr, livres[i])) };
    });
    quadros[n - 1].q = alvoN;

    // sem centrar: depois de parar, desliza até o centro
    if (!centrar) {
        const ultimoP = quadros[n - 1].p;
        const passos = Math.round(TEMPO_DESLIZE_CENTRO / DT);
        for (let i = 1; i <= passos; i++) {
            const k = 1 - Math.pow(1 - i / passos, 3);
            quadros.push({ p: [ultimoP[0] + (xFinal - ultimoP[0]) * k, ultimoP[1], 0], q: alvoN });
        }
    }

    return {
        dt: DT,
        duracao: (quadros.length - 1) * DT,
        quadros,
        impactos: mov.impactos,
        pouso: quadros[quadros.length - 1].p
    };
}

// Posição/rotação interpoladas no instante t (s) da simulação.
export function quadroEm(simulacao, t) {
    const { quadros, dt } = simulacao;
    const f = Math.min(Math.max(t, 0) / dt, quadros.length - 1);
    const i = Math.floor(f);
    const j = Math.min(i + 1, quadros.length - 1);
    const k = f - i;
    const a = quadros[i], b = quadros[j];
    return {
        p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, 0],
        q: qSlerp(a.q, b.q, k)
    };
}

// Velocidade de arremesso a partir de um gesto de arrastar (amostras { x, y, t(ms) } em unidades da cena), limitada.
export function velocidadeDoGesto(amostras, { maximo = 22, janelaMs = 90 } = {}) {
    if (!Array.isArray(amostras) || amostras.length < 2) return [0, 0];
    const ultima = amostras[amostras.length - 1];
    let ref = amostras[0];
    for (let i = amostras.length - 2; i >= 0; i--) { if (ultima.t - amostras[i].t >= janelaMs) { ref = amostras[i]; break; } }
    const dtSeg = Math.max((ultima.t - ref.t) / 1000, 0.016);
    let vx = (ultima.x - ref.x) / dtSeg;
    let vy = (ultima.y - ref.y) / dtSeg;
    const mod = Math.hypot(vx, vy);
    if (mod > maximo) { vx = vx / mod * maximo; vy = vy / mod * maximo; }
    return [vx, vy];
}
