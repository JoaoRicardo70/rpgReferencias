// ==========================================
// 🎚️ AJUSTE DE PODER (Mestre) — a barra de Poder dos NPCs. Em vez de mexer num número do token, o ajuste é uma ENTROPIA da Entidade
// (core/entropia.js) com um multiplicador de Poder: ficha.entropias[] ganha a entrada fixa ID_AJUSTE_PODER, com um efeito
// PODER (Direto) / munico = fator. Ela entra no Poder Calculado como qualquer outra fonte, e some quando o fator volta a ×1.
// O Mestre pode mudar o alcance da barra por NPC (ficha.ajustePoderLimites = { min, max }). Módulo puro.
// ==========================================
import { entropiasDaFicha, gravarEntropias, ATRIBUTO_PODER_DIRETO, LIMITES_ENTROPIA } from './entropia.js';

export const ID_AJUSTE_PODER = 'ajustepoder';
export const FATOR_MIN = 0.1; // alcance padrão da barra
export const FATOR_MAX = 100;
export const LIMITES_PADRAO = { min: FATOR_MIN, max: FATOR_MAX };
export const LIMITES_ABSOLUTOS = { min: 0.001, max: 1000000 }; // o que o Mestre pode configurar
const NOME_AJUSTE = 'Ajuste de Poder';

const arredondar = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Number(n.toPrecision(3));
};
const limitarAbs = (n) => Math.min(LIMITES_ABSOLUTOS.max, Math.max(LIMITES_ABSOLUTOS.min, n));

// { min, max } válido (dentro dos limites absolutos e com min < max) ou null.
export function normalizarLimites(l) {
    const min = parseFloat(String(l && l.min).replace(',', '.'));
    const max = parseFloat(String(l && l.max).replace(',', '.'));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min < LIMITES_ABSOLUTOS.min || max > LIMITES_ABSOLUTOS.max || !(min < max)) return null;
    return { min: arredondar(min), max: arredondar(max) };
}
export const limitesDoAjuste = (ficha) => normalizarLimites(ficha && ficha.ajustePoderLimites) || LIMITES_PADRAO;

// Posição da barra (0 a 100, escala logarítmica entre min e max) ↔ fator.
export function fatorDaPosicao(posicao, lim = LIMITES_PADRAO) {
    const p = Math.min(100, Math.max(0, Number(posicao) || 0)) / 100;
    const f = lim.min * Math.pow(lim.max / lim.min, p);
    return arredondar(Math.min(lim.max, Math.max(lim.min, f)));
}
export function posicaoDoFator(fator, lim = LIMITES_PADRAO) {
    const f = Math.min(lim.max, Math.max(lim.min, arredondar(fator)));
    return Math.round((Math.log(f / lim.min) / Math.log(lim.max / lim.min)) * 1000) / 10;
}

// Fator do Ajuste de Poder gravado na ficha (1 quando não há).
export function fatorDoAjuste(ficha) {
    const e = entropiasDaFicha(ficha).find(x => x.id === ID_AJUSTE_PODER);
    const ef = e && e.efeitos.find(x => x.atributo === ATRIBUTO_PODER_DIRETO && x.propriedade === 'munico');
    return ef && ef.valor > 0 ? ef.valor : 1;
}

// Lista de Entropias da ficha com o ajuste novo (fator ≈ 1 remove a entrada). Não mexe na ficha.
export function entropiasComAjuste(ficha, fator) {
    const f = arredondar(limitarAbs(arredondar(fator)));
    // Reserva uma vaga: sem isso, com o limite de Entropias cheio o ajuste seria cortado na leitura.
    const resto = entropiasDaFicha(ficha).filter(x => x.id !== ID_AJUSTE_PODER).slice(0, LIMITES_ENTROPIA.entropias - 1);
    if (Math.abs(f - 1) < 0.0005) return resto;
    const ajuste = {
        id: ID_AJUSTE_PODER, nome: NOME_AJUSTE, descricao: 'Ajuste de Poder feito pelo Mestre na barra do Mapa.', ativa: true, oculta: true,
        efeitos: [{ nome: NOME_AJUSTE, atributo: ATRIBUTO_PODER_DIRETO, propriedade: 'munico', valor: f }],
    };
    return [...resto, ajuste];
}

// Mesmo, mas direto numa ficha de rascunho (callbacks Immer).
export function aplicarAjusteNaFicha(ficha, fator) { gravarEntropias(ficha, entropiasComAjuste(ficha, fator)); }

export function rotuloDoFator(fator) {
    const f = arredondar(fator);
    return `×${String(f).replace('.', ',')}`;
}
