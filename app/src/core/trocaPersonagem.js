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
