// ==========================================
// 🎚️ AJUSTE DE PODER (Mestre) — a barra de Poder dos NPCs. Em vez de mexer num número do token, o ajuste é uma ENTROPIA da Entidade
// (core/entropia.js) com um multiplicador de Poder: ficha.entropias[] ganha a entrada fixa ID_AJUSTE_PODER, com um efeito
// PODER (Direto) / munico = fator. Ela entra no Poder Calculado como qualquer outra fonte, e some quando o fator volta a ×1.
// Módulo puro (a barra e o Firebase ficam na tela).
// ==========================================
import { entropiasDaFicha, gravarEntropias, ATRIBUTO_PODER_DIRETO, LIMITES_ENTROPIA } from './entropia.js';

export const ID_AJUSTE_PODER = 'ajustepoder';
export const FATOR_MIN = 0.1;
export const FATOR_MAX = 100;
const NOME_AJUSTE = 'Ajuste de Poder';

const arredondar = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Number(n.toPrecision(3));
};
const limitar = (n) => Math.min(FATOR_MAX, Math.max(FATOR_MIN, n));

// Posição da barra (0 a 100, escala logarítmica: o meio é ×~3,16) → fator. 50 ≈ ×3,16; o ×1 fica perto de 33.
export function fatorDaPosicao(posicao) {
    const p = Math.min(100, Math.max(0, Number(posicao) || 0)) / 100;
    return arredondar(limitar(FATOR_MIN * Math.pow(FATOR_MAX / FATOR_MIN, p)));
}
export function posicaoDoFator(fator) {
    const f = limitar(arredondar(fator));
    return Math.round((Math.log(f / FATOR_MIN) / Math.log(FATOR_MAX / FATOR_MIN)) * 1000) / 10;
}

// Fator do Ajuste de Poder gravado na ficha (1 quando não há).
export function fatorDoAjuste(ficha) {
    const e = entropiasDaFicha(ficha).find(x => x.id === ID_AJUSTE_PODER);
    const ef = e && e.efeitos.find(x => x.atributo === ATRIBUTO_PODER_DIRETO && x.propriedade === 'munico');
    return ef && ef.valor > 0 ? ef.valor : 1;
}

// Lista de Entropias da ficha com o ajuste novo (fator ≈ 1 remove a entrada). Não mexe na ficha.
export function entropiasComAjuste(ficha, fator) {
    const f = arredondar(limitar(arredondar(fator)));
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
