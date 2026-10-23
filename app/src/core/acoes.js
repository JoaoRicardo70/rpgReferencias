// ==========================================
// ⚡ AÇÕES DE TURNO — quantas Ações, Ações Bônus e Reações o personagem tem e quantas já usou.
//
// Regras (pedido do usuário):
//   • Todo personagem tem de base 2 Ações, 2 Ações Bônus e 2 Reações.
//   • Ganhar +1 Ação também dá +1 Ação Bônus e +1 Reação; ganhar Ação Bônus ou Reação NÃO dá Ação.
//   • O teto de cada uma é 5.
//   • O que dá mais: Técnicas, Habilidades, Poderes, Formas, itens, Pactos... com os efeitos
//     ACAO_PADRAO / ACAO_BONUS / ACAO_REACAO (propriedade BASE; o valor é quantas a mais), e o ajuste
//     manual do Mestre/jogador (ficha.acoes[tipo].extra).
//
// O máximo é SEMPRE calculado (calcularMaximoAcoes); `ficha.acoes[tipo].max/atual` continuam
// gravados na ficha porque o Mapa lê isso dos outros jogadores, e sincronizarAcoes mantém os dois
// lados juntos: quando o máximo cresce, as Ações novas já chegam disponíveis; quando cai, o
// "atual" é cortado.
// ==========================================
import { somarEfeitosDeAtributo } from './percepcaoPoder.js';

export const ACOES_BASE = 2;
export const ACOES_MAXIMO = 5;
export const TIPOS_ACAO = ['padrao', 'bonus', 'reacao'];
export const ATRIBUTO_ACAO = { padrao: 'acao_padrao', bonus: 'acao_bonus', reacao: 'acao_reacao' };
export const ROTULO_ACAO = { padrao: 'Ação', bonus: 'Ação Bônus', reacao: 'Reação' };

// ⏳ Ação segurada (core/segurarAcao.js): ao usar uma, a PRÓXIMA Ação gasta sai dela (crédito) em vez do contador do turno.
export const CAMPO_CREDITO_SEGURADA = 'acaoSeguradaCredito';
export const getCreditoAcaoSegurada = (ficha) => Math.max(0, Math.trunc(Number(ficha?.combate?.[CAMPO_CREDITO_SEGURADA])) || 0);

const limitar = (n) => Math.max(0, Math.min(ACOES_MAXIMO, n));
const inteiroNaoNegativo = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

// Ajuste manual guardado na ficha (Ações a mais, além da base e dos efeitos). Ficha antiga, de quando
// o máximo era digitado à mão (sem o campo "extra"), vira ajuste manual: o que passava da base 2 é
// preservado em vez de sumir.
export function getExtraManualAcao(ficha, tipo) {
    const g = ficha?.acoes?.[tipo];
    if (!g) return 0;
    if (g.extra === undefined) return inteiroNaoNegativo(Number(g.max) - ACOES_BASE);
    return inteiroNaoNegativo(g.extra);
}

// Estrutura inicial de Ações (personagem novo ou Dummie sem Ações).
export function criarAcoesIniciais() {
    return {
        padrao: { max: ACOES_BASE, atual: ACOES_BASE, extra: 0 },
        bonus: { max: ACOES_BASE, atual: ACOES_BASE, extra: 0 },
        reacao: { max: ACOES_BASE, atual: ACOES_BASE, extra: 0 }
    };
}

// Máximo de cada tipo, já com a regra "Ação a mais também dá Bônus e Reação" e o teto de 5.
export function calcularMaximoAcoes(ficha) {
    const extra = {};
    TIPOS_ACAO.forEach(t => {
        extra[t] = inteiroNaoNegativo(somarEfeitosDeAtributo(ficha, ATRIBUTO_ACAO[t])) + getExtraManualAcao(ficha, t);
    });
    return {
        padrao: limitar(ACOES_BASE + extra.padrao),
        bonus: limitar(ACOES_BASE + extra.bonus + extra.padrao),
        reacao: limitar(ACOES_BASE + extra.reacao + extra.padrao)
    };
}

// O que mostrar na tela: máximo calculado e o "atual" gravado (cortado no máximo).
export function getAcoesExibicao(ficha) {
    const maximos = calcularMaximoAcoes(ficha);
    const resultado = {};
    TIPOS_ACAO.forEach(t => {
        const atualGravado = Number(ficha?.acoes?.[t]?.atual);
        const atual = Number.isFinite(atualGravado) ? atualGravado : maximos[t];
        resultado[t] = { max: maximos[t], atual: Math.max(0, Math.min(maximos[t], atual)) };
    });
    return resultado;
}

