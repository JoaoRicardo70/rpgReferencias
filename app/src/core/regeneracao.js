// ==========================================
// 💖 REGENERAÇÃO EM PORCENTAGEM — a Regeneração de um vital é uma % do TETO dele por turno
// (ex.: 5 = recupera 5% do máximo). Vem de duas fontes somadas:
//   • ficha[vital].regeneracaoPct — o campo manual da Ficha;
//   • o bônus 'regeneracao' de Poderes/Passivas/Itens ativos (getBuffs) — agora também em %.
// Fichas antigas guardavam um valor ABSOLUTO em ficha[vital].regeneracao: enquanto não houver
// regeneracaoPct, esse valor é convertido pra % do teto atual (mesma cura de antes).
// ==========================================
export const REGENERACAO_PCT_MAX = 100;

export function limitarRegeneracaoPct(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(REGENERACAO_PCT_MAX, Math.max(0, n));
}

// % manual do vital (já com a conversão do valor absoluto antigo).
export function getRegeneracaoManualPct(vital, teto) {
    if (!vital) return 0;
    if (vital.regeneracaoPct !== undefined && vital.regeneracaoPct !== null && vital.regeneracaoPct !== '') {
        return limitarRegeneracaoPct(vital.regeneracaoPct);
    }
    const antigo = parseFloat(vital.regeneracao) || 0;
    const t = Number(teto) || 0;
    if (antigo > 0 && t > 0) return limitarRegeneracaoPct((antigo / t) * 100);
    return 0;
}

// % total por turno (manual + bônus), limitada a 100.
export function getRegeneracaoTotalPct(vital, bonusBuffPct, teto) {
    const buff = parseFloat(bonusBuffPct) || 0;
    return limitarRegeneracaoPct(getRegeneracaoManualPct(vital, teto) + Math.max(0, buff));
}

// Quanto o vital cura neste turno (mesma escala do `teto` e do `atual`).
export function calcularCuraRegeneracao(teto, pct) {
    const t = Number(teto) || 0;
    const p = limitarRegeneracaoPct(pct);
    if (t <= 0 || p <= 0) return 0;
    return t * (p / 100);
}
