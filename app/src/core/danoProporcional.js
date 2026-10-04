// ==========================================
// 🎲 DANO DE DADO PROPORCIONAL À VIDA — as rolagens de dano (5d10, fórmula do Modo Deus...) saem
// em dezenas, mas as barras de Vida estão na casa dos milhares. Pra o dado pesar de verdade, o
// resultado vira uma FRAÇÃO da Vida MÁXIMA do alvo: cada "ponto" de dado vale 1/200 (0,5%) da Vida.
//   Ex.: 35 no dado contra 200.000 de Vida = 35 × (200.000 ÷ 200) = 35.000.
// O número 200 ("pontos de dado = Vida total") é da mesa: o Mestre ajusta em cenario.pontosDanoVida.
//
// Só vale pra dano que veio de ROLAGEM DE DADOS. Dano digitado direto (Dano Rápido do Mestre,
// sem a caixa "é dano de dado") entra como está. Depois desta escala ainda acontece o ajuste da
// Disputa de Poder (core/disputaPoder.js): primeiro a Vida, depois a diferença de Poder.
// ==========================================
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { getVidaMaxBrutaNpc } from './gavetaNpc.js';

export const PONTOS_VIDA_TOTAL_PADRAO = 200;

// Pontos de dado que equivalem à Vida inteira nesta mesa (cenario.pontosDanoVida, padrão 200).
export function getPontosVidaTotal(cenario) {
    const v = Number(cenario && cenario.pontosDanoVida);
    return Number.isFinite(v) && v >= 1 ? v : PONTOS_VIDA_TOTAL_PADRAO;
}

// Vida máxima na escala EXIBIDA (a mesma dos números de dano), ou null se não for conhecida.
export function getVidaMaxExibidaDummie(dummie) {
    const v = Number(dummie && dummie.hpMax) / FATOR_EXIBICAO_VITAIS;
    return Number.isFinite(v) && v > 0 ? v : null;
}

export function getVidaMaxExibidaFicha(ficha) {
    if (!ficha) return null;
    const v = getVidaMaxBrutaNpc(ficha) / FATOR_EXIBICAO_VITAIS;
    return Number.isFinite(v) && v > 0 ? v : null;
}

// Multiplicador que o dado recebe contra uma Vida máxima (Vida ÷ pontos). 1 se a Vida é desconhecida.
export function getFatorVida(vidaMaxExibida, pontos = PONTOS_VIDA_TOTAL_PADRAO) {
    const v = Number(vidaMaxExibida);
    const p = Number(pontos) >= 1 ? Number(pontos) : PONTOS_VIDA_TOTAL_PADRAO;
    if (!Number.isFinite(v) || v <= 0) return 1;
    return v / p;
}

// Dano do dado já proporcional à Vida (inteiro, nunca negativo). Vida desconhecida = dano como veio.
export function escalarDanoPelaVida(dano, vidaMaxExibida, pontos = PONTOS_VIDA_TOTAL_PADRAO) {
    const d = Math.max(0, Number(dano) || 0);
    const r = d * getFatorVida(vidaMaxExibida, pontos);
    // + 1e-7: 35 x 1000 em ponto flutuante pode dar 34999,9999… e o floor perderia 1.
    return Number.isFinite(r) ? Math.floor(r + 1e-7) : Number.MAX_SAFE_INTEGER;
}
