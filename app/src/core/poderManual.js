// ==========================================
// ✏️ PODER MANUAL DE UM TOKEN (Mestre) — ler o número que o Mestre digita e escalar o Poder atual num clique.
// Aceita pt-BR ("1.000.000,5", "1,5"), notação científica ("1e10") e sufixos ("50 bi", "12 milhões", "300k", "2 tri").
// Módulo puro: quem grava é o Mapa (salvarDummie).
// ==========================================
const SUFIXOS = [
    // ordem importa: os mais longos primeiro
    ['trilhoes', 1e12], ['trilhao', 1e12], ['tri', 1e12], ['t', 1e12],
    ['bilhoes', 1e9], ['bilhao', 1e9], ['bi', 1e9], ['b', 1e9],
    ['milhoes', 1e6], ['milhao', 1e6], ['mi', 1e6], ['m', 1e6],
    ['mil', 1e3], ['k', 1e3],
];

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Texto -> número (>= 0) ou null quando não dá para entender.
export function lerPoderDigitado(entrada) {
    if (typeof entrada === 'number') return Number.isFinite(entrada) && entrada >= 0 ? entrada : null;
    if (typeof entrada !== 'string') return null;
    let t = semAcento(entrada.trim().toLowerCase());
    if (t === '') return null;
    let fator = 1;
    const m = /^([0-9.,e+-]+)\s*([a-z]*)$/.exec(t);
    if (!m) return null;
    let numero = m[1];
    const sufixo = m[2];
    if (sufixo) {
        const achado = SUFIXOS.find(([nome]) => nome === sufixo);
        if (!achado) return null;
        fator = achado[1];
    }
    // "1e10" já é um número; senão pt-BR: vírgula decimal e pontos de milhar ("1.000.000", "1.5" = decimal).
    if (!/e/.test(numero)) {
        if (numero.includes(',')) numero = numero.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(numero)) numero = numero.replace(/\./g, '');
    }
    const v = Number(numero) * fator;
    return Number.isFinite(v) && v >= 0 ? v : null;
}

// Poder atual escalado por um fator (x2, x10, +25% = 1,25...). null se o atual não for um número válido.
export function escalarPoder(atual, fator) {
    const a = Number(atual);
    const f = Number(fator);
    if (!Number.isFinite(a) || a < 0 || !Number.isFinite(f) || f < 0) return null;
    const v = a * f;
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

// Token (dummie) com o Poder definido à mão: se veio de uma ficha de NPC, fica "desvinculado" (o Poder vivo não sobrescreve).
export function dummieComPoderManual(dummie, poder) {
    const v = lerPoderDigitado(poder);
    if (!dummie || v === null) return null;
    return { ...dummie, poderCalculado: Math.round(v * 100) / 100, ...(dummie.fichaOrigem ? { poderDesvinculado: true } : {}) };
}

// Volta o token a seguir a ficha de origem (tira o desvínculo; o Poder vivo preenche o número em seguida). null sem ficha de origem.
export function dummieSeguindoFicha(dummie) {
    if (!dummie || !dummie.fichaOrigem) return null;
    const { poderDesvinculado, ...resto } = dummie;
    return resto;
}
