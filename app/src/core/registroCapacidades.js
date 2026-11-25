// ==========================================
// 📚 REGISTRO DE CAPACIDADES (Compêndio) — o catálogo de tudo que existe nas fichas da mesa: Habilidades, Formas, Poderes, Infinities,
// Técnicas elementais, Magias etc. Ele é DERIVADO das fichas (nada é duplicado nem fica desatualizado). Serve para um personagem
// que copiou/aprendeu algo "por conta própria" pedir a capacidade ao Mestre, que aprova (o jogador então recebe uma oferta de
// ensinamento comum, que ele aceita como qualquer outra).
//
// O que fica no Firebase (mesas/<mesa>/registro):
//   liberacoes/<chave> = { todos: true } | { para: { <Jogador>: true } }  — quem enxerga o item (o Mestre/Co-Mestre vê tudo)
//   pedidos/<id>       = { id, de, chave, ts }                             — pedidos pendentes de aprovação
// Módulo puro: nada aqui fala com Firebase nem com a tela.
// ==========================================
import { categoriaDoPoderFicha, infoCategoriaPoder, poderEhCopiavel } from './categoriasPoder.js';

export const TIPO_REGISTRO_PODER = 'poder';
export const TIPO_REGISTRO_TECNICA = 'tecnica';
export const LIMITE_PEDIDOS_POR_JOGADOR = 20;

// Chave segura pro Firebase (sem . # $ [ ] /).
const limpar = (v) => String(v ?? '').replace(/[.#$[\]/]/g, '_').trim();
const idValido = (v) => /^[A-Za-z0-9_-]{1,60}$/.test(String(v ?? '')) && !(String(v) in Object.prototype);

// Sem id, a chave usa o NOME (nunca a posição na lista: apagar ou reordenar não pode passar a liberação pra outro item).
// `ordinal` desempata nomes repetidos do mesmo dono (1 = primeiro).
export function chaveDaCapacidade(dono, tipo, item, ordinal = 1) {
    const base = item && item.id != null && String(item.id).trim() !== '' ? item.id : `${limpar(item && item.nome)}${ordinal > 1 ? `_${ordinal}` : ''}`;
    return limpar(`${limpar(dono)}__${tipo}__${base}`);
}

// Lista tudo o que existe nas fichas: [{ chave, dono, ehNpc, tipo, categoria, rotuloCategoria, nome, descricao, copiavel, item }].
export function indexarCapacidades(personagens) {
    const saida = [];
    Object.keys(personagens || {}).forEach((dono) => {
        const ficha = personagens[dono];
        if (!ficha || typeof ficha !== 'object') return;
        const ehNpc = !!(ficha.isNPC || (ficha.bio && ficha.bio.mesa === 'npc'));
        const adicionar = (lista, tipo) => {
            if (!Array.isArray(lista)) return;
            const vistos = {};
            lista.forEach((item) => {
                if (!item || typeof item !== 'object' || !String(item.nome || '').trim()) return;
                const nomeBase = `${tipo}:${String(item.nome).trim()}`;
                vistos[nomeBase] = (vistos[nomeBase] || 0) + 1;
                const categoria = tipo === TIPO_REGISTRO_PODER ? categoriaDoPoderFicha(item) : 'tecnica';
                saida.push({
                    chave: chaveDaCapacidade(dono, tipo, item, vistos[nomeBase]),
                    dono, ehNpc, tipo, categoria,
                    rotuloCategoria: tipo === TIPO_REGISTRO_PODER ? (infoCategoriaPoder(categoria).nome || infoCategoriaPoder(categoria).rotulo || categoria) : 'Técnica elemental',
                    nome: String(item.nome).trim(),
                    descricao: String(item.descricao || item.desc || '').slice(0, 600),
                    copiavel: tipo === TIPO_REGISTRO_TECNICA ? true : poderEhCopiavel(item),
                    item,
                });
            });
        };
        adicionar(ficha.poderes, TIPO_REGISTRO_PODER);
        adicionar(ficha.ataquesElementais, TIPO_REGISTRO_TECNICA);
    });
    return saida;
}

// Quem enxerga o item: o Mestre vê tudo; o jogador só o que foi liberado a ele (ou a todos).
export function jogadorVeCapacidade(liberacoes, chave, jogador) {
    const l = liberacoes && liberacoes[chave];
    if (!l || typeof l !== 'object') return false;
    if (l.todos === true) return true;
    return !!(l.para && typeof l.para === 'object' && l.para[limpar(jogador)] === true);
}

export function liberacaoDe(liberacoes, chave) {
    const l = liberacoes && liberacoes[chave];
    if (!l || typeof l !== 'object') return { todos: false, para: [] };
    return { todos: l.todos === true, para: l.para && typeof l.para === 'object' ? Object.keys(l.para).filter(k => l.para[k] === true) : [] };
}

// Nova liberação ({ todos, para: [nomes] }) → valor a gravar (null = remover a liberação).
export function montarLiberacao({ todos, para }) {
    if (todos === true) return { todos: true };
    const nomes = (Array.isArray(para) ? para : []).map(limpar).filter(Boolean);
    if (nomes.length === 0) return null;
    return { para: Object.fromEntries(nomes.map(n => [n, true])) };
}

// Pedido válido ou null.
export function montarPedido({ de, chave, agora = Date.now(), sorteio = Math.random }) {
    const quem = limpar(de);
    const alvo = limpar(chave);
    if (!quem || !alvo) return null;
    const id = `ped_${agora}_${Math.floor(sorteio() * 1e6)}`;
    return { id, de: quem, chave: alvo, ts: agora };
}

export function pedidosPendentes(pedidos) {
    if (!pedidos || typeof pedidos !== 'object') return [];
    return Object.keys(pedidos)
        .map(id => pedidos[id])
        .filter(p => p && typeof p === 'object' && idValido(p.id) && p.de && p.chave)
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

export const jaPediu = (pedidos, jogador, chave) => pedidosPendentes(pedidos).some(p => p.de === limpar(jogador) && p.chave === chave);
export const totalPedidosDe = (pedidos, jogador) => pedidosPendentes(pedidos).filter(p => p.de === limpar(jogador)).length;

// O jogador já tem algo com esse nome (mesma categoria/tipo)? Evita pedir o que já possui.
export function jogadorJaTem(ficha, capacidade) {
    if (!ficha || !capacidade) return false;
    const lista = capacidade.tipo === TIPO_REGISTRO_TECNICA ? ficha.ataquesElementais : ficha.poderes;
    const nome = capacidade.nome.toLowerCase();
    return Array.isArray(lista) && lista.some(i => i && String(i.nome || '').trim().toLowerCase() === nome);
}

// Filtro de busca (nome, dono, categoria).
export function filtrarCapacidades(lista, busca) {
    const t = String(busca || '').trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(c => c.nome.toLowerCase().includes(t) || c.dono.toLowerCase().includes(t) || String(c.rotuloCategoria).toLowerCase().includes(t));
}
