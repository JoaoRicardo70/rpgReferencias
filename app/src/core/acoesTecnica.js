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
import { getAcoesExibicao, alternarAcao, ROTULO_ACAO } from './acoes.js';

export const TIPOS_ACAO_TECNICA = [
    { id: '', rotulo: 'Não controla Ação', rastreada: null },
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

// Dos tipos pedidos, quais NÃO têm mais Ação disponível agora (lista de rótulos, ex.: ['Reação']).
export function acoesEmFalta(ficha, tiposRastreados) {
    if (!tiposRastreados || tiposRastreados.length === 0) return [];
    const exib = getAcoesExibicao(ficha);
    return tiposRastreados.filter(t => !exib[t] || exib[t].atual <= 0).map(t => ROTULO_ACAO[t]);
}

// Desconta 1 de cada tipo (muta o rascunho Immer da ficha; nunca abaixo de 0).
export function gastarAcoes(ficha, tiposRastreados) {
    (tiposRastreados || []).forEach(t => alternarAcao(ficha, t, true));
}