// A ficha gravada está diferente do que o cálculo manda?
export function acoesDessincronizadas(ficha) {
    const maximos = calcularMaximoAcoes(ficha);
    return TIPOS_ACAO.some(t => {
        const g = ficha?.acoes?.[t];
        return !g || g.extra === undefined || Number(g.max) !== maximos[t] || !Number.isFinite(Number(g.atual)) || Number(g.atual) > maximos[t];
    });
}

// Grava o máximo calculado (muta o rascunho). Ações que passaram a existir já nascem disponíveis.
export function sincronizarAcoes(ficha) {
    if (!ficha) return;
    if (!ficha.acoes) ficha.acoes = {};
    // Fixa o ajuste manual herdado do modelo antigo ANTES de calcular (depois o máximo gravado já inclui efeitos).
    TIPOS_ACAO.forEach(t => { if (ficha.acoes[t] && ficha.acoes[t].extra === undefined) ficha.acoes[t].extra = getExtraManualAcao(ficha, t); });
    const maximos = calcularMaximoAcoes(ficha);
    TIPOS_ACAO.forEach(t => {
        if (!ficha.acoes[t]) ficha.acoes[t] = { max: maximos[t], atual: maximos[t], extra: 0 };
        const g = ficha.acoes[t];
        const maxAntigo = Number(g.max);
        const atualAntigo = Number(g.atual);
        const ganho = Number.isFinite(maxAntigo) ? Math.max(0, maximos[t] - maxAntigo) : 0;
        const base = Number.isFinite(atualAntigo) ? atualAntigo : maximos[t];
        g.max = maximos[t];
        g.atual = Math.max(0, Math.min(maximos[t], base + ganho));
    });
}

// Gasta (disponivel = true) ou recupera uma Ação do tipo.
export function alternarAcao(ficha, tipo, disponivel) {
    if (!ficha || !TIPOS_ACAO.includes(tipo)) return;
    // Gastar uma Ação com uma Ação segurada em uso: ela paga, o contador do turno não mexe.
    const credito = getCreditoAcaoSegurada(ficha);
    if (disponivel && tipo === 'padrao' && credito > 0) { ficha.combate[CAMPO_CREDITO_SEGURADA] = credito - 1; return; }
    sincronizarAcoes(ficha);
    const g = ficha.acoes[tipo];
    g.atual = disponivel ? Math.max(0, g.atual - 1) : Math.min(g.max, g.atual + 1);
}

// Novo turno / descanso: tudo disponível de novo, já com o máximo atualizado.
export function restaurarAcoes(ficha) {
    if (!ficha) return;
    sincronizarAcoes(ficha);
    // Reações usadas no round anterior (core/reacoes.js) não passam para o próximo turno.
    if (ficha.combate && Array.isArray(ficha.combate.reacoesPendentes)) ficha.combate.reacoesPendentes = [];
    // ⏳ Ações seguradas valem até o começo do próximo turno de quem segurou (core/segurarAcao.js).
    if (ficha.combate) { ficha.combate.acoesSeguradas = []; ficha.combate[CAMPO_CREDITO_SEGURADA] = 0; }
    TIPOS_ACAO.forEach(t => { ficha.acoes[t].atual = ficha.acoes[t].max; });
}

// Ajuste manual (+1 / -1) do tipo. Não deixa passar do teto de 5 nem ficar abaixo de 0.
export function ajustarExtraManualAcao(ficha, tipo, delta) {
    if (!ficha || !TIPOS_ACAO.includes(tipo)) return;
    if (!ficha.acoes) ficha.acoes = {};
    if (!ficha.acoes[tipo]) ficha.acoes[tipo] = { max: ACOES_BASE, atual: ACOES_BASE };
    const antes = calcularMaximoAcoes(ficha)[tipo];
    const novo = Math.max(0, getExtraManualAcao(ficha, tipo) + delta);
    if (delta > 0 && antes >= ACOES_MAXIMO) return;
    ficha.acoes[tipo].extra = novo;
    sincronizarAcoes(ficha);
}

// Ação Bônus sem nenhuma Ação Bônus sobrando: o personagem pode gastar uma AÇÃO no lugar (regra do sistema).
// Devolve o tipo que de fato vai ser gasto ('bonus' normalmente; 'padrao' quando não sobrou Bônus mas sobrou Ação).
export function resolverTipoAGastar(ficha, tipo) {
    if (tipo !== 'bonus') return tipo;
    const exib = getAcoesExibicao(ficha);
    return (exib.bonus.atual <= 0 && exib.padrao.atual + getCreditoAcaoSegurada(ficha) > 0) ? 'padrao' : 'bonus';
}
