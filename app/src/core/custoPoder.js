// ==========================================
// 🔋 CUSTO → PODER DO GOLPE
//
// Regra (pedido do usuário): o Custo gasto numa Técnica/Habilidade NÃO entra mais no Dano. Em vez disso
// ele aumenta, só no momento do golpe, o Poder Calculado de quem ataca (que decide o dano pela
// Disputa de Poder, core/disputaPoder.js). A conta passa pela MESMA escala do Poder Calculado: a
// energia gasta entra como mais um termo da base do Poder (peso 1/6, igual Mana/Aura/Chakra em
// core/poder.js > calcularPoderAtual) e o resultado é amortecido junto, então o bônus nunca destoa
// do Poder do personagem.
//
// "Conjurar como Poder": capacidade rara (Poderes, Infinities, Singularidades) liberada pelo Mestre
// na ficha (combate.conjuraComoPoder) e que pode ser vetada por habilidade (semComoPoder). Conjurando
// assim não se gasta NENHUMA energia, mas o golpe recebe o benefício de um Custo na margem
// [mínimo, máximo] da habilidade (escolhido por quem conjura), com Mana, Aura e Chakra somando juntas.
// ==========================================
import { getBuffs, getEfetivoBase } from './attributes.js';
import { amortecerPoderBruto } from './poder.js';

export const ENERGIAS_COMO_PODER = ['mana', 'aura', 'chakra'];
// Mesmo peso que cada energia tem na base do Poder Calculado: (vida*10 + chakra + mana + corpo + aura + status*100) / 6.
export const DIVISOR_BASE_PODER = 6;

const numeroSeguro = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Margem de Custo (%) de uma habilidade/magia: mínimo = Custo cadastrado, máximo = Custo máximo (se vazio ou menor, igual ao mínimo).
export function getMargemCusto(hab) {
    const min = Math.max(0, numeroSeguro(hab?.custoPercentual ?? hab?.custoValor));
    const max = Math.max(min, numeroSeguro(hab?.custoPercentualMax ?? hab?.custoValorMax));
    return { min, max };
}

// Mantém o % escolhido dentro da margem; vazio/inválido vale o máximo (o benefício cheio).
export function limitarPercComoPoder(hab, percEscolhido) {
    const { min, max } = getMargemCusto(hab);
    const bruto = parseFloat(percEscolhido);
    if (!Number.isFinite(bruto)) return max;
    return Math.min(max, Math.max(min, bruto));
}

// A ficha tem a capacidade liberada pelo Mestre e a habilidade não foi vetada?
export function podeConjurarComoPoder(ficha, hab) {
    return !!(ficha?.combate?.conjuraComoPoder) && !hab?.semComoPoder;
}

// Energia "bruta" (mesma unidade do Poder Calculado) equivalente a `perc`% do máximo do vital.
// `aplicarReducao`: o Custo realmente pago passa pela Redução de Custo; o "como Poder" não paga nada e recebe o benefício cheio.
export function custoBrutoDeEnergia(ficha, energia, perc, aplicarReducao = true) {
    const p = numeroSeguro(perc);
    if (!ficha || !ficha[energia] || p <= 0) return 0;
    // Mesma base de energia que o Poder Calculado usa (core/poder.js > calcularPoderAtual), sem Formas: o bônus não destoa dele.
    const maximo = numeroSeguro(getEfetivoBase(ficha, energia, false, getBuffs(ficha, energia, false, false, true)));
    let bruto = maximo * (p / 100);
    if (aplicarReducao) {
        const red = Math.min(100, numeroSeguro(ficha[energia].reducaoCusto) + numeroSeguro(getBuffs(ficha, energia).reducaoCusto));
        bruto *= (1 - red / 100);
    }
    return Number.isFinite(bruto) ? Math.max(0, bruto) : 0;
}

// Quanto o Poder do golpe é multiplicado pelo Custo (>= 1). `poderBase` é calcularPoderAtual(...).poderBase.
export function fatorPoderPorCusto(poderBase, custoBrutoTotal) {
    const custo = numeroSeguro(custoBrutoTotal);
    const base = numeroSeguro(poderBase);
    if (custo <= 0 || base <= 0) return 1;
    const antes = amortecerPoderBruto(base);
    const depois = amortecerPoderBruto(base + custo / DIVISOR_BASE_PODER);
    const fator = antes > 0 ? depois / antes : 1;
    return Number.isFinite(fator) && fator > 1 ? fator : 1;
}

// Soma os custos brutos de uma lista [{ energia, bruto }].
export function somarCustosBrutos(itens) {
    return (itens || []).reduce((s, i) => s + numeroSeguro(i?.bruto), 0);
}
