// ==========================================
// PONTOS DE PRESTÍGIO CONCEDIDOS PELO MESTRE + ASCENSÃO — lógica pura (sem React) usada pela
// página "Mecânicas de Ascensão e Divisores" (Ficha Def/Marcados.jsx).
//
// Pedido do usuário: em vez de o jogador digitar livremente o Prestígio de cada categoria (e
// "resetar" à mão pra aplicar Ascensões), o Mestre/Co-Mestre informa quantos Pontos de Prestígio
// o personagem recebeu (ficha.prestigioPontosDisponiveis) e o jogador só distribui esses pontos.
//   - ficha.prestigioPontosDistribuidos[cat]: quanto o jogador já distribuiu em cada categoria
//     desde a última Ascensão — é o limite de quanto ele pode DESFAZER (corrigir um erro)
//     sozinho; reduzir além disso só o Mestre.
//   - Quando TODAS as 6 categorias chegam a 100, o jogador pode Ascender: cada categoria volta
//     pra 1 (o excedente acima de 100 é preservado) e a Ascensão Base sobe 1. O Poder Calculado
//     não cai: core/poder.js > getBaseEquivalenteAscensao repõe os 100 pontos de cada vital, e o
//     Status não mexe nos atributos (os pontos que o pool já deu continuam lá).
// ==========================================

export const CATEGORIAS_PRESTIGIO = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'];
export const PRESTIGIO_PARA_ASCENDER = 100;

// Mesma escala de handleTabelaChange/getBasePFor (Marcados.jsx) e core/poder.js.
export const MULTS_BASE_PRESTIGIO = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export function getPontosPrestigioDisponiveis(ficha) {
    return Math.max(0, Math.floor(num(ficha?.prestigioPontosDisponiveis)));
}

export function getPontosDistribuidos(ficha, cat) {
    return Math.max(0, Math.floor(num(ficha?.prestigioPontosDistribuidos?.[cat])));
}

// Base bruta que representa `prestigio` na categoria (vida/mana/aura/chakra/corpo). Usa ceil pra
// que a leitura de volta (getBasePFor: floor(base / mult * div)) dê exatamente o mesmo Prestígio
// mesmo com divisores "quebrados" (ex.: 3 / 0.1 = 29.999... -> floor lia 2 em vez de 3).
export function calcularBaseDoPrestigio(cat, prestigio, divisor) {
    const div = num(divisor) > 0 ? num(divisor) : 1;
    const mult = MULTS_BASE_PRESTIGIO[cat] || 1;
    const valor = Math.ceil(((Math.max(0, num(prestigio))) / div) * mult - 1e-9);
    return Number.isFinite(valor) ? Math.max(0, valor) : 0;
}

// Valida uma mudança de Prestígio feita pelo JOGADOR (o Mestre edita livre, sem passar por aqui).
// Retorna { ok, delta, motivo }.
export function validarDistribuicaoPrestigio(ficha, cat, prestigioAtual, prestigioNovo) {
    const novo = num(prestigioNovo);
    if (!Number.isInteger(novo) || novo < 0) {
        return { ok: false, delta: 0, motivo: 'O Prestígio precisa ser um número inteiro (0 ou mais).' };
    }
    const delta = novo - Math.floor(num(prestigioAtual));
    if (delta === 0) return { ok: false, delta: 0, motivo: null };
    if (delta > 0) {
        const disponiveis = getPontosPrestigioDisponiveis(ficha);
        if (delta > disponiveis) {
            return { ok: false, delta, motivo: `Você só tem ${disponiveis} Ponto(s) de Prestígio para distribuir (tentou usar ${delta}). Peça mais ao Mestre.` };
        }
        return { ok: true, delta, motivo: null };
    }
    const desfazivel = getPontosDistribuidos(ficha, cat);
    if (-delta > desfazivel) {
        return { ok: false, delta, motivo: desfazivel > 0
            ? `Você só pode desfazer os ${desfazivel} ponto(s) que distribuiu nesta categoria. Para reduzir mais, peça ao Mestre.`
            : 'Você não distribuiu pontos nesta categoria desde a última Ascensão. Para reduzir, peça ao Mestre.' };
    }
    return { ok: true, delta, motivo: null };
}

// Debita/devolve os pontos da distribuição do jogador (muta o rascunho Immer).
export function registrarDistribuicaoPrestigio(ficha, cat, delta) {
    if (!ficha || !delta) return;
    ficha.prestigioPontosDisponiveis = Math.max(0, getPontosPrestigioDisponiveis(ficha) - delta);
    if (!ficha.prestigioPontosDistribuidos) ficha.prestigioPontosDistribuidos = {};
    ficha.prestigioPontosDistribuidos[cat] = Math.max(0, getPontosDistribuidos(ficha, cat) + delta);
}

export function podeAscender(prestigiosPorCategoria) {
    return CATEGORIAS_PRESTIGIO.every((cat) => num(prestigiosPorCategoria?.[cat]) >= PRESTIGIO_PARA_ASCENDER);
}

// Prestígio da categoria depois de Ascender: volta pra 1, mas o que passou de 100 não se perde
// (100 -> 1, 130 -> 30), pra Ascender nunca custar Prestígio já conquistado.
export function prestigioAposAscensao(prestigio) {
    return Math.max(1, Math.floor(num(prestigio)) - PRESTIGIO_PARA_ASCENDER);
}

// Aplica a Ascensão (muta o rascunho Immer). `prestigiosPorCategoria` = Prestígio exibido de cada
// categoria (getPontosParaAscensao em Marcados.jsx). Status só troca statusPrestigioAplicado — o
// pool e os atributos ficam intactos. Retorna false (sem mexer em nada) se não puder ascender.
export function aplicarAscensao(ficha, prestigiosPorCategoria) {
    if (!ficha || !podeAscender(prestigiosPorCategoria)) return false;
    CATEGORIAS_PRESTIGIO.forEach((cat) => {
        const novoP = prestigioAposAscensao(prestigiosPorCategoria[cat]);
        if (cat === 'status') {
            ficha.statusPrestigioAplicado = novoP;
        } else {
            if (!ficha[cat]) ficha[cat] = {};
            ficha[cat].base = calcularBaseDoPrestigio(cat, novoP, ficha.divisores?.[cat]);
        }
    });
    ficha.ascensaoBase = (parseInt(ficha.ascensaoBase) || 1) + 1;
    ficha.prestigioPontosDistribuidos = {};
    if (ficha.overridePrestigio) ficha.overridePrestigio = null;
    return true;
}
