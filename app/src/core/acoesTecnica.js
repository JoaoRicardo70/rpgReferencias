// ==========================================
// ⏱️ AÇÃO GASTA POR TÉCNICA
//
// Cada técnica (Poder/Forma/Habilidade, Técnica Elemental, Habilidade de Redução de Dano) pode dizer que tipo
// de Ação custa usá-la: Ação, Ação Bônus, Reação, Movimento ou Ação Livre. Ação, Bônus e Reação são as que o
// sistema controla (core/acoes.js: ficha.acoes[tipo].atual/max) e são descontadas ao usar a técnica; Movimento
// e Ação Livre ficam só como informação (não têm contador). Vazio = a técnica não controla Ação (como sempre foi).
//
// Quando se gasta:
//   • Poder/Forma/Habilidade e Habilidade de Redução: ao LIGAR a técnica no Livro de Combate do Mapa;
//   • Técnica Elemental: ao ATACAR com ela (AtaqueFormContext > executarRolarDano), uma vez por tipo de Ação distinto.
// Sem a Ação disponível o app pergunta se quer usar mesmo assim (o contador nunca fica negativo).
// ==========================================
import { getAcoesExibicao, alternarAcao, resolverTipoAGastar, getCreditoAcaoSegurada, ROTULO_ACAO } from './acoes.js';

export const TIPOS_ACAO_TECNICA = [
    // Automático: não controla Ação, exceto Poder/Forma/Habilidade que eleva o Poder Calculado (gasta Reação ao ligar, core/acaoPoder.js).
    { id: '', rotulo: 'Automático (Reação se elevar o Poder)', rastreada: null },
    { id: 'acao', rotulo: 'Ação', rastreada: 'padrao' },
    { id: 'bonus', rotulo: 'Ação Bônus', rastreada: 'bonus' },
    { id: 'reacao', rotulo: 'Reação', rastreada: 'reacao' },
    { id: 'movimento', rotulo: 'Movimento', rastreada: null },
    { id: 'livre', rotulo: 'Ação Livre', rastreada: null }
];

const POR_ID = Object.fromEntries(TIPOS_ACAO_TECNICA.map(t => [t.id, t]));

// Normaliza o valor salvo: só aceita um dos ids conhecidos ('' para qualquer outra coisa).
export function normalizarTipoAcao(v) {
    const id = String(v ?? '').trim();
    return POR_ID[id] ? id : '';
}

// Rótulo para mostrar ("Reação"), ou '' quando a técnica não controla Ação.
export function getRotuloAcaoTecnica(v) {
    const id = normalizarTipoAcao(v);
    return id ? POR_ID[id].rotulo : '';
}

// Tipo controlado pelo sistema ('padrao' | 'bonus' | 'reacao') ou null (sem controle / Movimento / Livre).
export function getTipoRastreado(v) {
    return POR_ID[normalizarTipoAcao(v)].rastreada;
}

// Tipos controlados distintos de uma lista de técnicas (cada tipo só é cobrado uma vez por uso).
export function tiposRastreadosDe(tecnicas) {
    const vistos = new Set();
    (tecnicas || []).forEach(t => { const r = getTipoRastreado(t && t.tipoAcao); if (r) vistos.add(r); });
    return [...vistos];
}

// Ação Bônus por último: só cai para a Ação se, depois de pagar as outras, ainda sobrou Ação.
const ordenarTipos = (tipos) => [...(tipos || [])].sort((a, b) => (a === 'bonus') - (b === 'bonus'));

// Simula o gasto, um tipo de cada vez (o mesmo caminho de gastarAcoes): [{ tipo, efetivo, semAcao, restam }].
function simularGasto(ficha, tiposRastreados) {
    const exib = getAcoesExibicao(ficha);
    // Uma Ação segurada em uso paga a próxima Ação (core/segurarAcao.js).
    const cont = { padrao: exib.padrao.atual + getCreditoAcaoSegurada(ficha), bonus: exib.bonus.atual, reacao: exib.reacao.atual };
    return ordenarTipos(tiposRastreados).map(tipo => {
        const efetivo = (tipo === 'bonus' && cont.bonus <= 0 && cont.padrao > 0) ? 'padrao' : tipo;
        const semAcao = (cont[efetivo] || 0) <= 0;
        if (!semAcao) cont[efetivo] -= 1;
        return { tipo, efetivo, semAcao, restam: Math.max(0, cont[efetivo] || 0) };
    });
}

// Dos tipos pedidos, quais NÃO têm Ação disponível para pagar (lista de rótulos, ex.: ['Reação']).
export function acoesEmFalta(ficha, tiposRastreados) {
    if (!tiposRastreados || tiposRastreados.length === 0) return [];
    return simularGasto(ficha, tiposRastreados).filter(p => p.semAcao).map(p => ROTULO_ACAO[p.tipo]);
}

// Desconta 1 de cada tipo (muta o rascunho Immer da ficha; nunca abaixo de 0). Bônus sem Bônus sobrando paga com uma Ação.
export function gastarAcoes(ficha, tiposRastreados) {
    ordenarTipos(tiposRastreados).forEach(t => alternarAcao(ficha, resolverTipoAGastar(ficha, t), true));
}

const PLURAL_ACAO = { padrao: 'Ações', bonus: 'Ações Bônus', reacao: 'Reações' };

// Tipos pedidos que vão ser pagos com OUTRA Ação (Ação Bônus sem Bônus sobrando → Ação): lista de rótulos.
export function substituicoesDeAcao(ficha, tiposRastreados) {
    return simularGasto(ficha, tiposRastreados).filter(p => p.efetivo !== p.tipo && !p.semAcao).map(p => ROTULO_ACAO[p.tipo]);
}

// Avisos curtos sobre o gasto que VAI acontecer (use antes de gastar, com a ficha de antes): [{ texto, tipo }].
export function avisosDoGasto(ficha, tiposRastreados) {
    const avisos = [];
    simularGasto(ficha, tiposRastreados).forEach(p => {
        if (p.semAcao) { avisos.push({ texto: `Sem ${ROTULO_ACAO[p.tipo]} disponível: usado mesmo assim.`, tipo: 'alerta' }); return; }
        if (p.efetivo !== p.tipo) avisos.push({ texto: `Sem ${ROTULO_ACAO[p.tipo]} sobrando: usando 1 ${ROTULO_ACAO[p.efetivo]} no lugar (restam ${p.restam}).`, tipo: 'info' });
        else avisos.push({ texto: `Gastou 1 ${ROTULO_ACAO[p.tipo]} (restam ${p.restam}).`, tipo: 'info' });
        if (p.restam === 0) avisos.push({ texto: `Suas ${PLURAL_ACAO[p.efetivo]} acabaram.`, tipo: 'alerta' });
    });
    return avisos;
}
