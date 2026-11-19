// ==========================================
// 👣 QUADRADOS PERCORRIDOS NO TURNO — contador mínimo, puro (sem imports). Fonte da escala `escalaMovimento` dos efeitos
// (core/efeitos-resolver.js): "+NdM de dano por quadrado percorrido", "+N de acerto por quadrado" etc., SEMPRE com um teto.
//   ficha.combate.quadradosNoTurno = quadrados que o PRÓPRIO token do portador andou no Mapa desde o início do turno dele.
// • Soma quando o portador move o próprio token (components/mapa/MapaFormContext.jsx > handleCellClick), SÓ em combate (iniciativa > 0) e na mesma cena.
// • Movimento grande (teleporte) conta no máximo LIMITE_QUADRADOS_POR_MOVIMENTO de uma vez; o contador inteiro fica em LIMITE_QUADRADOS_NO_TURNO.
// • Volta a ZERO no início do turno do portador, no inicioDeLuta e no fimDeLuta (como core/ataquesNoTurno.js).
// • `escalaMovimento: { fator, max }`: o efeito vale fator x min(quadrados, max). O teto `max` (1..LIMITE_MAX_ESCALA_MOVIMENTO) é OBRIGATÓRIO
//   ("depende da técnica"): sem `max` válido o efeito NÃO escala (e o de dado de dano não dá dado nenhum).
// ==========================================

export const CAMINHO_QUADRADOS_NO_TURNO = 'combate/quadradosNoTurno';
export const LIMITE_QUADRADOS_POR_MOVIMENTO = 30;
export const LIMITE_QUADRADOS_NO_TURNO = 1000;
export const LIMITE_MAX_ESCALA_MOVIMENTO = 100;
export const LIMITE_FATOR_MOVIMENTO = 1e6;

// Atributos de efeito que aceitam a escala por movimento (o dado de dano usa "NdM por quadrado").
export const ATRIBUTOS_COM_ESCALA_MOVIMENTO = ['dano_dados', 'acerto', 'evasiva', 'resistencia', 'dano'];
export const efeitoAceitaEscalaMovimento = (atributo) => ATRIBUTOS_COM_ESCALA_MOVIMENTO.includes(String(atributo ?? '').trim().toLowerCase());

export function quadradosNoTurno(ficha) {
    const n = Math.floor(Number(ficha && ficha.combate && ficha.combate.quadradosNoTurno));
    return Number.isFinite(n) && n > 0 ? Math.min(LIMITE_QUADRADOS_NO_TURNO, n) : 0;
}

// Quadrados que um movimento de `de` para `para` conta (maior diferença entre x, y e a altura convertida pela escala da cena), já com o teto por movimento.
export function quadradosDoMovimento(de, para, escala = 1.5) {
    if (!de || !para) return 0;
    const esc = Number(escala) > 0 ? Number(escala) : 1.5;
    const dx = Math.abs((Number(de.x) || 0) - (Number(para.x) || 0));
    const dy = Math.abs((Number(de.y) || 0) - (Number(para.y) || 0));
    const dz = Math.floor(Math.abs((Number(de.z) || 0) - (Number(para.z) || 0)) / esc);
    return Math.min(LIMITE_QUADRADOS_POR_MOVIMENTO, Math.max(dx, dy, dz));
}

// Registra o movimento do próprio token (muta o rascunho). Só em combate e na mesma cena; sem posição de origem não conta. Devolve quantos quadrados somou.
export function registrarMovimento(ficha, de, para, escala = 1.5) {
    if (!ficha || typeof ficha !== 'object' || !de || !para) return 0;
    if (!(Number(ficha.iniciativa) > 0)) return 0;
    if ((de.cenaId || 'default') !== (para.cenaId || 'default')) return 0;
    const q = quadradosDoMovimento(de, para, escala);
    if (q <= 0) return 0;
    if (!ficha.combate || typeof ficha.combate !== 'object') ficha.combate = {};
    ficha.combate.quadradosNoTurno = Math.min(LIMITE_QUADRADOS_NO_TURNO, quadradosNoTurno(ficha) + q);
    return q;
}

// Zera o contador. Devolve true se havia algo a zerar.
export function zerarQuadradosNoTurno(ficha) {
    if (!ficha || !ficha.combate || typeof ficha.combate !== 'object') return false;
    if (quadradosNoTurno(ficha) === 0) return false;
    ficha.combate.quadradosNoTurno = 0;
    return true;
}

// { fator, max } válido ou null. fator finito, diferente de 0 (até LIMITE_FATOR_MOVIMENTO); max inteiro de 1 a LIMITE_MAX_ESCALA_MOVIMENTO (sem max = null).
export function normalizarEscalaMovimento(bruta) {
    if (!bruta || typeof bruta !== 'object') return null;
    const fator = Number(bruta.fator);
    const max = Number(bruta.max);
    if (!Number.isFinite(fator) || fator === 0 || Math.abs(fator) > LIMITE_FATOR_MOVIMENTO) return null;
    if (!Number.isInteger(max) || max < 1 || max > LIMITE_MAX_ESCALA_MOVIMENTO) return null;
    return { fator, max };
}

// Quadrados que contam para a escala: só em combate (iniciativa > 0), limitados ao teto do efeito.
export function quadradosContados(ficha, max) {
    if (!ficha || !(Number(ficha.iniciativa) > 0)) return 0;
    const m = Number(max);
    if (!Number.isInteger(m) || m < 1) return 0;
    return Math.min(quadradosNoTurno(ficha), Math.min(m, LIMITE_MAX_ESCALA_MOVIMENTO));
}
