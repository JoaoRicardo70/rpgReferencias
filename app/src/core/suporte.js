// ==========================================
// ✨ SUPORTE — Cura e Buffs que um Poder, Habilidade, Técnica ou Item dá a quem usa e/ou a vários aliados (mesmo desenho dos
// estados que o golpe aplica, core/estadosGolpe.js, só que para o lado bom). Lógica pura; as escritas ficam em services/suporte.js.
//   suporte: { cura?: { dadosQtd, dadosFaces, fixo, percVida }, buffs: [{ atributo, propriedade, valor }], duracao,
//              alvos: 'si' | 'aliados' | 'ambos', maxAlvos, custoPercentual, energia, acao }
// Cura: dados + valor fixo + % da Vida máxima do alvo (escala exibida), vezes a Eficácia de Cura dele (estados cortam a cura).
// Buffs: efeitos no mesmo formato de sempre ({ atributo, propriedade, valor }); ficam em ficha.buffsTemporarios por `duracao`
// turnos do próprio alvo (0 = até serem removidos) e entram em getEfeitosDeClasse, então valem em dano, acerto, CA, Ações etc.
// Este módulo NÃO importa a engine (attributes.js importa daqui).
// ==========================================
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from './efeitos-constants.js';

export const LIMITES_SUPORTE = { buffs: 12, duracaoMax: 20, maxAlvos: 10, dadosQtd: 100, dadosFaces: 1000, buffsAtivosPorFicha: 30 };
export const MODOS_ALVO_SUPORTE = [
    { id: 'si', nome: 'Só em mim' }, { id: 'aliados', nome: 'Aliados escolhidos' }, { id: 'ambos', nome: 'Em mim e em aliados' }
];
export const ACOES_SUPORTE = [
    { id: 'nenhuma', nome: 'Sem custo de Ação' }, { id: 'padrao', nome: 'Ação' }, { id: 'bonus', nome: 'Ação Bônus' }, { id: 'reacao', nome: 'Reação' }
];
const ENERGIAS = ['mana', 'aura', 'chakra'];

const inteiro = (v, min, max, padrao = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao; };
const numero = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Mesma regra de atributo/propriedade do Editor de Efeitos (efeitos-constants.js).
const ATRIBUTOS_VALIDOS = new Set(ATRIBUTOS_AGRUPADOS.flatMap(g => g.options));
function buffValido(b) {
    if (!b || typeof b.atributo !== 'string' || typeof b.propriedade !== 'string') return false;
    if (!Number.isFinite(parseFloat(b.valor)) || !ATRIBUTOS_VALIDOS.has(b.atributo)) return false;
    return getPropriedadesDoAtributo(b.atributo).includes(b.propriedade);
}

export function normalizarSuporte(s) {
    if (!s || typeof s !== 'object') return null;
    const cura = s.cura && typeof s.cura === 'object' ? {
        dadosQtd: inteiro(s.cura.dadosQtd, 0, LIMITES_SUPORTE.dadosQtd), dadosFaces: inteiro(s.cura.dadosFaces, 2, LIMITES_SUPORTE.dadosFaces, 20),
        fixo: Math.max(0, numero(s.cura.fixo)), percVida: Math.max(0, Math.min(1000, numero(s.cura.percVida)))
    } : null;
    const temCura = cura && (cura.dadosQtd > 0 || cura.fixo > 0 || cura.percVida > 0);
    const buffs = (Array.isArray(s.buffs) ? s.buffs : []).filter(buffValido).slice(0, LIMITES_SUPORTE.buffs)
        .map(b => ({ atributo: b.atributo, propriedade: b.propriedade, valor: numero(b.valor), ...(b.nome ? { nome: String(b.nome).slice(0, 60) } : {}) }));
    if (!temCura && buffs.length === 0) return null;
    return {
        ...(temCura ? { cura } : {}),
        buffs,
        duracao: inteiro(s.duracao, 0, LIMITES_SUPORTE.duracaoMax, 3),
        alvos: MODOS_ALVO_SUPORTE.some(m => m.id === s.alvos) ? s.alvos : 'aliados',
        maxAlvos: inteiro(s.maxAlvos, 1, LIMITES_SUPORTE.maxAlvos, 3),
        custoPercentual: Math.max(0, Math.min(100, numero(s.custoPercentual))),
        energia: ENERGIAS.includes(s.energia) ? s.energia : 'mana',
        acao: ACOES_SUPORTE.some(a => a.id === s.acao) ? s.acao : 'padrao'
    };
}

