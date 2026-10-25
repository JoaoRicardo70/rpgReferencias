// ==========================================
// 🎭 TROCA RÁPIDA DE PERSONAGEM (Mestre) — lógica pura.
// O Mestre conduz vários NPCs: em vez de sair da ficha e digitar o nome de cada um, ele abre a lista
// da mesa (NPCs em cima, jogadores embaixo, recentes à parte) e troca num clique.
// ==========================================
import { ehNpc } from './tipoPersonagem.js';

export const MAX_RECENTES = 6;

function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Monta a lista de quem o Mestre pode controlar: { npcs, jogadores }, cada item { nome, ficha, npc }.
// Ignora o personagem atual e entradas sem ficha válida; filtra pela busca (sem acento, sem caixa).
export function listarPersonagensParaTroca(personagens, nomeAtual, busca = '') {
    const termo = semAcento(busca).trim();
    const npcs = [];
    const jogadores = [];
    Object.entries(personagens || {}).forEach(([nome, ficha]) => {
        if (!nome || !ficha || typeof ficha !== 'object') return;
        if (nome === nomeAtual) return;
        if (termo && !semAcento(nome).includes(termo)) return;
        const item = { nome, ficha, npc: ehNpc(ficha) };
        (item.npc ? npcs : jogadores).push(item);
    });
    const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    return { npcs: npcs.sort(porNome), jogadores: jogadores.sort(porNome) };
}

// Atualiza a lista de recentes: o escolhido vai pro começo, sem repetir, limitado a MAX_RECENTES.
export function registrarRecente(recentes, nome) {
    const base = Array.isArray(recentes) ? recentes.filter(n => typeof n === 'string' && n !== nome) : [];
    return [nome, ...base].slice(0, MAX_RECENTES);
}

// Recentes que ainda existem na mesa (e não são o personagem atual), na ordem de uso.
export function recentesValidos(recentes, personagens, nomeAtual) {
    if (!Array.isArray(recentes)) return [];
    return recentes.filter(n => n !== nomeAtual && personagens && personagens[n] && typeof personagens[n] === 'object');
}

// ==========================================
// 🤝 NPC COMPARTILHADO — o Mestre pode liberar um NPC (ficha com `acessoJogadores`) para jogadores específicos, em casos
// especiais (um NPC colado no personagem do jogador, um pet...). Quem foi liberado enxerga o NPC na troca rápida e age como ele.
// ==========================================

const nomeSeguro = (n) => (!n ? '' : String(n).replace(/[.#$[\]/]/g, '_').trim());

// Nomes (sanitizados) dos jogadores liberados num NPC. O Firebase devolve lista como array ou como objeto indexado.
export function nomesComAcessoAoNpc(ficha) {
    const bruto = ficha && ficha.acessoJogadores;
    const lista = Array.isArray(bruto) ? bruto : (bruto && typeof bruto === 'object' ? Object.values(bruto) : []);
    return lista.filter(n => typeof n === 'string' && n).map(nomeSeguro);
}

// NPCs da mesa liberados para este jogador: [{ nome, ficha }] em ordem alfabética.
export function npcsLiberadosParaJogador(personagens, meuNome) {
    const eu = nomeSeguro(meuNome);
    if (!eu) return [];
    return Object.entries(personagens || {})
        .filter(([nome, ficha]) => nome && ficha && typeof ficha === 'object' && ehNpc(ficha) && nomesComAcessoAoNpc(ficha).includes(eu))
        .map(([nome, ficha]) => ({ nome, ficha }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Marca/desmarca um nome numa lista (sem repetir).
export function alternarNomeNaLista(lista, nome) {
    const base = Array.isArray(lista) ? lista : [];
    return base.includes(nome) ? base.filter(n => n !== nome) : [...base, nome];
}

// Nomes dos personagens JOGADORES da mesa (sem NPCs), em ordem alfabética.
export function jogadoresDaMesa(personagens) {
    return Object.entries(personagens || {})
        .filter(([nome, ficha]) => nome && ficha && typeof ficha === 'object' && !ehNpc(ficha))
        .map(([nome]) => nome)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
