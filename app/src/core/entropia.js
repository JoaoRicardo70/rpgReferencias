// ==========================================
// 🌀 ENTROPIA DA ENTIDADE — mecanismo narrativo da campanha: a Entidade que rege os acontecimentos influencia o combate.
// É um buff que SÓ O MESTRE aplica (em NPC, Boss ou personagem), quando decidir, com os efeitos que escolher (os mesmos efeitos de
// qualquer Habilidade: atributos, CA, dano, Reações... e Poder Calculado). Pode estar ligada ou desligada e guardada pra depois.
//
// Onde fica na ficha (Firebase): ficha.entropias[] = { id, nome, descricao, ativa, oculta, efeitos: [{ nome, atributo, propriedade, valor }] }
//   ativa  — só as ativas entram nos cálculos;
//   oculta — o dono não vê (a surpresa fica com o Mestre).
// Módulo puro: não toca em Firebase nem na tela. Os efeitos ativos entram em core/attributes.js (getEfeitosDeClasse) e em
// core/poder.js (getPoderDiretoMultiplier), como as demais fontes.
// ==========================================
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from './efeitos-constants.js';
import { ATRIBUTO_DANO_DADOS, normalizarValorDanoDados, dadoDoEfeito } from './danoDados.js';

export const LIMITES_ENTROPIA = { entropias: 12, efeitos: 12, nome: 60, descricao: 400 };
export const ATRIBUTO_PODER_DIRETO = 'poder_direto';
const PROPRIEDADES_PODER_DIRETO = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'];

export const ATRIBUTOS_ENTROPIA = [...ATRIBUTOS_AGRUPADOS.flatMap(g => g.options), ATRIBUTO_PODER_DIRETO];

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const idValido = (v) => /^[A-Za-z0-9_-]{1,40}$/.test(String(v ?? '')) && !(String(v) in Object.prototype);

let contador = 0;
export function gerarIdEntropia(agora = Date.now()) {
    contador = (contador + 1) % 1296;
    return `en${agora.toString(36)}${contador.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// Propriedades que valem para o atributo escolhido (Poder Direto só aceita os multiplicadores).
export function propriedadesDoEfeito(atributo) {
    return atributo === ATRIBUTO_PODER_DIRETO ? PROPRIEDADES_PODER_DIRETO : getPropriedadesDoAtributo(atributo);
}

// { nome, atributo, propriedade, valor } válido ou null.
export function normalizarEfeitoEntropia(e) {
    if (!e || typeof e !== 'object') return null;
    const atributo = String(e.atributo ?? '').trim().toLowerCase() === 'energiaesp' ? 'energiaEsp' : String(e.atributo ?? '').trim();
    if (!ATRIBUTOS_ENTROPIA.includes(atributo)) return null;
    const permitidas = propriedadesDoEfeito(atributo);
    const prop = String(e.propriedade ?? '').trim();
    const propriedade = permitidas.includes(prop) ? prop : permitidas[0];
    const nome = texto(e.nome, LIMITES_ENTROPIA.nome);
    if (atributo === ATRIBUTO_DANO_DADOS) {
        const dado = normalizarValorDanoDados(dadoDoEfeito(e));
        return dado ? { nome, atributo, propriedade: 'base', valor: dado } : null;
    }
    const bruto = parseFloat(String(e.valor ?? '').replace(',', '.'));
    if (!Number.isFinite(bruto)) return null;
    return { nome, atributo, propriedade, valor: Math.round(bruto * 1000) / 1000 };
}

export function normalizarEntropia(e) {
    const b = e && typeof e === 'object' ? e : {};
    return {
        id: idValido(b.id) ? String(b.id) : gerarIdEntropia(),
        nome: texto(b.nome, LIMITES_ENTROPIA.nome) || 'Entropia sem nome',
        descricao: texto(b.descricao, LIMITES_ENTROPIA.descricao),
        ativa: b.ativa === true,
        oculta: b.oculta === true,
        efeitos: (Array.isArray(b.efeitos) ? b.efeitos : []).map(normalizarEfeitoEntropia).filter(Boolean).slice(0, LIMITES_ENTROPIA.efeitos),
    };
}

export function entropiasDaFicha(ficha) {
    const lista = ficha && Array.isArray(ficha.entropias) ? ficha.entropias : [];
    return lista.filter(x => x && typeof x === 'object').slice(0, LIMITES_ENTROPIA.entropias).map(normalizarEntropia);
}

export const entropiasAtivas = (ficha) => entropiasDaFicha(ficha).filter(x => x.ativa);

// Entropias que o DONO da ficha pode ver (as ocultas ficam só com o Mestre).
export const entropiasVisiveis = (ficha) => entropiasAtivas(ficha).filter(x => !x.oculta);

// Efeitos das Entropias ligadas, no formato dos demais efeitos da ficha.
export function efeitosDaEntropia(ficha) {
    if (!ficha || !Array.isArray(ficha.entropias) || ficha.entropias.length === 0) return [];
    // Entropia oculta: nome neutro, pra o nome dela (ou dos efeitos) não vazar nas telas que listam a origem dos buffs.
    return entropiasAtivas(ficha).flatMap(en => en.efeitos.map(ef => ({ ...ef, nome: en.oculta ? 'Entropia' : (ef.nome || `Entropia: ${en.nome}`) })));
}

export function descreverEfeitoEntropia(ef) {
    if (!ef) return '';
    if (ef.atributo === ATRIBUTO_DANO_DADOS) return `dado de dano +${ef.valor}`;
    const sinal = Number(ef.valor) > 0 ? '+' : '';
    return `${String(ef.atributo).replace(/_/g, ' ')} (${ef.propriedade}) ${sinal}${ef.valor}`;
}

// Limpa a lista de Entropias de um rascunho de ficha (muta o rascunho Immer): aplica a normalização e o limite.
export function gravarEntropias(ficha, lista) {
    ficha.entropias = (Array.isArray(lista) ? lista : []).map(normalizarEntropia).slice(0, LIMITES_ENTROPIA.entropias);
}
