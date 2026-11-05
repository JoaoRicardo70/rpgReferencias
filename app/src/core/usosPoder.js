// ==========================================
// 🔁 USOS LIMITADOS — lógica pura. Uma Habilidade/Poder/Forma pode ter um limite de usos:
//   usosMax — quantas vezes pode ser LIGADA (0 ou vazio = ilimitado)
//   usosPor — 'cena' (renova ao trocar de cena ou ao descansar) ou 'descanso' (renova ao descansar)
// Cada vez que a técnica é ligada gasta 1 uso. O contador fica em ficha.combate.usosPoderes[idDoPoder] = { n, cena }.
// O uso "por cena" só conta na cena em que foi gasto: ao trocar de cena o contador antigo deixa de valer sozinho, sem escrever na
// ficha de ninguém. Descansar (core/vitals.js > descansarCompleto) apaga todos os contadores.
// ==========================================
export const LIMITE_USOS = 99;

export const PERIODOS_DE_USO = [
    { id: 'cena', rotulo: 'por cena' },
    { id: 'descanso', rotulo: 'por descanso' },
];
const IDS_PERIODO = new Set(PERIODOS_DE_USO.map(p => p.id));

// { max, por } ou null (ilimitado). Número inválido, zero ou negativo = ilimitado; período desconhecido = 'cena'.
export function normalizarUsos(max, por) {
    const n = Math.floor(Number(String(max ?? '').replace(',', '.')));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { max: Math.min(LIMITE_USOS, n), por: IDS_PERIODO.has(por) ? por : 'cena' };
}

// Limite de usos de um poder, a partir dos campos usosMax/usosPor dele; null = ilimitado.
export function limiteDeUsos(poder) {
    return poder ? normalizarUsos(poder.usosMax, poder.usosPor) : null;
}

const mesmaCena = (a, b) => String(a ?? 'default') === String(b ?? 'default');

// Quantos usos já foram gastos agora (os "por cena" só contam na cena em que foram gastos).
export function usosGastos(ficha, poder, cenaAtivaId = 'default') {
    const limite = limiteDeUsos(poder);
    if (!limite) return 0;
    const reg = ficha && ficha.combate && ficha.combate.usosPoderes ? ficha.combate.usosPoderes[poder.id] : null;
    if (!reg || typeof reg !== 'object') return 0;
    if (limite.por === 'cena' && !mesmaCena(reg.cena, cenaAtivaId)) return 0;
    return Math.max(0, Math.floor(Number(reg.n) || 0));
}

// Quantos usos restam (Infinity = ilimitado).
export function usosRestantes(ficha, poder, cenaAtivaId = 'default') {
    const limite = limiteDeUsos(poder);
    if (!limite) return Infinity;
    return Math.max(0, limite.max - usosGastos(ficha, poder, cenaAtivaId));
}

export function podeUsar(ficha, poder, cenaAtivaId = 'default') {
    return usosRestantes(ficha, poder, cenaAtivaId) > 0;
}

// Gasta 1 uso NO RASCUNHO da ficha (use dentro de updateFicha). Devolve false (sem mexer) se não restar uso; true se não há limite.
export function gastarUso(ficha, poder, cenaAtivaId = 'default') {
    const limite = limiteDeUsos(poder);
    if (!limite) return true;
    if (!podeUsar(ficha, poder, cenaAtivaId)) return false;
    if (!ficha.combate) ficha.combate = {};
    if (!ficha.combate.usosPoderes) ficha.combate.usosPoderes = {};
    ficha.combate.usosPoderes[poder.id] = { n: usosGastos(ficha, poder, cenaAtivaId) + 1, cena: String(cenaAtivaId ?? 'default') };
    return true;
}

// Descanso: apaga todos os contadores (tanto "por cena" quanto "por descanso"). Use no rascunho da ficha.
export function restaurarUsos(ficha) {
    if (ficha && ficha.combate && ficha.combate.usosPoderes) delete ficha.combate.usosPoderes;
}

// Texto curto para o cartão: "1/2 usos (por cena)". Vazio se não há limite.
export function descreverUsos(ficha, poder, cenaAtivaId = 'default') {
    const limite = limiteDeUsos(poder);
    if (!limite) return '';
    const rotulo = (PERIODOS_DE_USO.find(p => p.id === limite.por) || {}).rotulo || limite.por;
    return `${usosRestantes(ficha, poder, cenaAtivaId)}/${limite.max} usos (${rotulo})`;
}
