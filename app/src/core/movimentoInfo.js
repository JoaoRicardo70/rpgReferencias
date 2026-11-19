// ==========================================
// 👣 MOVIMENTO (informativo) — resumo do deslocamento do portador para a ficha e o Mapa. O Mapa NÃO limita o deslocamento por isso.
//   • efeito `movimento` (propriedade base): bônus em QUADRADOS somado (aceita `quando`);
//   • efeito `velocidade_zero` (valor > 0): a velocidade é 0 enquanto valer;
//   • estados (core/condicoes.js > movimentoMult): Imobilizado/Incapacitado/Lento etc. entram como multiplicador/zero (já existiam; só são mostrados).
//   Também informa os quadrados percorridos no turno (core/movimentoNoTurno.js) quando em combate.
// ==========================================
import { valoresDeEfeitos, montarContextoDeCombate } from './efeitosCondicionais.js';
import { modificadoresDeEstados } from './condicoes.js';
import { quadradosNoTurno } from './movimentoNoTurno.js';

export const LIMITE_BONUS_MOVIMENTO = 1000;

// { bonusQuadrados, velocidadeZero, mult, semMovimento, quadradosNoTurno, emCombate }. Ficha vazia = tudo neutro.
export function resumoDeMovimento(ficha, nomePortador = '') {
    const neutro = { bonusQuadrados: 0, velocidadeZero: false, mult: 1, semMovimento: false, quadradosNoTurno: 0, emCombate: false };
    if (!ficha || typeof ficha !== 'object') return neutro;
    try {
        const contexto = montarContextoDeCombate(ficha, null, nomePortador);
        const soma = (atributo) => valoresDeEfeitos(ficha, atributo, { contexto }).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
        const bonus = Math.max(-LIMITE_BONUS_MOVIMENTO, Math.min(LIMITE_BONUS_MOVIMENTO, soma('movimento')));
        const estados = modificadoresDeEstados(ficha);
        const emCombate = Number(ficha.iniciativa) > 0;
        const zeroPorEfeito = soma('velocidade_zero') > 0;
        return {
            bonusQuadrados: bonus,
            velocidadeZero: zeroPorEfeito || !!estados.semMovimento,
            mult: Number.isFinite(estados.movimentoMult) ? estados.movimentoMult : 1,
            semMovimento: !!estados.semMovimento,
            quadradosNoTurno: emCombate ? quadradosNoTurno(ficha) : 0,
            emCombate,
        };
    } catch (e) { return neutro; }
}

// Texto curto ('' quando não há nada a dizer).
export function textoDeMovimento(r) {
    if (!r) return '';
    const partes = [];
    if (r.velocidadeZero) partes.push('velocidade 0');
    else {
        if (r.bonusQuadrados) partes.push(`${r.bonusQuadrados > 0 ? '+' : ''}${r.bonusQuadrados} quadrado(s) de movimento`);
        if (r.mult !== 1) partes.push(`deslocamento x${r.mult}`);
    }
    if (r.emCombate && r.quadradosNoTurno > 0) partes.push(`${r.quadradosNoTurno} quadrado(s) percorridos no turno`);
    return partes.length > 0 ? `👣 ${partes.join(' · ')}` : '';
}