// Quantos destinatários o uso permite (eu + aliados escolhidos), e se eu entro.
export function destinatariosPermitidos(suporte, aliadosEscolhidos = []) {
    const s = normalizarSuporte(suporte);
    if (!s) return { eu: false, aliados: [] };
    const aliados = [...new Set((aliadosEscolhidos || []).filter(Boolean))];
    if (s.alvos === 'si') return { eu: true, aliados: [] };
    if (s.alvos === 'aliados') return { eu: false, aliados: aliados.slice(0, s.maxAlvos) };
    return { eu: true, aliados: aliados.slice(0, s.maxAlvos) };
}

// Cura (escala EXIBIDA) para um alvo. `vidaMaxExibida` do alvo, `eficacia` = calcularEficaciaCura(alvo) (1 = sem cortes).
export function calcularCuraSuporte(suporte, { vidaMaxExibida = 0, eficacia = 1, rolar = (f) => Math.floor(Math.random() * f) + 1 } = {}) {
    const s = normalizarSuporte(suporte);
    if (!s || !s.cura) return { total: 0, base: 0, detalhe: '' };
    const { dadosQtd, dadosFaces, fixo, percVida } = s.cura;
    let dados = 0;
    for (let i = 0; i < dadosQtd; i++) dados += rolar(dadosFaces);
    const porVida = Math.floor(Math.max(0, Number(vidaMaxExibida) || 0) * (percVida / 100));
    const base = dados + fixo + porVida;
    const f = Math.max(0, Number(eficacia));
    const total = Math.floor(base * (Number.isFinite(f) ? f : 1));
    const partes = [];
    if (dadosQtd > 0) partes.push(`${dadosQtd}d${dadosFaces} = ${dados}`);
    if (fixo > 0) partes.push(`+${fixo}`);
    if (percVida > 0) partes.push(`${percVida}% da Vida = ${porVida}`);
    return { total, base, detalhe: `${partes.join(' ')}${f !== 1 ? ` × cura ${Math.round(f * 1000) / 10}%` : ''}` };
}

// ---------- Buffs temporários na ficha ----------

export function buffsTemporariosDaFicha(ficha) {
    const lista = Array.isArray(ficha && ficha.buffsTemporarios) ? ficha.buffsTemporarios : [];
    return lista.filter(b => b && Array.isArray(b.efeitos) && b.efeitos.length > 0)
        .map(b => ({ id: String(b.id), nome: String(b.nome || 'Buff'), fonte: String(b.fonte || ''), efeitos: b.efeitos, restantes: Number.isFinite(Number(b.restantes)) ? Math.floor(Number(b.restantes)) : 0 }))
        .slice(0, LIMITES_SUPORTE.buffsAtivosPorFicha);
}

// Efeitos de todos os buffs ativos (para getEfeitosDeClasse).
export function efeitosDeBuffsTemporarios(ficha) {
    if (!ficha || !Array.isArray(ficha.buffsTemporarios) || ficha.buffsTemporarios.length === 0) return [];
    return buffsTemporariosDaFicha(ficha).flatMap(b => b.efeitos.map(e => ({ atributo: e.atributo, propriedade: e.propriedade, valor: e.valor, nome: e.nome || b.nome })));
}

// Soma um buff novo à lista (mesma origem + mesmo nome renova em vez de empilhar). Devolve a lista NOVA.
export function somarBuffTemporario(lista, { id, nome, fonte, efeitos, duracao }) {
    const atuais = buffsTemporariosDaFicha({ buffsTemporarios: lista });
    const novo = { id: String(id), nome: String(nome || 'Buff').slice(0, 60), fonte: String(fonte || '').slice(0, 60), efeitos, restantes: inteiro(duracao, 0, LIMITES_SUPORTE.duracaoMax, 3) };
    const i = atuais.findIndex(b => b.nome === novo.nome && b.fonte === novo.fonte);
    if (i >= 0) atuais[i] = novo; else atuais.push(novo);
    return atuais.slice(-LIMITES_SUPORTE.buffsAtivosPorFicha);
}

// Início do turno do dono: cada buff com duração perde 1 turno; os que acabam saem. Devolve { lista, expirados }.
export function passarTurnoDosBuffs(ficha) {
    const expirados = [];
    const lista = [];
    buffsTemporariosDaFicha(ficha).forEach((b) => {
        if (b.restantes <= 0) { lista.push(b); return; } // 0 = sem prazo
        if (b.restantes - 1 <= 0) { expirados.push(b.nome); return; }
        lista.push({ ...b, restantes: b.restantes - 1 });
    });
    return { lista, expirados };
}

export function removerBuffTemporario(lista, id) {
    return buffsTemporariosDaFicha({ buffsTemporarios: lista }).filter(b => b.id !== String(id));
}
