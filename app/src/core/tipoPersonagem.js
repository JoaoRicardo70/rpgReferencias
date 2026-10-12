// ==========================================
// 🧑/👹 TIPO DE PERSONAGEM — a distinção sistemática entre personagem JOGADOR e personagem NPC.
// Um NPC é uma ficha marcada com isNPC (criada pelo Mestre) ou com bio.mesa === 'npc' (a mesma
// regra do Visor de Entidades e da Gaveta de Tokens). Todo o resto do app deve perguntar aqui,
// em vez de repetir a checagem em cada tela.
// ==========================================

export const TIPO_JOGADOR = 'jogador';
export const TIPO_NPC = 'npc';

export function ehNpc(ficha) {
    return !!(ficha && (ficha.isNPC || (ficha.bio && ficha.bio.mesa === 'npc')));
}

export function getTipoPersonagem(ficha) {
    return ehNpc(ficha) ? TIPO_NPC : TIPO_JOGADOR;
}

// Rótulo com ícone pra listas e selects ("👹 NPC" / "🧑 Jogador").
export function rotuloTipoPersonagem(ficha) {
    return ehNpc(ficha) ? '👹 NPC' : '🧑 Jogador';
}

// Só o ícone ("👹" / "🧑").
export function iconeTipoPersonagem(ficha) {
    return ehNpc(ficha) ? '👹' : '🧑';
}
