// ==========================================
// 🪐 ORBITAS DO MAPA DO UNIVERSO — lógica pura. Os astros giram em "oitos" (lemniscatas) em volta das duas estrelas, cada
// um com o seu período. Sem coordenação, dois astros podiam se cruzar no ponto central (onde todos os oitos se encontram) ou
// passar um por cima do outro. Aqui as trilhas são amostradas e a FASE de cada astro (em que ponto da trilha ele começa) é
// escolhida por simulação para manter a maior distância possível entre eles durante todo o ciclo. O visual não muda:
// só o ponto de partida de cada astro.
// ==========================================

const PASSOS_BEZIER = 80;

// Os 4 pedaços de Bezier do "oito" (mesmo desenho de MapaMundi.jsx > getPathCaminho): [p0, c1, c2, p3].
export function segmentosDoOito(cx, cy, raioX, ry) {
    return [
        [[cx, cy], [cx + raioX * 0.375, cy - ry], [cx + raioX, cy - ry * 0.75], [cx + raioX, cy]],
        [[cx + raioX, cy], [cx + raioX, cy + ry * 0.75], [cx + raioX * 0.375, cy + ry], [cx, cy]],
        [[cx, cy], [cx - raioX * 0.375, cy - ry], [cx - raioX, cy - ry * 0.75], [cx - raioX, cy]],
        [[cx - raioX, cy], [cx - raioX, cy + ry * 0.75], [cx - raioX * 0.375, cy + ry], [cx, cy]]
    ];
}

function pontoBezier(seg, t) {
    const u = 1 - t;
    const [p0, p1, p2, p3] = seg;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// Pontos ao longo da trilha com o comprimento acumulado (offset-distance do CSS anda por comprimento de arco).
export function amostrarTrilha(segmentos) {
    const pontos = [];
    const acumulado = [];
    let total = 0;
    segmentos.forEach((seg, si) => {
        for (let i = si === 0 ? 0 : 1; i <= PASSOS_BEZIER; i++) {
            const p = pontoBezier(seg, i / PASSOS_BEZIER);
            if (pontos.length > 0) {
                const q = pontos[pontos.length - 1];
                total += Math.hypot(p[0] - q[0], p[1] - q[1]);
            }
            pontos.push(p);
            acumulado.push(total);
        }
    });
    return { pontos, acumulado, total };
}

// Posição [x, y] depois de percorrer a fração (0-1, dá voltas) da trilha.
export function posicaoNaTrilha(trilha, fracao) {
    const f = ((fracao % 1) + 1) % 1;
    const alvo = f * trilha.total;
    const { acumulado, pontos } = trilha;
    let lo = 0, hi = acumulado.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (acumulado[mid] <= alvo) lo = mid; else hi = mid;
    }
    const span = acumulado[hi] - acumulado[lo] || 1;
    const k = (alvo - acumulado[lo]) / span;
    return [pontos[lo][0] + (pontos[hi][0] - pontos[lo][0]) * k, pontos[lo][1] + (pontos[hi][1] - pontos[lo][1]) * k];
}

const mdc = (a, b) => (b === 0 ? a : mdc(b, a % b));
const mmc = (a, b) => (a * b) / mdc(a, b);

// "40s" ou 40 -> 40 (segundos, inteiro mínimo 1).
export function segundosDe(tempo) {
    const n = Math.round(parseFloat(tempo));
    return Number.isFinite(n) && n > 0 ? n : 1;
}

// Duração do ciclo completo (mínimo múltiplo comum dos períodos), limitado para a simulação não explodir.
export function cicloComum(periodos, maximo = 1200) {
    const c = periodos.map(segundosDe).reduce((acc, p) => mmc(acc, p), 1);
    return Math.min(c, maximo);
}

// Menor folga (distância entre bordas) entre o astro `corpo` com a fase dada e cada astro já colocado, durante todo o ciclo.
function menorFolga(corpo, fase, colocados, ciclo, passoSeg) {
    let folga = Infinity;
    for (let t = 0; t < ciclo; t += passoSeg) {
        const a = posicaoNaTrilha(corpo.trilha, t / segundosDe(corpo.periodo) + fase);
        for (const outro of colocados) {
            const b = posicaoNaTrilha(outro.trilha, t / segundosDe(outro.periodo) + outro.fase);
            const f = Math.hypot(a[0] - b[0], a[1] - b[1]) - corpo.raio - outro.raio;
            if (f < folga) folga = f;
        }
    }
    return folga;
}

// Folga mínima de uma trilha até obstáculos fixos (estrelas): quanto sobra entre a borda do astro e a do obstáculo.
export function folgaAteObstaculos(trilha, raioCorpo, obstaculos) {
    let folga = Infinity;
    trilha.pontos.forEach(p => {
        obstaculos.forEach(o => { const f = Math.hypot(p[0] - o.x, p[1] - o.y) - raioCorpo - o.raio; if (f < folga) folga = f; });
    });
    return folga;
}

// Escolhe a fase (0-1) de cada astro. `corpos`: [{ id, trilha, periodo, raio }]. O primeiro fica com a fase pedida (ou 0);
// cada seguinte recebe, entre `candidatos` fases, a que deixa a MAIOR folga mínima para os já colocados.
// Devolve { [id]: fase }.
export function escolherFases(corpos, { candidatos = 48, passoSeg = 0.5, faseInicial = 0 } = {}) {
    if (!Array.isArray(corpos) || corpos.length === 0) return {};
    const ciclo = cicloComum(corpos.map(c => c.periodo));
    const colocados = [];
    const fases = {};
    corpos.forEach((corpo, i) => {
        let melhorFase = faseInicial;
        if (i > 0) {
            let melhorFolga = -Infinity;
            for (let k = 0; k < candidatos; k++) {
                const fase = k / candidatos;
                const folga = menorFolga(corpo, fase, colocados, ciclo, passoSeg);
                if (folga > melhorFolga + 1e-9) { melhorFolga = folga; melhorFase = fase; }
            }
        }
        fases[corpo.id] = melhorFase;
        colocados.push({ ...corpo, fase: melhorFase });
    });
    return fases;
}

// Folga mínima entre TODOS os pares (para conferir o resultado).
export function folgaMinimaGeral(corpos, fases, passoSeg = 1) {
    const ciclo = cicloComum(corpos.map(c => c.periodo));
    let folga = Infinity;
    for (let i = 0; i < corpos.length; i++) {
        for (let j = i + 1; j < corpos.length; j++) {
            const f = menorFolga({ ...corpos[i] }, fases[corpos[i].id] || 0, [{ ...corpos[j], fase: fases[corpos[j].id] || 0 }], ciclo, passoSeg);
            if (f < folga) folga = f;
        }
    }
    return folga;
}

// Atraso de animação CSS (negativo = já começa no meio da volta) para a fase e o período dados.
export function atrasoDaFase(fase, periodo) {
    const s = segundosDe(periodo);
    return `${(-(fase % 1) * s).toFixed(3)}s`;
}
